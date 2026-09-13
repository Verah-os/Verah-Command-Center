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

-- The concierge web path creates origin=concierge (on behalf of a customer).
-- Like services/service-requests/actions.ts createConciergeServiceRequest,
-- vehicle_id is null and vehicle_brand/model are free-form required fields.
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