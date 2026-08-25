alter table public.integration_outbox
  add constraint integration_outbox_n8n_contract_v1_check check (
    destination <> 'n8n'
    or ((
      payload ->> 'schema_version' = '1'
      and payload ->> 'event_id' = id::text
      and payload ->> 'event_type' = event_type
      and payload ->> 'aggregate_type' = aggregate_type
      and payload ->> 'aggregate_id' = aggregate_id::text
      and nullif(payload ->> 'occurred_at', '') is not null
      and jsonb_typeof(payload -> 'data') = 'object'
      and payload::text !~* '"(authorization|body|email|message|phone|secret|token)"[[:space:]]*:'
    ) is true)
  );

create or replace function public.enqueue_n8n_sla_notifications(
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns integer
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
  inserted_count integer;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;

  with candidates as (
    select
      pg_catalog.gen_random_uuid() as outbox_id,
      'intake_session'::text as aggregate_type,
      session.id as aggregate_id,
      'sla.intake.stalled'::text as event_type,
      pg_catalog.concat('n8n:sla:intake:stalled:', session.id::text, ':v1') as idempotency_key,
      pg_catalog.jsonb_build_object(
        'current_step', session.current_step,
        'stalled_since', session.updated_at
      ) as data
    from public.intake_sessions as session
    where session.status not in ('completed', 'cancelled', 'abandoned')
      and session.updated_at <= p_now - interval '15 minutes'

    union all

    select
      pg_catalog.gen_random_uuid(),
      'integration_outbox',
      failed.id,
      'sla.delivery.dead_letter',
      pg_catalog.concat('n8n:sla:delivery:dead-letter:', failed.id::text, ':v1'),
      pg_catalog.jsonb_build_object(
        'destination', failed.destination,
        'failed_event_type', failed.event_type,
        'failed_at', failed.processed_at
      )
    from public.integration_outbox as failed
    where failed.destination <> 'n8n'
      and failed.status = 'dead_letter'
  )
  insert into public.integration_outbox (
    id, aggregate_type, aggregate_id, event_type, destination, payload, idempotency_key
  )
  select
    candidate.outbox_id,
    candidate.aggregate_type,
    candidate.aggregate_id,
    candidate.event_type,
    'n8n',
    pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'event_id', candidate.outbox_id,
      'event_type', candidate.event_type,
      'aggregate_type', candidate.aggregate_type,
      'aggregate_id', candidate.aggregate_id,
      'occurred_at', p_now,
      'data', candidate.data
    ),
    candidate.idempotency_key
  from candidates as candidate
  on conflict (idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.claim_n8n_notifications(
  p_limit integer default 10,
  p_max_attempts integer default 5
)
returns table (
  outbox_id uuid,
  idempotency_key text,
  payload jsonb,
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
  with stale_exhausted as (
    update public.integration_outbox as outbox
    set status = 'dead_letter',
        last_error_code = 'claim_timeout',
        processed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where outbox.destination = 'n8n'
      and outbox.status = 'processing'
      and outbox.attempt_count >= p_max_attempts
      and outbox.updated_at < pg_catalog.clock_timestamp() - interval '5 minutes'
    returning outbox.id
  ), candidates as (
    select outbox.id
    from public.integration_outbox as outbox
    where outbox.destination = 'n8n'
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
    returning outbox.id, outbox.idempotency_key, outbox.payload, outbox.attempt_count
  )
  select claimed.id, claimed.idempotency_key, claimed.payload, claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.complete_n8n_notification(p_outbox_id uuid)
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
  select * into selected_outbox
  from public.integration_outbox
  where id = p_outbox_id and destination = 'n8n'
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
  return true;
end;
$$;

create or replace function public.fail_n8n_notification(
  p_outbox_id uuid,
  p_error_code text,
  p_retryable boolean default true,
  p_max_attempts integer default 5
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
  where id = p_outbox_id and destination = 'n8n'
  for update;
  if selected_outbox.id is null then
    raise exception using errcode = '22023', message = 'Outbox item not found';
  end if;
  if selected_outbox.status in ('sent', 'dead_letter') then return selected_outbox.status; end if;
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
  return resolved_status;
end;
$$;

create or replace function public.get_n8n_notification_report()
returns table (
  pending bigint,
  retrying bigint,
  processing bigint,
  sent bigint,
  dead_letter bigint,
  oldest_pending_at timestamptz
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
  return query select
    count(*) filter (where outbox.status = 'pending'),
    count(*) filter (where outbox.status = 'failed'),
    count(*) filter (where outbox.status = 'processing'),
    count(*) filter (where outbox.status = 'sent'),
    count(*) filter (where outbox.status = 'dead_letter'),
    min(outbox.created_at) filter (where outbox.status in ('pending', 'failed'))
  from public.integration_outbox as outbox
  where outbox.destination = 'n8n';
end;
$$;

revoke execute on function public.enqueue_n8n_sla_notifications(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_n8n_notifications(integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_n8n_notification(uuid) from public, anon, authenticated;
revoke execute on function public.fail_n8n_notification(uuid, text, boolean, integer) from public, anon, authenticated;
revoke execute on function public.get_n8n_notification_report() from public, anon, authenticated;
grant execute on function public.enqueue_n8n_sla_notifications(timestamptz) to service_role;
grant execute on function public.claim_n8n_notifications(integer, integer) to service_role;
grant execute on function public.complete_n8n_notification(uuid) to service_role;
grant execute on function public.fail_n8n_notification(uuid, text, boolean, integer) to service_role;
grant execute on function public.get_n8n_notification_report() to service_role;
