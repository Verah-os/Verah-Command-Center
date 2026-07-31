create table public.service_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.customers(id)
    on delete restrict,
  customer_channel_id uuid
    references public.customer_channels(id)
    on delete set null,
  service_request_id uuid
    references public.service_requests(id)
    on delete set null,
  channel_type text not null default 'whatsapp',
  external_conversation_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_conversations_channel_type_check
    check (channel_type in ('app', 'whatsapp')),
  constraint service_conversations_status_check
    check (status in ('open', 'closed')),
  constraint service_conversations_external_id_not_blank_check
    check (
      external_conversation_id is null
      or btrim(external_conversation_id) <> ''
    )
);

create index service_conversations_customer_id_idx
  on public.service_conversations (customer_id);
create index service_conversations_customer_channel_id_idx
  on public.service_conversations (customer_channel_id)
  where customer_channel_id is not null;
create index service_conversations_service_request_id_idx
  on public.service_conversations (service_request_id)
  where service_request_id is not null;
create unique index service_conversations_open_channel_uidx
  on public.service_conversations (customer_channel_id, channel_type)
  where status = 'open' and customer_channel_id is not null;
create unique index service_conversations_external_id_uidx
  on public.service_conversations (channel_type, external_conversation_id)
  where external_conversation_id is not null;

create table public.service_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.service_conversations(id)
    on delete cascade,
  direction text not null,
  sender_role text not null,
  message_type text not null default 'text',
  body text,
  external_message_id text,
  idempotency_key text not null,
  delivery_status text not null,
  provider_timestamp timestamptz,
  reply_to_message_id uuid
    references public.service_messages(id)
    on delete set null,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint service_messages_sender_role_check
    check (sender_role in ('customer', 'concierge', 'provider', 'admin', 'system')),
  constraint service_messages_type_check
    check (message_type in ('text', 'image', 'video', 'audio', 'document', 'interactive')),
  constraint service_messages_delivery_status_check
    check (delivery_status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  constraint service_messages_body_length_check
    check (body is null or char_length(body) <= 10000),
  constraint service_messages_external_id_not_blank_check
    check (external_message_id is null or btrim(external_message_id) <> ''),
  constraint service_messages_idempotency_key_not_blank_check
    check (btrim(idempotency_key) <> ''),
  constraint service_messages_metadata_object_check
    check (jsonb_typeof(sanitized_metadata) = 'object')
);

create index service_messages_conversation_created_at_idx
  on public.service_messages (conversation_id, created_at);
create index service_messages_reply_to_message_id_idx
  on public.service_messages (reply_to_message_id)
  where reply_to_message_id is not null;
create unique index service_messages_external_id_uidx
  on public.service_messages (external_message_id)
  where external_message_id is not null;
create unique index service_messages_idempotency_key_uidx
  on public.service_messages (idempotency_key);

create table public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null
    references public.service_requests(id)
    on delete restrict,
  message_id uuid
    references public.service_messages(id)
    on delete set null,
  event_type text not null,
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  actor_role text not null,
  channel text not null,
  audience text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint service_request_events_event_type_not_blank_check
    check (btrim(event_type) <> ''),
  constraint service_request_events_actor_role_check
    check (actor_role in ('customer', 'concierge', 'provider', 'admin', 'system')),
  constraint service_request_events_channel_check
    check (channel in ('app', 'whatsapp', 'system')),
  constraint service_request_events_audience_check
    check (audience in ('customer', 'provider', 'operations', 'all')),
  constraint service_request_events_idempotency_key_not_blank_check
    check (btrim(idempotency_key) <> ''),
  constraint service_request_events_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create index service_request_events_request_created_at_idx
  on public.service_request_events (service_request_id, created_at);
create index service_request_events_message_id_idx
  on public.service_request_events (message_id)
  where message_id is not null;
create index service_request_events_actor_user_id_idx
  on public.service_request_events (actor_user_id)
  where actor_user_id is not null;
create unique index service_request_events_idempotency_key_uidx
  on public.service_request_events (idempotency_key);

create table public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  destination text not null,
  payload jsonb not null,
  idempotency_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint integration_outbox_aggregate_type_not_blank_check
    check (btrim(aggregate_type) <> ''),
  constraint integration_outbox_event_type_not_blank_check
    check (btrim(event_type) <> ''),
  constraint integration_outbox_destination_check
    check (destination in ('meta_whatsapp', 'n8n')),
  constraint integration_outbox_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint integration_outbox_idempotency_key_not_blank_check
    check (btrim(idempotency_key) <> ''),
  constraint integration_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  constraint integration_outbox_attempt_count_check
    check (attempt_count >= 0),
  constraint integration_outbox_last_error_code_not_blank_check
    check (last_error_code is null or btrim(last_error_code) <> '')
);

create unique index integration_outbox_idempotency_key_uidx
  on public.integration_outbox (idempotency_key);
create index integration_outbox_pending_idx
  on public.integration_outbox (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create table public.service_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid
    references public.service_conversations(id)
    on delete cascade,
  message_id uuid
    references public.service_messages(id)
    on delete set null,
  service_request_id uuid
    references public.service_requests(id)
    on delete set null,
  storage_bucket text not null default 'service-attachments',
  storage_path text not null,
  media_type text not null,
  declared_mime_type text,
  detected_mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  visibility text not null default 'operations',
  status text not null default 'pending',
  created_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_attachments_parent_check
    check (conversation_id is not null or service_request_id is not null),
  constraint service_attachments_bucket_check
    check (storage_bucket = 'service-attachments'),
  constraint service_attachments_storage_path_check
    check (
      btrim(storage_path) <> ''
      and storage_path !~ '(^|/)\.\.?(/|$)'
    ),
  constraint service_attachments_media_type_check
    check (media_type in ('image', 'video', 'audio', 'document')),
  constraint service_attachments_size_bytes_check
    check (size_bytes is null or size_bytes between 0 and 26214400),
  constraint service_attachments_checksum_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint service_attachments_visibility_check
    check (visibility in ('customer', 'provider', 'operations', 'all')),
  constraint service_attachments_status_check
    check (status in ('pending', 'available', 'rejected'))
);

create unique index service_attachments_storage_object_uidx
  on public.service_attachments (storage_bucket, storage_path);
create index service_attachments_conversation_id_idx
  on public.service_attachments (conversation_id)
  where conversation_id is not null;
create index service_attachments_service_request_id_idx
  on public.service_attachments (service_request_id)
  where service_request_id is not null;
create index service_attachments_message_id_idx
  on public.service_attachments (message_id)
  where message_id is not null;
create index service_attachments_created_by_idx
  on public.service_attachments (created_by)
  where created_by is not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'service-attachments',
  'service-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'audio/mpeg',
    'audio/ogg',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

alter table public.service_conversations enable row level security;
alter table public.service_messages enable row level security;
alter table public.service_request_events enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.service_attachments enable row level security;

revoke all on table public.service_conversations from public, anon, authenticated;
revoke all on table public.service_messages from public, anon, authenticated;
revoke all on table public.service_request_events from public, anon, authenticated;
revoke all on table public.integration_outbox from public, anon, authenticated;
revoke all on table public.service_attachments from public, anon, authenticated;

grant select on table public.service_conversations to authenticated;
grant select on table public.service_messages to authenticated;
grant select on table public.service_request_events to authenticated;
grant select on table public.service_attachments to authenticated;

create policy "Customers read own conversations"
  on public.service_conversations
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and customer_id = (select private.current_customer_id())
  );

create policy "Operations read conversations"
  on public.service_conversations
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Customers read own messages"
  on public.service_messages
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.service_conversations as conversation
      where conversation.id = service_messages.conversation_id
        and conversation.customer_id = (select private.current_customer_id())
    )
  );

create policy "Operations read messages"
  on public.service_messages
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Customers read own request events"
  on public.service_request_events
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and audience in ('customer', 'all')
    and exists (
      select 1
      from public.service_requests as request
      where request.id = service_request_events.service_request_id
        and request.created_by = (select auth.uid())
    )
  );

create policy "Providers read assigned request events"
  on public.service_request_events
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and audience in ('provider', 'all')
    and exists (
      select 1
      from public.service_requests as request
      where request.id = service_request_events.service_request_id
        and request.provider_id = (select public.current_verah_provider_id())
    )
  );

create policy "Operations read request events"
  on public.service_request_events
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Customers read own attachments"
  on public.service_attachments
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and visibility in ('customer', 'all')
    and (
      exists (
        select 1
        from public.service_conversations as conversation
        where conversation.id = service_attachments.conversation_id
          and conversation.customer_id = (select private.current_customer_id())
      )
      or exists (
        select 1
        from public.service_requests as request
        where request.id = service_attachments.service_request_id
          and request.created_by = (select auth.uid())
      )
    )
  );

create policy "Providers read assigned attachments"
  on public.service_attachments
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and visibility in ('provider', 'all')
    and exists (
      select 1
      from public.service_requests as request
      where request.id = service_attachments.service_request_id
        and request.provider_id = (select public.current_verah_provider_id())
    )
  );

create policy "Operations read attachments"
  on public.service_attachments
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Authorized users read service attachment objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'service-attachments'
    and exists (
      select 1
      from public.service_attachments as attachment
      where attachment.storage_bucket = storage.objects.bucket_id
        and attachment.storage_path = storage.objects.name
    )
  );

create or replace function private.reject_service_request_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Service request events are immutable';
end;
$$;

revoke execute on function private.reject_service_request_event_mutation()
  from public, anon, authenticated, service_role;

create trigger service_request_events_immutable
before update or delete on public.service_request_events
for each row execute function private.reject_service_request_event_mutation();

create or replace function public.persist_whatsapp_inbound_message(
  p_phone text,
  p_external_message_id text,
  p_message_type text,
  p_body text default null,
  p_provider_timestamp timestamptz default null,
  p_sanitized_metadata jsonb default '{}'::jsonb
)
returns table (
  conversation_id uuid,
  message_id uuid,
  created boolean
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
  normalized_phone text;
  resolved_customer_id uuid;
  resolved_channel_id uuid;
  resolved_conversation_id uuid;
  resolved_message_id uuid;
  resolved_service_request_id uuid;
  was_created boolean := false;
begin
  if request_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Server-side authorization required';
  end if;

  normalized_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_phone),
    '[[:space:]().-]',
    '',
    'g'
  );

  if normalized_phone is null
    or normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using
      errcode = '22023',
      message = 'A valid E.164 phone number is required';
  end if;

  if p_external_message_id is null or pg_catalog.btrim(p_external_message_id) = '' then
    raise exception using
      errcode = '22023',
      message = 'External message id is required';
  end if;

  if p_message_type is null
    or p_message_type not in ('text', 'image', 'video', 'audio', 'document', 'interactive') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported message type';
  end if;

  if p_body is not null and pg_catalog.char_length(p_body) > 10000 then
    raise exception using
      errcode = '22023',
      message = 'Message body exceeds the allowed size';
  end if;

  if p_sanitized_metadata is null
    or pg_catalog.jsonb_typeof(p_sanitized_metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Sanitized metadata must be a JSON object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('whatsapp-inbound:', pg_catalog.btrim(p_external_message_id)),
      0
    )
  );

  select message.conversation_id, message.id
  into resolved_conversation_id, resolved_message_id
  from public.service_messages as message
  where message.external_message_id = pg_catalog.btrim(p_external_message_id);

  if resolved_message_id is not null then
    return query
      select resolved_conversation_id, resolved_message_id, false;
    return;
  end if;

  resolved_customer_id := public.resolve_or_create_whatsapp_customer(
    normalized_phone,
    null
  );

  select channel.id
  into resolved_channel_id
  from public.customer_channels as channel
  where channel.customer_id = resolved_customer_id
    and channel.channel_type = 'whatsapp'
    and channel.channel_address = normalized_phone;

  select conversation.id
  into resolved_conversation_id
  from public.service_conversations as conversation
  where conversation.customer_channel_id = resolved_channel_id
    and conversation.channel_type = 'whatsapp'
    and conversation.status = 'open';

  if resolved_conversation_id is null then
    insert into public.service_conversations (
      customer_id,
      customer_channel_id,
      channel_type
    )
    values (
      resolved_customer_id,
      resolved_channel_id,
      'whatsapp'
    )
    on conflict (customer_channel_id, channel_type)
      where status = 'open' and customer_channel_id is not null
      do nothing
    returning id into resolved_conversation_id;

    if resolved_conversation_id is null then
      select conversation.id
      into resolved_conversation_id
      from public.service_conversations as conversation
      where conversation.customer_channel_id = resolved_channel_id
        and conversation.channel_type = 'whatsapp'
        and conversation.status = 'open';
    end if;
  end if;

  insert into public.service_messages (
    conversation_id,
    direction,
    sender_role,
    message_type,
    body,
    external_message_id,
    idempotency_key,
    delivery_status,
    provider_timestamp,
    sanitized_metadata
  )
  values (
    resolved_conversation_id,
    'inbound',
    'customer',
    p_message_type,
    p_body,
    pg_catalog.btrim(p_external_message_id),
    pg_catalog.concat('meta:inbound:', pg_catalog.btrim(p_external_message_id)),
    'received',
    p_provider_timestamp,
    p_sanitized_metadata
  )
  on conflict (external_message_id)
    where external_message_id is not null
    do nothing
  returning id into resolved_message_id;

  was_created := resolved_message_id is not null;

  if resolved_message_id is null then
    select message.conversation_id, message.id
    into resolved_conversation_id, resolved_message_id
    from public.service_messages as message
    where message.external_message_id = pg_catalog.btrim(p_external_message_id);
  end if;

  if was_created then
    select conversation.service_request_id
    into resolved_service_request_id
    from public.service_conversations as conversation
    where conversation.id = resolved_conversation_id;

    if resolved_service_request_id is not null then
      insert into public.service_request_events (
        service_request_id,
        message_id,
        event_type,
        actor_role,
        channel,
        audience,
        idempotency_key,
        payload
      )
      values (
        resolved_service_request_id,
        resolved_message_id,
        'message.received',
        'customer',
        'whatsapp',
        'customer',
        pg_catalog.concat(
          'event:meta:inbound:',
          pg_catalog.btrim(p_external_message_id)
        ),
        pg_catalog.jsonb_build_object('schema_version', 1)
      );
    end if;
  end if;

  return query
    select resolved_conversation_id, resolved_message_id, was_created;
end;
$$;

revoke execute on function public.persist_whatsapp_inbound_message(
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.persist_whatsapp_inbound_message(
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;

create or replace function public.queue_whatsapp_outbound_message(
  p_conversation_id uuid,
  p_body text,
  p_idempotency_key text
)
returns table (
  message_id uuid,
  outbox_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  operational_role text := (select public.current_verah_role());
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  resolved_message_id uuid;
  resolved_outbox_id uuid;
  resolved_service_request_id uuid;
  was_created boolean := false;
begin
  if (select auth.uid()) is null
    or operational_role not in ('concierge', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Operational authorization required';
  end if;

  if p_conversation_id is null
    or not exists (
      select 1
      from public.service_conversations as conversation
      where conversation.id = p_conversation_id
        and conversation.status = 'open'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Open conversation not found';
  end if;

  if p_body is null
    or pg_catalog.btrim(p_body) = ''
    or pg_catalog.char_length(p_body) > 10000 then
    raise exception using
      errcode = '22023',
      message = 'A valid message body is required';
  end if;

  if normalized_key is null
    or normalized_key = ''
    or pg_catalog.char_length(normalized_key) > 200 then
    raise exception using
      errcode = '22023',
      message = 'A valid idempotency key is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('whatsapp-outbound:', normalized_key),
      0
    )
  );

  select message.id, outbox.id
  into resolved_message_id, resolved_outbox_id
  from public.service_messages as message
  join public.integration_outbox as outbox
    on outbox.aggregate_id = message.id
   and outbox.aggregate_type = 'service_message'
  where message.idempotency_key = pg_catalog.concat('outbound:', normalized_key)
    and outbox.idempotency_key = pg_catalog.concat('meta:outbound:', normalized_key);

  if resolved_message_id is not null then
    return query select resolved_message_id, resolved_outbox_id, false;
    return;
  end if;

  insert into public.service_messages (
    conversation_id,
    direction,
    sender_role,
    message_type,
    body,
    idempotency_key,
    delivery_status
  )
  values (
    p_conversation_id,
    'outbound',
    operational_role,
    'text',
    pg_catalog.btrim(p_body),
    pg_catalog.concat('outbound:', normalized_key),
    'queued'
  )
  returning id into resolved_message_id;

  insert into public.integration_outbox (
    aggregate_type,
    aggregate_id,
    event_type,
    destination,
    payload,
    idempotency_key
  )
  values (
    'service_message',
    resolved_message_id,
    'whatsapp.message.send',
    'meta_whatsapp',
    pg_catalog.jsonb_build_object(
      'schema_version',
      1,
      'message_id',
      resolved_message_id,
      'conversation_id',
      p_conversation_id
    ),
    pg_catalog.concat('meta:outbound:', normalized_key)
  )
  returning id into resolved_outbox_id;

  select conversation.service_request_id
  into resolved_service_request_id
  from public.service_conversations as conversation
  where conversation.id = p_conversation_id;

  if resolved_service_request_id is not null then
    insert into public.service_request_events (
      service_request_id,
      message_id,
      event_type,
      actor_user_id,
      actor_role,
      channel,
      audience,
      idempotency_key,
      payload
    )
    values (
      resolved_service_request_id,
      resolved_message_id,
      'message.queued',
      (select auth.uid()),
      operational_role,
      'app',
      'customer',
      pg_catalog.concat('event:outbound:', normalized_key),
      pg_catalog.jsonb_build_object('schema_version', 1)
    );
  end if;

  was_created := true;
  return query select resolved_message_id, resolved_outbox_id, was_created;
end;
$$;

revoke execute on function public.queue_whatsapp_outbound_message(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_whatsapp_outbound_message(uuid, text, text)
  to authenticated;
