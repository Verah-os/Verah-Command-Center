\set ON_ERROR_STOP on

begin;

create schema whatsapp_worker_test;
create table whatsapp_worker_test.media_claims (
  attempt integer not null,
  attachment_id uuid not null
);
create table whatsapp_worker_test.outbox_claims (
  attempt integer not null,
  outbox_id uuid not null
);

create function whatsapp_worker_test.expect_error(statement text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', statement;
exception
  when others then
    if sqlerrm like 'Expected statement to fail:%' then raise; end if;
end;
$$;

grant usage on schema whatsapp_worker_test to service_role;
grant select, insert on all tables in schema whatsapp_worker_test to service_role;
grant execute on function whatsapp_worker_test.expect_error(text) to service_role;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.claim_whatsapp_outbox(integer,integer)',
    'public.complete_whatsapp_outbox(uuid,text)',
    'public.fail_whatsapp_outbox(uuid,text,boolean,integer)',
    'public.claim_whatsapp_media(integer,integer)',
    'public.complete_whatsapp_media(uuid,text,bigint,text)',
    'public.fail_whatsapp_media(uuid,text,boolean,integer)'
  ] loop
    if not pg_catalog.has_function_privilege('service_role', signature, 'execute')
      or pg_catalog.has_function_privilege('authenticated', signature, 'execute')
      or pg_catalog.has_function_privilege('anon', signature, 'execute') then
      raise exception 'Unsafe worker RPC grants for %', signature;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets
    where id = 'service-attachments' and public = false
      and file_size_limit = 26214400
  ) then
    raise exception 'WhatsApp media bucket must remain private and bounded';
  end if;
end;
$$;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

select * from public.persist_whatsapp_inbound_message(
  '+5511999990001',
  'wamid.worker.media.1',
  'image',
  null,
  '2026-08-20T00:00:00Z',
  '{"media_id":"meta-media-1","mime_type":"image/jpeg"}'::jsonb
);
select * from public.persist_whatsapp_inbound_message(
  '+55 (11) 99999-0001',
  'wamid.worker.media.1',
  'image',
  null,
  '2026-08-20T00:00:00Z',
  '{"media_id":"meta-media-1","mime_type":"image/jpeg"}'::jsonb
);

insert into whatsapp_worker_test.media_claims
select 1, claim.attachment_id
from public.claim_whatsapp_media(10, 3) as claim;

do $$
begin
  if (select count(*) from whatsapp_worker_test.media_claims) <> 1
    or (select count(*) from public.service_messages where external_message_id = 'wamid.worker.media.1') <> 1
    or (select count(*) from public.service_attachments where external_media_id = 'meta-media-1') <> 1
    or exists (select 1 from public.claim_whatsapp_media(10, 3)) then
    raise exception 'Media claim or replay is not idempotent';
  end if;
end;
$$;

select public.fail_whatsapp_media(
  (select attachment_id from whatsapp_worker_test.media_claims where attempt = 1),
  'meta_rate_limited', true, 3
);
update public.service_attachments
set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where id = (select attachment_id from whatsapp_worker_test.media_claims where attempt = 1);

insert into whatsapp_worker_test.media_claims
select 2, claim.attachment_id
from public.claim_whatsapp_media(10, 3) as claim;

select public.complete_whatsapp_media(
  (select attachment_id from whatsapp_worker_test.media_claims where attempt = 2),
  'image/jpeg', 128, repeat('a', 64)
);
select public.complete_whatsapp_media(
  (select attachment_id from whatsapp_worker_test.media_claims where attempt = 2),
  'image/jpeg', 128, repeat('a', 64)
);

do $$
begin
  if (select count(distinct attachment_id) from whatsapp_worker_test.media_claims) <> 1
    or not exists (
      select 1 from public.service_attachments
      where external_media_id = 'meta-media-1'
        and status = 'available'
        and attempt_count = 2
        and detected_mime_type = 'image/jpeg'
        and size_bytes = 128
        and checksum_sha256 = repeat('a', 64)
        and retention_until > created_at
        and storage_path !~ 'meta-media-1|5511999990001'
    ) then
    raise exception 'Verified media completion or retry is incorrect';
  end if;

  perform whatsapp_worker_test.expect_error(pg_catalog.format(
    'select public.complete_whatsapp_media(%L::uuid,%L,128,%L)',
    (select attachment_id from whatsapp_worker_test.media_claims limit 1),
    'text/html', repeat('a', 64)
  ));
end;
$$;

insert into public.service_messages (
  id, conversation_id, direction, sender_role, message_type, body,
  idempotency_key, delivery_status
)
select
  '77000000-0000-4000-8000-000000000001', conversation_id,
  'outbound', 'concierge', 'text', 'Synthetic worker delivery',
  'outbound:worker-1', 'queued'
from public.service_messages
where external_message_id = 'wamid.worker.media.1';

insert into public.integration_outbox (
  id, aggregate_type, aggregate_id, event_type, destination,
  payload, idempotency_key
) values (
  '77000000-0000-4000-8000-000000000002',
  'service_message', '77000000-0000-4000-8000-000000000001',
  'whatsapp.message.send', 'meta_whatsapp',
  '{"schema_version":1,"message_id":"77000000-0000-4000-8000-000000000001"}',
  'meta:outbound:worker-1'
);

insert into whatsapp_worker_test.outbox_claims
select 1, claim.outbox_id
from public.claim_whatsapp_outbox(10, 3) as claim;

do $$
begin
  if (select count(*) from whatsapp_worker_test.outbox_claims) <> 1
    or exists (select 1 from public.claim_whatsapp_outbox(10, 3)) then
    raise exception 'Outbox claim is not exclusive';
  end if;
end;
$$;

select public.fail_whatsapp_outbox(
  '77000000-0000-4000-8000-000000000002',
  'meta_http_503', true, 3
);
update public.integration_outbox
set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where id = '77000000-0000-4000-8000-000000000002';

insert into whatsapp_worker_test.outbox_claims
select 2, claim.outbox_id
from public.claim_whatsapp_outbox(10, 3) as claim;
select public.complete_whatsapp_outbox(
  '77000000-0000-4000-8000-000000000002',
  'wamid.outbound.worker.1'
);
select public.complete_whatsapp_outbox(
  '77000000-0000-4000-8000-000000000002',
  'wamid.outbound.worker.1'
);

do $$
begin
  if (select count(*) from whatsapp_worker_test.outbox_claims) <> 2
    or not exists (
      select 1
      from public.integration_outbox as outbox
      join public.service_messages as message on message.id = outbox.aggregate_id
      where outbox.id = '77000000-0000-4000-8000-000000000002'
        and outbox.status = 'sent'
        and outbox.attempt_count = 2
        and outbox.last_error_code is null
        and message.delivery_status = 'sent'
        and message.external_message_id = 'wamid.outbound.worker.1'
    ) then
    raise exception 'Outbox retry or completion is incorrect';
  end if;
end;
$$;

insert into public.service_messages (
  id, conversation_id, direction, sender_role, message_type, body,
  idempotency_key, delivery_status
)
select
  '77000000-0000-4000-8000-000000000003', conversation_id,
  'outbound', 'concierge', 'text', 'Synthetic terminal delivery',
  'outbound:worker-dead', 'queued'
from public.service_messages
where external_message_id = 'wamid.worker.media.1';
insert into public.integration_outbox (
  id, aggregate_type, aggregate_id, event_type, destination,
  payload, idempotency_key, attempt_count
) values (
  '77000000-0000-4000-8000-000000000004',
  'service_message', '77000000-0000-4000-8000-000000000003',
  'whatsapp.message.send', 'meta_whatsapp', '{}'::jsonb,
  'meta:outbound:worker-dead', 2
);
select * from public.claim_whatsapp_outbox(10, 3);
select public.fail_whatsapp_outbox(
  '77000000-0000-4000-8000-000000000004',
  'invalid_recipient', false, 3
);

do $$
begin
  if not exists (
    select 1 from public.integration_outbox
    where id = '77000000-0000-4000-8000-000000000004'
      and status = 'dead_letter'
      and attempt_count = 3
      and last_error_code = 'invalid_recipient'
  ) then
    raise exception 'Terminal outbox failure is not bounded';
  end if;
end;
$$;

reset role;
rollback;
