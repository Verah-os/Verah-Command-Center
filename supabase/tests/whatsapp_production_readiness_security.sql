\set ON_ERROR_STOP on

begin;

create schema whatsapp_readiness_test;
create function whatsapp_readiness_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema whatsapp_readiness_test to authenticated, service_role;
grant execute on function whatsapp_readiness_test.expect_error(text) to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'whatsapp_unbound_contacts', 'whatsapp_unbound_messages',
    'whatsapp_outbound_control', 'whatsapp_outbound_control_events',
    'whatsapp_message_templates'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then raise exception 'RLS is disabled for public.%', table_name; end if;
    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe grants on public.%', table_name;
    end if;
  end loop;
end;
$$;

-- Test-only fixture visibility; the transaction rolls these grants back.
grant select on public.customers, public.customer_channels,
  public.whatsapp_unbound_contacts, public.whatsapp_unbound_messages
  to service_role;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'wa.customer@example.invalid', '{}', '{}', now(), now()),
  ('f2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'wa.admin@example.invalid', '{}', '{}', now(), now()),
  ('f3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'wa.concierge@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.customers (id, auth_user_id, display_name)
values
  ('f5555555-5555-4555-8555-555555555551', 'f1111111-1111-4111-8111-111111111111', 'Bound Alpha Customer'),
  ('f5555555-5555-4555-8555-555555555552', null, 'Human Resolved Customer');

insert into public.user_profiles (user_id, role, display_name)
values
  ('f1111111-1111-4111-8111-111111111111', 'customer', 'Bound Alpha Customer'),
  ('f2222222-2222-4222-8222-222222222222', 'admin', 'WhatsApp Admin'),
  ('f3333333-3333-4333-8333-333333333333', 'concierge', 'WhatsApp Concierge')
on conflict (user_id) do nothing;

insert into public.customer_channels (
  id, customer_id, channel_type, channel_address, is_primary, consent_status,
  consent_source, consent_updated_at
) values (
  'f6666666-6666-4666-8666-666666666661', 'f5555555-5555-4555-8555-555555555551',
  'whatsapp', '+5511999991001', true, 'revoked', 'customer_opt_out', now()
);
insert into public.service_conversations (id, customer_id, customer_channel_id, channel_type)
values (
  'f7777777-7777-4777-8777-777777777771', 'f5555555-5555-4555-8555-555555555551',
  'f6666666-6666-4666-8666-666666666661', 'whatsapp'
);

-- Unknown phone remains a private pending identity and never creates a customer.
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
create temporary table whatsapp_readiness_results as
select * from public.persist_whatsapp_inbound_message_safe(
  '+5511999992002', 'wamid.readiness.unbound.1', 'text', 'Synthetic unbound message',
  now(), '{}'::jsonb
);
insert into whatsapp_readiness_results
select * from public.persist_whatsapp_inbound_message_safe(
  '+55 (11) 99999-2002', 'wamid.readiness.unbound.1', 'text', 'Synthetic unbound message',
  now(), '{}'::jsonb
);
do $$ begin
  if (select count(*) from public.customers) <> 2
    or (select count(*) from public.whatsapp_unbound_contacts) <> 1
    or (select count(*) from public.whatsapp_unbound_messages) <> 1
    or exists (select 1 from whatsapp_readiness_results where conversation_id is not null)
    or (select count(*) from whatsapp_readiness_results where created) <> 1 then
    raise exception 'Unbound contact safety or replay invariant failed';
  end if;
end $$;
select whatsapp_readiness_test.expect_error(
  $$select public.set_whatsapp_outbound_enabled(true, 'agent enable')$$
);

-- A customer cannot discover unbound contact history.
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f1111111-1111-4111-8111-111111111111"}', true);
do $$ begin
  if exists (select 1 from public.whatsapp_unbound_contacts)
    or exists (select 1 from public.whatsapp_unbound_messages) then
    raise exception 'Unbound identity history leaked to customer';
  end if;
end $$;

-- Human operations binds the channel to an existing canonical customer.
select pg_catalog.set_config('request.jwt.claim.sub', 'f3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f3333333-3333-4333-8333-333333333333"}', true);
select public.bind_whatsapp_unbound_contact(
  (select id from public.whatsapp_unbound_contacts where channel_address = '+5511999992002'),
  'f5555555-5555-4555-8555-555555555552'
) as resolved_channel_id \gset
do $$ begin
  if not exists (
    select 1 from public.whatsapp_unbound_contacts contact
    join public.customer_channels channel on channel.id = contact.bound_customer_channel_id
    where contact.channel_address = '+5511999992002'
      and contact.status = 'bound'
      and channel.customer_id = 'f5555555-5555-4555-8555-555555555552'
  ) or (select count(*) from public.customers) <> 2 then
    raise exception 'Human binding replaced customer identity with phone';
  end if;
end $$;

-- The DB kill switch is closed by default and agent-originated enqueue is forbidden.
select whatsapp_readiness_test.expect_error(
  $$select public.queue_whatsapp_outbound_message_gated(
    'f7777777-7777-4777-8777-777777777771', 'Synthetic acknowledgement', 'wa-killed',
    'intake_acknowledgement', '{}'::jsonb, 'transactional', 'human')$$
);
select pg_catalog.set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f2222222-2222-4222-8222-222222222222"}', true);
select public.set_whatsapp_outbound_enabled(true, 'Controlled test enable');
select whatsapp_readiness_test.expect_error(
  $$select public.queue_whatsapp_outbound_message_gated(
    'f7777777-7777-4777-8777-777777777771', 'Agent proposal', 'wa-agent',
    'intake_acknowledgement', '{}'::jsonb, 'transactional', 'agent_proposal')$$
);

-- Explicit opt-out blocks consent-based outbound but not a scoped transactional acknowledgement.
select whatsapp_readiness_test.expect_error(
  $$select public.queue_whatsapp_outbound_message_gated(
    'f7777777-7777-4777-8777-777777777771', 'Consent based', 'wa-consent-revoked',
    'intake_acknowledgement', '{}'::jsonb, 'consent', 'human')$$
);
create temporary table whatsapp_outbound_results as
select * from public.queue_whatsapp_outbound_message_gated(
  'f7777777-7777-4777-8777-777777777771', 'Synthetic acknowledgement', 'wa-transactional',
  'intake_acknowledgement', '{}'::jsonb, 'transactional', 'human'
);
insert into whatsapp_outbound_results
select * from public.queue_whatsapp_outbound_message_gated(
  'f7777777-7777-4777-8777-777777777771', 'Synthetic acknowledgement', 'wa-transactional',
  'intake_acknowledgement', '{}'::jsonb, 'transactional', 'human'
);
do $$ begin
  if (select count(distinct message_id) from whatsapp_outbound_results) <> 1
    or (select count(*) from whatsapp_outbound_results where created) <> 1
    or (select count(*) from public.integration_outbox where idempotency_key = 'meta:outbound:wa-transactional') <> 1 then
    raise exception 'Outbound idempotency invariant failed';
  end if;
  if exists (
    select 1 from public.integration_outbox outbox
    where outbox.destination = 'meta_whatsapp'
      and outbox.payload ?| array['body', 'phone', 'token', 'authorization', 'pan', 'cvv']
  ) then raise exception 'Sensitive outbound observability payload detected'; end if;
end $$;

select public.record_whatsapp_consent(
  'f5555555-5555-4555-8555-555555555551', 'granted', 'pilot_onboarding'
);
select public.queue_whatsapp_outbound_message_gated(
  'f7777777-7777-4777-8777-777777777771', 'Consent message', 'wa-consent-granted',
  'intake_acknowledgement', '{}'::jsonb, 'consent', 'human'
);

-- Readiness is read-only and reports only contract booleans.
reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
do $$ declare snapshot jsonb := public.whatsapp_readiness_snapshot(); begin
  if snapshot ->> 'schema_version' <> '1'
    or snapshot ->> 'private_media_bucket' <> 'true'
    or snapshot ->> 'outbox_contract' <> 'true'
    or snapshot ->> 'sanitized_observability' <> 'true' then
    raise exception 'WhatsApp readiness snapshot failed';
  end if;
  if snapshot::text ~* '(access.token|bearer|551199999)' then
    raise exception 'Readiness snapshot leaked secret or PII';
  end if;
end $$;

rollback;
