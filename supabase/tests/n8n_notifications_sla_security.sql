\set ON_ERROR_STOP on

begin;

create schema n8n_notification_test;
create table n8n_notification_test.claims (
  attempt integer not null,
  outbox_id uuid not null
);
create function n8n_notification_test.expect_error(statement text)
returns void language plpgsql set search_path = '' as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', statement;
exception when others then
  if sqlerrm like 'Expected statement to fail:%' then raise; end if;
end;
$$;

grant usage on schema n8n_notification_test to service_role;
grant select, insert on table n8n_notification_test.claims to service_role;
grant execute on function n8n_notification_test.expect_error(text) to service_role;
grant select, update on table public.integration_outbox to service_role;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enqueue_n8n_sla_notifications(timestamp with time zone)',
    'public.claim_n8n_notifications(integer,integer)',
    'public.complete_n8n_notification(uuid)',
    'public.fail_n8n_notification(uuid,text,boolean,integer)',
    'public.get_n8n_notification_report()'
  ] loop
    if not pg_catalog.has_function_privilege('service_role', signature, 'execute')
      or pg_catalog.has_function_privilege('authenticated', signature, 'execute')
      or pg_catalog.has_function_privilege('anon', signature, 'execute') then
      raise exception 'Unsafe n8n function grants for %', signature;
    end if;
  end loop;
end;
$$;

select n8n_notification_test.expect_error($sql$
  insert into public.integration_outbox (
    id, aggregate_type, aggregate_id, event_type, destination, payload, idempotency_key
  ) values (
    '78000000-0000-4000-8000-000000000099', 'intake_session',
    '78000000-0000-4000-8000-000000000098', 'sla.intake.stalled', 'n8n',
    '{"schema_version":1,"event_id":"78000000-0000-4000-8000-000000000099","event_type":"sla.intake.stalled","aggregate_type":"intake_session","aggregate_id":"78000000-0000-4000-8000-000000000098","occurred_at":"2026-08-20T03:00:00Z","data":{"body":"private"}}',
    'n8n:unsafe-contract'
  )
$sql$);

select n8n_notification_test.expect_error($sql$
  insert into public.integration_outbox (
    id, aggregate_type, aggregate_id, event_type, destination, payload, idempotency_key
  ) values (
    '78000000-0000-4000-8000-000000000097', 'intake_session',
    '78000000-0000-4000-8000-000000000098', 'sla.intake.stalled', 'n8n',
    '{"schema_version":1,"event_type":"sla.intake.stalled","aggregate_type":"intake_session","aggregate_id":"78000000-0000-4000-8000-000000000098","occurred_at":"2026-08-20T03:00:00Z","data":{}}',
    'n8n:missing-event-id'
  )
$sql$);

insert into public.customers (id, display_name)
values ('78000000-0000-4000-8000-000000000010', 'Synthetic SLA Customer');
insert into public.customer_channels (
  id, customer_id, channel_type, channel_address, is_primary, consent_status
) values (
  '78000000-0000-4000-8000-000000000011',
  '78000000-0000-4000-8000-000000000010',
  'whatsapp', '+5511999990078', true, 'granted'
);
insert into public.service_conversations (
  id, customer_id, customer_channel_id, channel_type
) values (
  '78000000-0000-4000-8000-000000000012',
  '78000000-0000-4000-8000-000000000010',
  '78000000-0000-4000-8000-000000000011', 'whatsapp'
);
insert into public.intake_sessions (
  id, conversation_id, customer_id, status, current_step, updated_at
) values (
  '78000000-0000-4000-8000-000000000013',
  '78000000-0000-4000-8000-000000000012',
  '78000000-0000-4000-8000-000000000010',
  'waiting_customer', 'symptom', '2026-08-20T02:30:00Z'
);
insert into public.integration_outbox (
  id, aggregate_type, aggregate_id, event_type, destination, payload,
  idempotency_key, status, attempt_count, processed_at
) values (
  '78000000-0000-4000-8000-000000000014', 'service_message',
  '78000000-0000-4000-8000-000000000015', 'whatsapp.message.send',
  'meta_whatsapp', '{}', 'meta:synthetic-dead-letter-78', 'dead_letter', 3,
  '2026-08-20T02:45:00Z'
);

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  initial_count integer;
  replay_count integer;
begin
  initial_count := public.enqueue_n8n_sla_notifications('2026-08-20T03:00:00Z');
  replay_count := public.enqueue_n8n_sla_notifications('2026-08-20T03:00:00Z');

  if initial_count <> 2
    or replay_count <> 0
    or (select count(*) from public.integration_outbox where destination = 'n8n') <> 2
    or exists (
      select 1 from public.integration_outbox
      where destination = 'n8n'
        and (
          payload ->> 'schema_version' <> '1'
          or payload::text ~* '"(authorization|body|email|message|phone|secret|token)"[[:space:]]*:'
        )
    ) then
    raise exception 'SLA generation must be versioned, sanitized and idempotent';
  end if;
end;
$$;

insert into n8n_notification_test.claims
select 1, claim.outbox_id from public.claim_n8n_notifications(10, 5) as claim;

do $$
begin
  if (select count(*) from n8n_notification_test.claims) <> 2
    or exists (select 1 from public.claim_n8n_notifications(10, 5)) then
    raise exception 'n8n claims must be exclusive';
  end if;
end;
$$;

select public.fail_n8n_notification(
  (select outbox_id from n8n_notification_test.claims order by outbox_id limit 1),
  'n8n_http_503', true, 5
);

do $$
begin
  if exists (select 1 from public.claim_n8n_notifications(10, 5)) then
    raise exception 'Delayed retries cannot be claimed early';
  end if;
end;
$$;

update public.integration_outbox
set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where status = 'failed' and destination = 'n8n';

insert into n8n_notification_test.claims
select 2, claim.outbox_id from public.claim_n8n_notifications(10, 5) as claim;
select public.fail_n8n_notification(
  (select outbox_id from n8n_notification_test.claims where attempt = 2),
  'n8n_http_400', false, 5
);

select public.complete_n8n_notification(
  (select outbox_id from n8n_notification_test.claims where attempt = 1 order by outbox_id desc limit 1)
);
select public.complete_n8n_notification(
  (select outbox_id from n8n_notification_test.claims where attempt = 1 order by outbox_id desc limit 1)
);

do $$
declare report record;
begin
  select * into report from public.get_n8n_notification_report();
  if report.sent <> 1 or report.dead_letter <> 1 or report.pending <> 0
    or report.retrying <> 0 or report.processing <> 0 then
    raise exception 'n8n operational report is incorrect';
  end if;
end;
$$;

reset role;

insert into public.integration_outbox (
  id, aggregate_type, aggregate_id, event_type, destination, payload,
  idempotency_key, status, attempt_count, updated_at
) values (
  '78000000-0000-4000-8000-000000000096', 'intake_session',
  '78000000-0000-4000-8000-000000000098', 'sla.intake.stalled', 'n8n',
  '{"schema_version":1,"event_id":"78000000-0000-4000-8000-000000000096","event_type":"sla.intake.stalled","aggregate_type":"intake_session","aggregate_id":"78000000-0000-4000-8000-000000000098","occurred_at":"2026-08-20T03:00:00Z","data":{}}',
  'n8n:stale-final-attempt', 'processing', 5,
  pg_catalog.clock_timestamp() - interval '6 minutes'
);

set local role service_role;

do $$
declare
  claimed_count integer;
  recovered public.integration_outbox%rowtype;
begin
  select count(*) into claimed_count
  from public.claim_n8n_notifications(10, 5);

  select * into recovered
  from public.integration_outbox
  where id = '78000000-0000-4000-8000-000000000096';

  if claimed_count <> 0
    or recovered.status <> 'dead_letter'
    or recovered.last_error_code <> 'claim_timeout'
    or recovered.processed_at is null then
    raise exception 'Stale final attempt recovery failed: claimed=%, status=%, attempts=%, updated_at=%, error=%, processed_at=%',
      claimed_count, recovered.status, recovered.attempt_count, recovered.updated_at,
      recovered.last_error_code, recovered.processed_at;
  end if;
end;
$$;

rollback;
