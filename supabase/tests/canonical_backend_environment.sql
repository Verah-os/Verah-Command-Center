\set ON_ERROR_STOP on

begin;

create schema canonical266_test;

create function canonical266_test.expect_error(statement text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', statement;
exception
  when others then
    if sqlerrm like 'Expected statement to fail:%' then raise; end if;
end;
$$;

grant usage on schema canonical266_test to authenticated, service_role;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('26600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'canonical.customer@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26600000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'canonical.concierge@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26600000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'canonical.provider@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26600000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'canonical.unprofiled@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.customers (id, auth_user_id, display_name)
values
  ('26600000-0000-4000-8000-000000000011', '26600000-0000-4000-8000-000000000001', 'Canonical Customer'),
  ('26600000-0000-4000-8000-000000000014', '26600000-0000-4000-8000-000000000004', 'Unprofiled User')
on conflict (id) do nothing;

insert into public.customer_vehicles (id, customer_id, owner_id, brand, model, year, plate, active, customer_confirmed_at)
values
  ('26600000-0000-4000-8000-000000000021', '26600000-0000-4000-8000-000000000011', '26600000-0000-4000-8000-000000000001', 'Volkswagen', 'Polo', 2022, 'CBL001A', true, now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, is_synthetic)
values
  ('26605555-5555-4555-8555-555555555551', 'Canonical Provider', 'Canonical Provider', 'Test City', '["maintenance"]'::jsonb, 'active', true)
on conflict (id) do nothing;

-- NOTE: user ...004 intentionally has NO user_profiles row: it represents an
-- authenticated session that never completed canonical onboarding.
insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('26600000-0000-4000-8000-000000000001', 'customer', 'Canonical Customer', null),
  ('26600000-0000-4000-8000-000000000002', 'concierge', 'Canonical Concierge', null),
  ('26600000-0000-4000-8000-000000000003', 'provider', 'Canonical Provider', '26605555-5555-4555-8555-555555555551')
on conflict (user_id) do nothing;

-- The mobile app channel: the customer authenticated session creates the
-- canonical service_request with origin='customer', service_stage='solicitado',
-- preserving customer_id/vehicle_id/created_by and the canonical column set.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000001"}', true);

insert into public.service_requests (
  id,
  reference_code,
  customer_name,
  customer_id,
  vehicle_id,
  vehicle_brand,
  vehicle_model,
  vehicle_year,
  vehicle_plate,
  city,
  customer_report,
  perceived_urgency,
  service_stage,
  origin,
  created_by,
  operation_context,
  pickup_address,
  pickup_location_source,
  pickup_location_confirmed_at
)
values (
  '26600000-0000-4000-8000-000000000031',
  'VRH-ALPHA-266',
  'Canonical Customer',
  '26600000-0000-4000-8000-000000000011',
  '26600000-0000-4000-8000-000000000021',
  'Volkswagen',
  'Polo',
  2022,
  'CBL001A',
  'Test City',
  'Solicitação criada pelo app cliente no mesmo backend canônico.',
  'media',
  'solicitado',
  'customer',
  '26600000-0000-4000-8000-000000000001',
  'demo',
  'Rua Canônica, 100',
  'manual_address',
  now()
);

-- The same customer cannot silently re-label the request as concierge/whatsapp
-- origin (would break the canonical queue contract) via an update.
select canonical266_test.expect_error(
  $$update public.service_requests set origin = 'concierge' where id = '26600000-0000-4000-8000-000000000031'$$
);

-- The concierge channel reads the very same canonical row created by the app.
set local role authenticated;
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000002"}', true);

do $$
declare
  found_id uuid;
begin
  select sr.id into found_id
  from public.service_requests sr
  where sr.reference_code = 'VRH-ALPHA-266';

  if found_id is distinct from '26600000-0000-4000-8000-000000000031' then
    raise exception 'Concierge web did not see the same canonical service_request created by the app';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extended maintainer criterion (issue #266 comment): Prestador App/Web on the
-- SAME canonical service_request. The minimum end-to-end flow on the SAME row:
--   Cliente App cria -> Concierge Web aceita -> Concierge atribui prestador ->
--   Prestador atribuído vê -> Prestador envia orçamento -> Cliente aprova
--   (em_execucao) -> Prestador executa provider_mark_service_completed ->
--   Concierge reencontra a linha com provider_completed_at -> Cliente Web vê a
--   projeção apropriada sem dados internos do prestador.
-- All transitions use the existing canonical RPCs; no mirror table or sync.
-- ---------------------------------------------------------------------------

-- The concierge accepts the customer's canonical request through the same RPC
-- the Concierge web detail page uses (concierge_aceitar -> accept_service_request).
-- Solicitar -> concierge_aceitou on the SAME row.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000002"}', true);

select public.accept_service_request('26600000-0000-4000-8000-000000000031');

do $$
declare
  accepted_stage text;
  accepted_concierge uuid;
begin
  select service_stage, concierge_id
    into accepted_stage, accepted_concierge
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  if accepted_stage is distinct from 'concierge_aceitou' then
    raise exception 'Concierge acceptance did not move the canonical row: stage %', accepted_stage;
  end if;
  if accepted_concierge is distinct from '26600000-0000-4000-8000-000000000002' then
    raise exception 'Concierge acceptance did not bind the acting concierge';
  end if;
end;
$$;

-- The concierge assigns the synthetic active provider through the canonical RPC
-- (concierge provider-assignment -> assign_provider_to_service_request):
-- concierge_aceitou -> prestador_indicado on the SAME row. The synthetic
-- provider is eligible because the request is a demo operation context (the
-- same convention the smoke /demo/prestador path uses in the physical runbook).
select public.assign_provider_to_service_request(
  '26600000-0000-4000-8000-000000000031',
  '26605555-5555-4555-8555-555555555551'
);

do $$
declare
  assigned_provider uuid;
  assigned_stage text;
begin
  select provider_id, service_stage
    into assigned_provider, assigned_stage
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  if assigned_provider is distinct from '26605555-5555-4555-8555-555555555551' then
    raise exception 'Provider assignment did not persist on the canonical row';
  end if;
  if assigned_stage is distinct from 'prestador_indicado' then
    raise exception 'Provider assignment did not move the canonical row: stage %', assigned_stage;
  end if;
end;
$$;

-- The authorized provider (web/app) sees the SAME row through the RLS surface
-- getProviderServiceRequest(id, providerId) / listProviderServiceRequests()
-- use: provider_id matches the authenticated profile. Only by assignment — no
-- mirror, copy or sync.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000003"}', true);

do $$
declare
  seen_reference text;
  seen_customer_id uuid;
  seen_vehicle_id uuid;
  seen_stage text;
  seen_urgency text;
  seen_city text;
begin
  -- Same column surface getProviderServiceRequest(id, providerId) requests.
  select reference_code, customer_id, vehicle_id, service_stage,
         perceived_urgency, city
    into seen_reference, seen_customer_id, seen_vehicle_id,
         seen_stage, seen_urgency, seen_city
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  if seen_reference is distinct from 'VRH-ALPHA-266' then
    raise exception 'Assigned provider did not see the canonical service_request through RLS';
  end if;
  if seen_customer_id is null or seen_vehicle_id is null
     or seen_stage is distinct from 'prestador_indicado'
     or seen_city is distinct from 'Test City' then
    raise exception 'Provider RLS view lost canonical request data';
  end if;
end;
$$;

-- The provider performs an allowed lifecycle transition through canonical RPCs:
-- saves and submits the quote (service-quotes saveQuote/submit ->
-- save_service_quote_draft + submit_service_quote). The canonical row moves
-- prestador_indicado -> aguardando_aprovacao and the quote becomes visible to
-- the customer/concierge on the same service_request.
select public.save_service_quote_draft(
  '26600000-0000-4000-8000-000000000031',
  '26605555-5555-4555-8555-555555555551',
  '[
    {"item_type":"labor","description":"Diagnóstico e mão de obra","quantity":2,"unit_price":120.00,"is_optional":false},
    {"item_type":"part","description":"Kit de correia dentada","quantity":1,"unit_price":450.00,"is_optional":false}
  ]'::jsonb,
  '4 horas', 'Sintético — teste de alinhamento cross-channel.', 'Correia dentada com mão de obra', '30 dias', current_date + 7
) as quote_id \gset

select pg_catalog.set_config('canonical_backend_test.quote_id', :'quote_id', true);
select public.submit_service_quote(:'quote_id');

do $$
declare
  submitted_stage text;
  persisted_status text;
  persisted_total numeric;
  quote_id uuid := pg_catalog.current_setting(
    'canonical_backend_test.quote_id', true
  )::uuid;
begin
  select service_stage into submitted_stage
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  select status, total_amount into persisted_status, persisted_total
  from public.service_quotes
  where id = quote_id;
  if submitted_stage is distinct from 'aguardando_aprovacao' then
    raise exception 'Quote submission did not move the canonical row: stage %', submitted_stage;
  end if;
  if persisted_status is distinct from 'submitted' or persisted_total < 690 then
    raise exception 'Quote submission did not persist a valid submitted quote on the canonical row';
  end if;
end;
$$;

-- The customer (web/app) APPROVES the submitted quote through the canonical RPC
-- (getQuoteForRequest -> approve_service_quote). The canonical row moves
-- aguardando_aprovacao -> em_execucao — the stage where provider_completed_at
-- becomes reachable — on the SAME row.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000001"}', true);

select public.approve_service_quote(
  pg_catalog.current_setting('canonical_backend_test.quote_id', true)::uuid,
  'Aprovo o orçamento — iniciar o atendimento.'
);

do $$
declare
  approved_stage text;
  approved_quote_status text;
  quote_id uuid := pg_catalog.current_setting(
    'canonical_backend_test.quote_id', true
  )::uuid;
begin
  select service_stage into approved_stage
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  select status into approved_quote_status
  from public.service_quotes
  where id = quote_id;
  if approved_stage is distinct from 'em_execucao' then
    raise exception 'Customer approval did not move the canonical row: stage %', approved_stage;
  end if;
  if approved_quote_status is distinct from 'approved' then
    raise exception 'Customer approval did not approve the quote on the canonical row';
  end if;
end;
$$;

-- The authorized provider performs the REAL completion action through the
-- canonical wrapper (provider action -> provider_mark_service_completed),
-- valid only at service_stage='em_execucao' and with provider_id bound to the
-- authenticated profile. Sets provider_completed_at on the SAME canonical row.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000003"}', true);

select public.provider_mark_service_completed(
  '26600000-0000-4000-8000-000000000031',
  'Sintético — serviço concluído no teste cross-channel.'
);

do $$
declare
  completed_at timestamptz;
  completed_stage text;
begin
  select provider_completed_at, service_stage
    into completed_at, completed_stage
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';
  if completed_at is null then
    raise exception 'Provider completion did not stamp provider_completed_at on the canonical row';
  end if;
  if completed_stage is distinct from 'em_execucao' then
    raise exception 'Provider completion changed the stage unexpectedly: %', completed_stage;
  end if;
end;
$$;

-- The concierge re-finds the SAME row, updated by the provider action (same
-- id, same canonical bindings, stage em_execucao + provider_completed_at
-- stamped by the provider) — again the listConciergeServiceRequests() RLS
-- surface.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000002"}', true);

do $$
declare
  re_found_stage text;
  re_found_provider uuid;
  re_found_completed_at timestamptz;
  approved_quote_count bigint;
  row_count bigint;
begin
  select service_stage, provider_id, provider_completed_at
    into re_found_stage, re_found_provider, re_found_completed_at
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031';

  -- SAME physical row the app created and accepted: no copy, no second record.
  if re_found_stage is distinct from 'em_execucao'
     or re_found_provider is distinct from '26605555-5555-4555-8555-555555555551'
     or re_found_completed_at is null then
    raise exception 'Concierge did not see the provider completion update on the canonical row';
  end if;
  if not exists (
    select 1 from public.service_quotes
    where status = 'approved' and service_request_id = '26600000-0000-4000-8000-000000000031'
  ) then
    raise exception 'Concierge did not see the customer-approved quote on the canonical row';
  end if;

  -- Defensive: there is only ONE service_requests row for this reference.
  select count(*) into row_count
  from public.service_requests
  where reference_code = 'VRH-ALPHA-266';
  if row_count <> 1 then
    raise exception 'Expected a single canonical row, found %', row_count;
  end if;
end;
$$;

-- The Cliente web/PWA sees the SAME row with the appropriate projection:
-- stage + provider + quote visible, EXACTLY the customer-facing surface
-- (getCustomerServiceRequest + getCustomerProviderProfile +
-- getQuoteForRequest). Internal provider data (homologation, performance,
-- environment) stays out of the customer reach.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000001"}', true);

do $$
declare
  customer_seen_stage text;
  provider_city text;
  provider_specialties jsonb;
  provider_rating numeric;
  hidden_rows bigint;
  exposed boolean;
begin
  select service_stage into customer_seen_stage
  from public.service_requests
  where id = '26600000-0000-4000-8000-000000000031'
    and created_by = '26600000-0000-4000-8000-000000000001';
  if customer_seen_stage is distinct from 'em_execucao' then
    raise exception 'Customer did not see the provider lifecycle update on the canonical row';
  end if;

  -- Customer-visible provider projection is exactly the app contract:
  -- getCustomerProviderProfile() selects the safe public directory columns only.
  select city, specialties, rating
    into provider_city, provider_specialties, provider_rating
  from public.service_providers
  where id = '26605555-5555-4555-8555-555555555551';
  if provider_city is distinct from 'Test City' or provider_specialties is null then
    raise exception 'Customer provider projection diverged from the safe public surface';
  end if;

  -- Customer also sees the approved quote (the decision surface) and the
  -- completion state on the same canonical row, but the quote carries no
  -- internal provider metadata beyond the canonical link.
  if not exists (
    select 1 from public.service_quotes
    where service_request_id = '26600000-0000-4000-8000-000000000031'
      and status = 'approved'
  ) then
    raise exception 'Customer did not see the approved quote on the canonical row';
  end if;
  if not exists (
    select 1 from public.service_requests
    where id = '26600000-0000-4000-8000-000000000031'
      and created_by = '26600000-0000-4000-8000-000000000001'
      and provider_completed_at is not null
  ) then
    raise exception 'Customer did not see the provider completion on the canonical row';
  end if;

  -- Internal provider data and non-public stamps must stay out of the customer
  -- reach (same login the customer app uses — RLS + column grants, not app code).
  select pg_catalog.has_column_privilege(
    'authenticated', 'public.service_providers', 'is_synthetic', 'select'
  ) into exposed;
  if exposed then
    raise exception 'is_synthetic must not be exposed through the public provider directory';
  end if;

  -- Homologation/performance internals are operations-only via RLS: even with
  -- the table-level grants, the customer login must not see any row.
  select count(*) into hidden_rows
  from public.provider_homologation_profiles;
  if hidden_rows <> 0 then
    raise exception 'Customer leaked provider homologation internals (%)', hidden_rows;
  end if;

  select count(*) into hidden_rows
  from public.provider_performance_events;
  if hidden_rows <> 0 then
    raise exception 'Customer leaked provider performance internals (%)', hidden_rows;
  end if;
end;
$$;

-- The concierge web path creates origin=concierge (on behalf of a customer).
-- Like services/service-requests/actions.ts createConciergeServiceRequest,
-- vehicle_id is null and vehicle_brand/model are free-form required fields.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000002"}', true);

insert into public.service_requests (
  id,
  reference_code,
  customer_name,
  customer_id,
  city,
  vehicle_brand,
  vehicle_model,
  customer_report,
  perceived_urgency,
  service_stage,
  origin,
  created_by
)
values (
  '26600000-0000-4000-8000-000000000032',
  'VRH-ALPHA-266-CONCIERGE',
  'Canonical Customer',
  '26600000-0000-4000-8000-000000000011',
  'Test City',
  'Chevrolet',
  'Onix',
  'Solicitação criada pela fila Concierge web.',
  'baixa',
  'solicitado',
  'concierge',
  '26600000-0000-4000-8000-000000000002'
);

-- The provider role receives assignments; it cannot create a canonical request.
set local role authenticated;
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000003"}', true);

select canonical266_test.expect_error(
  $$insert into public.service_requests (
    reference_code, customer_name, city, customer_report, perceived_urgency,
    service_stage, origin, created_by
  ) values (
    'VRH-ALPHA-266-PROVIDER', 'Provider', 'Test City', 'Tentativa de criação por prestador.', 'media',
    'solicitado', 'concierge', '26600000-0000-4000-8000-000000000003'
  )$$
);

-- An authenticated session without a canonical VERAH profile fails closed:
-- current_verah_role() is null, so the guard raises and the insert is denied
-- before RLS would even evaluate ownership.
set local role authenticated;
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000004"}', true);

select canonical266_test.expect_error(
  $$insert into public.service_requests (
    reference_code, customer_name, customer_id, city, customer_report,
    perceived_urgency, service_stage, origin, created_by
  ) values (
    'VRH-ALPHA-266-UNPROFILED', 'Unprofiled', '26600000-0000-4000-8000-000000000014',
    'Test City', 'Tentativa de criação sem perfil VERAH.', 'media',
    'solicitado', 'customer', '26600000-0000-4000-8000-000000000004'
  )$$
);

-- service_role WhatsApp/orchestration path must remain untouched (bypasses the
-- authenticated-only guard and allows the canonical whatsapp origin).
reset role;
insert into public.service_requests (
  id,
  reference_code,
  customer_name,
  customer_id,
  city,
  vehicle_brand,
  vehicle_model,
  customer_report,
  perceived_urgency,
  service_stage,
  origin,
  created_by,
  operation_context
)
values (
  '26600000-0000-4000-8000-000000000033',
  'VRH-ALPHA-266-WHATSAPP',
  'Canonical Customer',
  '26600000-0000-4000-8000-000000000011',
  'Test City',
  'Fiat',
  'Mobi',
  'Solicitação via canal WhatsApp (service_role).',
  'media',
  'solicitado',
  'whatsapp',
  null,
  'demo'
);

-- The environment probe must be readable by authenticated channels and expose
-- a non-secret environment label (never keys).
set local role authenticated;
select set_config('request.jwt.claim.sub', '26600000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"26600000-0000-4000-8000-000000000002"}', true);

do $$
declare
  probe jsonb;
begin
  probe := public.verah_canonical_environment();
  if probe is null or probe->>'environment' is null then
    raise exception 'Canonical environment probe must always return an environment label';
  end if;
  if jsonb_typeof(probe->'environment') is distinct from 'string' then
    raise exception 'Canonical environment probe environment must be a string';
  end if;
end;
$$;

rollback;