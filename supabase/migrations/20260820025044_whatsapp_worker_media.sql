alter table public.service_attachments
  add column external_media_id text,
  add column retention_until timestamptz not null default (now() + interval '30 days'),
  add column attempt_count integer not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column last_error_code text;

alter table public.service_attachments
  drop constraint service_attachments_status_check,
  add constraint service_attachments_status_check
    check (status in ('pending', 'processing', 'failed', 'available', 'rejected', 'expired')),
  add constraint service_attachments_external_media_id_check
    check (external_media_id is null or btrim(external_media_id) <> ''),
  add constraint service_attachments_attempt_count_check
    check (attempt_count between 0 and 3),
  add constraint service_attachments_last_error_code_check
    check (
      last_error_code is null
      or last_error_code ~ '^[a-z0-9_.-]{1,80}$'
    );

create unique index service_attachments_external_media_id_uidx
  on public.service_attachments (external_media_id)
  where external_media_id is not null;

create index service_attachments_media_pending_idx
  on public.service_attachments (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index service_attachments_retention_idx
  on public.service_attachments (retention_until)
  where status = 'available';

create or replace function public.claim_whatsapp_outbox(
  p_limit integer default 10,
  p_max_attempts integer default 3
)
returns table (
  outbox_id uuid,
  message_id uuid,
  recipient text,
  body text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_limit not between 1 and 50 or p_max_attempts not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Invalid worker limits';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.integration_outbox as outbox
    where outbox.destination = 'meta_whatsapp'
      and outbox.event_type = 'whatsapp.message.send'
      and outbox.attempt_count < p_max_attempts
      and outbox.next_attempt_at <= pg_catalog.clock_timestamp()
      and (
        outbox.status in ('pending', 'failed')
        or (
          outbox.status = 'processing'
          and outbox.updated_at < pg_catalog.clock_timestamp() - interval '5 minutes'
        )
      )
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.integration_outbox as outbox
    set status = 'processing',
        attempt_count = outbox.attempt_count + 1,
        last_error_code = null,
        updated_at = pg_catalog.clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.aggregate_id, outbox.attempt_count
  )
  select
    claimed.id,
    message.id,
    channel.channel_address,
    message.body,
    claimed.attempt_count
  from claimed
  join public.service_messages as message
    on message.id = claimed.aggregate_id
   and message.direction = 'outbound'
   and message.message_type = 'text'
  join public.service_conversations as conversation
    on conversation.id = message.conversation_id
  join public.customer_channels as channel
    on channel.id = conversation.customer_channel_id
   and channel.channel_type = 'whatsapp';
end;
$$;

create or replace function public.complete_whatsapp_outbox(
  p_outbox_id uuid,
  p_external_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_outbox public.integration_outbox%rowtype;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_external_message_id is not null and btrim(p_external_message_id) = '' then
    raise exception using errcode = '22023', message = 'External message id cannot be blank';
  end if;

  select * into selected_outbox
  from public.integration_outbox
  where id = p_outbox_id
    and destination = 'meta_whatsapp'
    and event_type = 'whatsapp.message.send'
  for update;

  if selected_outbox.id is null then
    raise exception using errcode = '22023', message = 'Outbox item not found';
  end if;
  if selected_outbox.status = 'sent' then return true; end if;
  if selected_outbox.status <> 'processing' then
    raise exception using errcode = '55000', message = 'Outbox item is not claimed';
  end if;

  update public.integration_outbox
  set status = 'sent', processed_at = pg_catalog.clock_timestamp(),
      last_error_code = null, updated_at = pg_catalog.clock_timestamp()
  where id = selected_outbox.id;

  update public.service_messages
  set delivery_status = 'sent',
      external_message_id = coalesce(nullif(btrim(p_external_message_id), ''), external_message_id),
      updated_at = pg_catalog.clock_timestamp()
  where id = selected_outbox.aggregate_id;
  return true;
end;
$$;

create or replace function public.fail_whatsapp_outbox(
  p_outbox_id uuid,
  p_error_code text,
  p_retryable boolean default true,
  p_max_attempts integer default 3
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_outbox public.integration_outbox%rowtype;
  resolved_status text;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,80}$'
    or p_max_attempts not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Invalid failure metadata';
  end if;

  select * into selected_outbox
  from public.integration_outbox
  where id = p_outbox_id
    and destination = 'meta_whatsapp'
    and event_type = 'whatsapp.message.send'
  for update;
  if selected_outbox.id is null then
    raise exception using errcode = '22023', message = 'Outbox item not found';
  end if;
  if selected_outbox.status in ('sent', 'dead_letter') then
    return selected_outbox.status;
  end if;
  if selected_outbox.status <> 'processing' then
    raise exception using errcode = '55000', message = 'Outbox item is not claimed';
  end if;

  resolved_status := case
    when not p_retryable or selected_outbox.attempt_count >= p_max_attempts then 'dead_letter'
    else 'failed'
  end;
  update public.integration_outbox
  set status = resolved_status,
      last_error_code = p_error_code,
      next_attempt_at = case when resolved_status = 'failed'
        then pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => least(60, (2 ^ attempt_count)::integer))
        else next_attempt_at end,
      processed_at = case when resolved_status = 'dead_letter' then pg_catalog.clock_timestamp() else null end,
      updated_at = pg_catalog.clock_timestamp()
  where id = selected_outbox.id;
  update public.service_messages
  set delivery_status = case when resolved_status = 'dead_letter' then 'failed' else 'queued' end,
      updated_at = pg_catalog.clock_timestamp()
  where id = selected_outbox.aggregate_id;
  return resolved_status;
end;
$$;

create or replace function public.claim_whatsapp_media(
  p_limit integer default 10,
  p_max_attempts integer default 3
)
returns table (
  attachment_id uuid,
  external_media_id text,
  media_type text,
  declared_mime_type text,
  storage_bucket text,
  storage_path text,
  attempt_count integer,
  retention_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_limit not between 1 and 50 or p_max_attempts not between 1 and 3 then
    raise exception using errcode = '22023', message = 'Invalid worker limits';
  end if;

  insert into public.service_attachments (
    id, conversation_id, message_id, storage_path, media_type,
    declared_mime_type, external_media_id, visibility, status
  )
  select
    source.attachment_id,
    message.conversation_id,
    message.id,
    pg_catalog.concat('whatsapp/', message.id::text, '/', source.attachment_id::text),
    message.message_type,
    nullif(message.sanitized_metadata ->> 'mime_type', ''),
    message.sanitized_metadata ->> 'media_id',
    'operations',
    'pending'
  from public.service_messages as message
  cross join lateral (select gen_random_uuid() as attachment_id) as source
  where message.direction = 'inbound'
    and message.message_type in ('image', 'video', 'audio', 'document')
    and nullif(message.sanitized_metadata ->> 'media_id', '') is not null
    and not exists (
      select 1 from public.service_attachments as existing
      where existing.external_media_id = message.sanitized_metadata ->> 'media_id'
    )
  on conflict do nothing;

  return query
  with candidates as (
    select attachment.id
    from public.service_attachments as attachment
    where attachment.external_media_id is not null
      and attachment.attempt_count < p_max_attempts
      and attachment.next_attempt_at <= pg_catalog.clock_timestamp()
      and (
        attachment.status in ('pending', 'failed')
        or (
          attachment.status = 'processing'
          and attachment.updated_at < pg_catalog.clock_timestamp() - interval '5 minutes'
        )
      )
    order by attachment.next_attempt_at, attachment.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.service_attachments as attachment
    set status = 'processing',
        attempt_count = attachment.attempt_count + 1,
        last_error_code = null,
        updated_at = pg_catalog.clock_timestamp()
    from candidates
    where attachment.id = candidates.id
    returning attachment.*
  )
  select claimed.id, claimed.external_media_id, claimed.media_type,
    claimed.declared_mime_type, claimed.storage_bucket, claimed.storage_path,
    claimed.attempt_count, claimed.retention_until
  from claimed;
end;
$$;

create or replace function public.complete_whatsapp_media(
  p_attachment_id uuid,
  p_detected_mime_type text,
  p_size_bytes bigint,
  p_checksum_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_status text;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_detected_mime_type not in (
      'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
      'audio/mpeg', 'audio/ogg', 'application/pdf'
    ) or p_size_bytes not between 1 and 26214400
    or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid media verification';
  end if;

  select status into selected_status
  from public.service_attachments where id = p_attachment_id for update;
  if selected_status is null then
    raise exception using errcode = '22023', message = 'Attachment not found';
  end if;
  if selected_status = 'available' then return true; end if;
  if selected_status <> 'processing' then
    raise exception using errcode = '55000', message = 'Attachment is not claimed';
  end if;
  update public.service_attachments
  set detected_mime_type = p_detected_mime_type,
      size_bytes = p_size_bytes,
      checksum_sha256 = p_checksum_sha256,
      status = 'available', last_error_code = null,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_attachment_id;
  return true;
end;
$$;

create or replace function public.fail_whatsapp_media(
  p_attachment_id uuid,
  p_error_code text,
  p_retryable boolean default true,
  p_max_attempts integer default 3
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_attachment public.service_attachments%rowtype;
  resolved_status text;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,80}$'
    or p_max_attempts not between 1 and 3 then
    raise exception using errcode = '22023', message = 'Invalid failure metadata';
  end if;
  select * into selected_attachment
  from public.service_attachments where id = p_attachment_id for update;
  if selected_attachment.id is null then
    raise exception using errcode = '22023', message = 'Attachment not found';
  end if;
  if selected_attachment.status in ('available', 'rejected', 'expired') then
    return selected_attachment.status;
  end if;
  if selected_attachment.status <> 'processing' then
    raise exception using errcode = '55000', message = 'Attachment is not claimed';
  end if;
  resolved_status := case
    when not p_retryable or selected_attachment.attempt_count >= p_max_attempts then 'rejected'
    else 'failed'
  end;
  update public.service_attachments
  set status = resolved_status,
      last_error_code = p_error_code,
      next_attempt_at = case when resolved_status = 'failed'
        then pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => least(60, (2 ^ attempt_count)::integer))
        else next_attempt_at end,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_attachment_id;
  return resolved_status;
end;
$$;

revoke execute on function public.claim_whatsapp_outbox(integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_whatsapp_outbox(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_whatsapp_outbox(uuid, text, boolean, integer) from public, anon, authenticated;
revoke execute on function public.claim_whatsapp_media(integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_whatsapp_media(uuid, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.fail_whatsapp_media(uuid, text, boolean, integer) from public, anon, authenticated;

grant execute on function public.claim_whatsapp_outbox(integer, integer) to service_role;
grant execute on function public.complete_whatsapp_outbox(uuid, text) to service_role;
grant execute on function public.fail_whatsapp_outbox(uuid, text, boolean, integer) to service_role;
grant execute on function public.claim_whatsapp_media(integer, integer) to service_role;
grant execute on function public.complete_whatsapp_media(uuid, text, bigint, text) to service_role;
grant execute on function public.fail_whatsapp_media(uuid, text, boolean, integer) to service_role;
grant select on table public.service_messages to service_role;
grant select, update on table public.service_attachments to service_role;
