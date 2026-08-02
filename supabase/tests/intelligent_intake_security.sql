\set ON_ERROR_STOP on

begin;

create schema intelligent_intake_test;

create function intelligent_intake_test.expect_denied(statement text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Expected authorization failure: %', statement;
  exception when insufficient_privilege then null;
  end;
end;
$$;

grant usage on schema intelligent_intake_test to authenticated;
grant execute on function intelligent_intake_test.expect_denied(text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['intake_sessions', 'intake_assessments', 'intake_session_events'] loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then raise exception 'RLS is disabled for public.%', table_name; end if;

    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete')
    then raise exception 'Unsafe grants on public.%', table_name; end if;
  end loop;

  if not pg_catalog.has_function_privilege('service_role', 'public.prepare_intelligent_intake(uuid)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.prepare_intelligent_intake(uuid)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.prepare_intelligent_intake(uuid)', 'execute')
  then raise exception 'prepare_intelligent_intake grants are unsafe'; end if;

  if not pg_catalog.has_function_privilege(
      'service_role',
      'public.apply_intelligent_intake_transition(uuid,uuid,text,text,text,text,jsonb,text,uuid,text,jsonb,boolean)',
      'execute'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.apply_intelligent_intake_transition(uuid,uuid,text,text,text,text,jsonb,text,uuid,text,jsonb,boolean)',
      'execute'
    )
  then raise exception 'apply_intelligent_intake_transition grants are unsafe'; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('81111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'intake.customer@example.invalid', '{}', '{}', now(), now()),
  ('82222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'intake.other@example.invalid', '{}', '{}', now(), now()),
  ('83333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'intake.provider@example.invalid', '{}', '{}', now(), now()),
  ('84444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'intake.concierge@example.invalid', '{}', '{}', now(), now()),
  ('85555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'intake.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic Intake Provider', 'Synthetic Intake Provider', 'Test City', '["motor"]', 'active', 5)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('81111111-1111-4111-8111-111111111111', 'customer', 'Synthetic Intake Customer', null),
  ('82222222-2222-4222-8222-222222222222', 'customer', 'Other Intake Customer', null),
  ('83333333-3333-4333-8333-333333333333', 'provider', 'Synthetic Intake Provider', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('84444444-4444-4444-8444-444444444444', 'concierge', 'Synthetic Intake Concierge', null),
  ('85555555-5555-4555-8555-555555555555', 'admin', 'Synthetic Intake Admin', null)
on conflict (user_id) do nothing;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  message_id uuid;
  session_id uuid;
  context jsonb;
  result jsonb;
  sequence_number integer := 1;
  expected_status text;
  expected_step text;
  next_status text;
  next_step text;
  complete boolean;
  data jsonb := '{
    "customerName":"Synthetic Intake Customer",
    "vehicleMode":"new",
    "vehicle":{"brand":"Honda","model":"Fit","year":2018,"plate":"ABC1D23"},
    "mileage":85000,
    "symptom":"Motor falha ao acelerar",
    "conditions":"Com motor quente",
    "frequency":"Sempre",
    "dashboardLights":"Luz de injeção",
    "operatingCondition":"Veículo pode circular",
    "urgency":"alta",
    "location":"Test City"
  }'::jsonb;
  assessment jsonb := '{
    "inputSnapshot":{"schemaVersion":1},
    "summary":"Falha ao acelerar; requer revisão humana.",
    "normalizedSymptoms":["motor falha"],
    "conditions":["motor quente"],
    "missingQuestions":[],
    "hypotheses":[{"label":"Hipótese para verificação: alimentação","basis":"relato sintético"}],
    "riskLevel":"high",
    "riskFlags":["luz de alerta informada"],
    "safeNextStep":"Aguardar orientação do Concierge.",
    "confidence":0.7,
    "requiresHumanReview":true,
    "engineType":"deterministic",
    "engineVersion":"intake-rules-v1",
    "probableCategory":"motor"
  }'::jsonb;
begin
  for expected_status, expected_step, next_status, next_step, complete in
    select * from (values
      ('started','welcome','collecting_vehicle','vehicle_brand',false),
      ('collecting_vehicle','vehicle_brand','collecting_mileage','mileage',false),
      ('collecting_mileage','mileage','collecting_symptoms','symptom',false),
      ('collecting_symptoms','symptom','collecting_conditions','conditions',false),
      ('collecting_conditions','conditions','collecting_risk','urgency',false),
      ('collecting_risk','urgency','waiting_customer','confirmation',false),
      ('waiting_customer','confirmation','ready','completed',true)
    ) as transitions(expected_status, expected_step, next_status, next_step, complete)
  loop
    select persisted.message_id into message_id
    from public.persist_whatsapp_inbound_message(
      '+5511999998101',
      'wamid.intake.' || sequence_number::text,
      'text',
      'Synthetic step ' || sequence_number::text,
      '2026-08-01T12:00:00Z'::timestamptz + sequence_number * interval '1 minute',
      '{"source":"synthetic"}'::jsonb
    ) as persisted;
    context := public.prepare_intelligent_intake(message_id);
    session_id := (context ->> 'sessionId')::uuid;
    result := public.apply_intelligent_intake_transition(
      message_id, session_id, expected_status, expected_step,
      next_status, next_step, data,
      case when complete then 'Atendimento criado.' else 'Próxima pergunta sintética.' end,
      null, 'Synthetic Intake Customer', case when complete then assessment else null end, complete
    );
    sequence_number := sequence_number + 1;
  end loop;

  if result ->> 'status' <> 'completed' or result ->> 'serviceRequestId' is null then
    raise exception 'Intake did not complete transactionally: %', result;
  end if;

  result := public.apply_intelligent_intake_transition(
    message_id, session_id, 'waiting_customer', 'confirmation', 'ready', 'completed',
    data, 'Atendimento criado.', null, 'Synthetic Intake Customer', assessment, true
  );
  if result ->> 'status' <> 'duplicate' then
    raise exception 'Repeated inbound message was not idempotent';
  end if;
end;
$$;

reset role;

update public.customers
set auth_user_id = '81111111-1111-4111-8111-111111111111'
where id = (select customer_id from public.customer_channels where channel_address = '+5511999998101');

insert into public.customers (id, auth_user_id, display_name)
values ('87777777-7777-4777-8777-777777777777', '82222222-2222-4222-8222-222222222222', 'Other Intake Customer');
insert into public.customer_channels (id, customer_id, channel_type, channel_address, is_primary)
values ('87888888-8888-4888-8888-888888888888', '87777777-7777-4777-8777-777777777777', 'whatsapp', '+5511999998102', true);
insert into public.service_conversations (id, customer_id, customer_channel_id, channel_type)
values ('87999999-9999-4999-8999-999999999999', '87777777-7777-4777-8777-777777777777', '87888888-8888-4888-8888-888888888888', 'whatsapp');

insert into public.intake_sessions (
  id, conversation_id, customer_id, status, current_step, collected_data
)
select
  '89999999-9999-4999-8999-999999999991', conversation.id, conversation.customer_id,
  'waiting_customer', 'confirmation',
  '{"customerName":"Rollback Customer","vehicle":{"brand":"Ford","model":"Ka","year":2019},"mileage":50000,"symptom":"Ruído sintético","conditions":"Ao acelerar","frequency":"Às vezes","dashboardLights":"Nenhuma","operatingCondition":"Pode circular","urgency":"media"}'::jsonb
from public.service_conversations as conversation
join public.customer_channels as channel on channel.id = conversation.customer_channel_id
where channel.channel_address = '+5511999998102';

insert into public.service_messages (
  id, conversation_id, direction, sender_role, message_type, body,
  external_message_id, idempotency_key, delivery_status
)
select
  '89999999-9999-4999-8999-999999999992', session.conversation_id,
  'inbound', 'customer', 'text', 'sim', 'wamid.intake.rollback',
  'meta:inbound:wamid.intake.rollback', 'received'
from public.intake_sessions as session
where session.id = '89999999-9999-4999-8999-999999999991';

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  begin
    perform public.apply_intelligent_intake_transition(
      '89999999-9999-4999-8999-999999999992',
      '89999999-9999-4999-8999-999999999991',
      'waiting_customer', 'confirmation', 'ready', 'completed',
      '{"customerName":"Rollback Customer","vehicle":{"brand":"Ford","model":"Ka","year":2019},"mileage":50000,"symptom":"Ruído sintético","conditions":"Ao acelerar","frequency":"Às vezes","dashboardLights":"Nenhuma","operatingCondition":"Pode circular","urgency":"media"}'::jsonb,
      'Não deve persistir.', null, 'Rollback Customer',
      '{"engineType":"external","requiresHumanReview":false}'::jsonb, true
    );
    raise exception 'Expected invalid assessment failure';
  exception when invalid_parameter_value then null; end;

  if (select status from public.intake_sessions where id = '89999999-9999-4999-8999-999999999991') <> 'waiting_customer'
    or (select intake_processed_at from public.service_messages where id = '89999999-9999-4999-8999-999999999992') is not null
    or (select count(*) from public.service_requests where origin = 'whatsapp') <> 1
  then raise exception 'Failed completion was not rolled back atomically'; end if;
end;
$$;
reset role;

do $$
declare session_id uuid; event_id uuid;
begin
  if (select count(*) from public.service_requests where origin = 'whatsapp') <> 1 then
    raise exception 'Expected exactly one WhatsApp service request';
  end if;
  if (select count(*) from public.intake_assessments) <> 1 then
    raise exception 'Expected exactly one deterministic assessment';
  end if;
  if exists (select 1 from public.intake_assessments where engine_type <> 'deterministic' or not requires_human_review) then
    raise exception 'Assessment safety contract was violated';
  end if;
  if (select count(*) from public.integration_outbox where event_type = 'whatsapp.message.send') <> 7 then
    raise exception 'Expected one idempotent outbound event per transition';
  end if;

  select id into session_id from public.intake_sessions limit 1;
  begin
    update public.intake_sessions set status = 'started' where id = session_id;
    raise exception 'Expected terminal transition to fail';
  exception when object_not_in_prerequisite_state then null; end;

  select id into event_id from public.intake_session_events limit 1;
  begin
    delete from public.intake_session_events where id = event_id;
    raise exception 'Expected immutable event delete to fail';
  exception when object_not_in_prerequisite_state then null; end;
end;
$$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', '81111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"81111111-1111-4111-8111-111111111111"}', true);
do $$ begin
  if (select count(*) from public.intake_sessions) <> 1 then raise exception 'Customer cannot read own intake'; end if;
  if (select count(*) from public.intake_assessments) <> 1 then raise exception 'Customer cannot read own assessment'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '82222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"82222222-2222-4222-8222-222222222222"}', true);
do $$ begin
  if (select count(*) from public.intake_sessions) <> 1
    or exists (select 1 from public.intake_sessions where customer_id <> '87777777-7777-4777-8777-777777777777')
    or exists (select 1 from public.intake_assessments) then
    raise exception 'Customer isolation failed';
  end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '83333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"83333333-3333-4333-8333-333333333333"}', true);
do $$ begin
  if exists (select 1 from public.intake_sessions) then raise exception 'Provider can read intake sessions'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '84444444-4444-4444-8444-444444444444', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"84444444-4444-4444-8444-444444444444"}', true);
do $$ begin
  if (select count(*) from public.intake_sessions) <> 2 then raise exception 'Concierge cannot read all intakes'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '85555555-5555-4555-8555-555555555555', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"85555555-5555-4555-8555-555555555555"}', true);
do $$ begin
  if (select count(*) from public.intake_sessions) <> 2
    or (select count(*) from public.intake_assessments) <> 1
  then raise exception 'Admin cannot read intake records'; end if;
end $$;

select intelligent_intake_test.expect_denied('select public.prepare_intelligent_intake(null::uuid)');

reset role;

-- Constraint and index contracts required for single-active and one-request semantics.
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'intake_sessions_one_active_conversation_uidx')
    or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'service_requests_intake_session_uidx')
  then raise exception 'Intake uniqueness indexes are missing'; end if;
end $$;

rollback;
