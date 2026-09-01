\set ON_ERROR_STOP on

begin;

create schema vehicle_onboarding_test;
create function vehicle_onboarding_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema vehicle_onboarding_test to authenticated;
grant execute on function vehicle_onboarding_test.expect_error(text) to authenticated;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'vehicle.one@example.invalid', '{}', '{}', now(), now()),
  ('a1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'vehicle.two@example.invalid', '{}', '{}', now(), now()),
  ('a1400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'vehicle.provider@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000001', true);
select public.start_customer_onboarding('Cliente Veículo Um');
select public.complete_customer_basic_onboarding('Cliente Veículo Um', 'pilot-alpha-onboarding-v1');

-- A backend-created/unconfirmed vehicle does not silently complete customer onboarding.
reset role;
insert into public.customer_vehicles(owner_id, brand, model, year, plate)
values ('a1400000-0000-4000-8000-000000000001', 'Volkswagen', 'Polo', 2022, 'TMP1A23');
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000001', true);
do $$ begin
  if (public.refresh_customer_onboarding() ->> 'onboarding_status') <> 'in_progress' then
    raise exception 'Unconfirmed vehicle completed customer onboarding';
  end if;
end $$;
reset role;
delete from public.customer_vehicles where plate = 'TMP1A23';
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000001', true);

-- Validation and explicit confirmation are mandatory.
select vehicle_onboarding_test.expect_error(
  $$select public.confirm_customer_vehicle('ABC-12D3','Volkswagen','Polo',2022,p_customer_confirmed => true)$$
);
select vehicle_onboarding_test.expect_error(
  $$select public.confirm_customer_vehicle('ABC-1234','Volkswagen','Polo',2022,p_customer_confirmed => false)$$
);
select vehicle_onboarding_test.expect_error(
  $$insert into public.customer_vehicles(owner_id,brand,model,year,plate)
    values ('a1400000-0000-4000-8000-000000000001','Volkswagen','Polo',2022,'ABC1234')$$
);

create temporary table first_vehicle as
select public.confirm_customer_vehicle(
  'abc-1234', 'Volkswagen', 'Polo', 2022, '1.0 MPI', null, 'Manual',
  'manual', null, null, false, true
) as result;
insert into first_vehicle select public.confirm_customer_vehicle(
  'ABC1234', 'Volkswagen', 'Polo', 2022, '1.0 MPI', null, 'Manual',
  'manual', null, null, false, true
);

do $$ begin
  if (select count(distinct result ->> 'vehicle_id') from first_vehicle) <> 1
    or (select count(*) from public.customer_vehicles where plate = 'ABC1234') <> 1 then
    raise exception 'Vehicle confirmation retry duplicated the canonical vehicle';
  end if;
  if not exists (
    select 1 from public.customer_vehicles vehicle
    where vehicle.plate = 'ABC1234'
      and vehicle.data_source = 'customer_confirmed'
      and vehicle.lookup_source = 'manual'
      and vehicle.source_synthetic is false
      and vehicle.customer_confirmed_at is not null
  ) then raise exception 'Manual vehicle provenance was not preserved'; end if;
  if (public.refresh_customer_onboarding() ->> 'onboarding_status') <> 'completed' then
    raise exception 'Confirmed canonical vehicle did not complete onboarding';
  end if;
end $$;

-- Multiple vehicles remain supported and synthetic lookup stays explicit.
select public.confirm_customer_vehicle(
  'ABC1D23', 'Volkswagen', 'Polo', 2023, null, null, null,
  'local_fixture', 'verah_local_fixture', '2026-08-27T00:00:00Z', true, true
);
do $$ begin
  if (select count(*) from public.customer_vehicles) <> 2
    or not exists (
      select 1 from public.customer_vehicles
      where plate = 'ABC1D23' and lookup_source = 'local_fixture'
        and lookup_provider = 'verah_local_fixture' and source_synthetic
    ) then raise exception 'Multiple vehicles or synthetic provenance failed'; end if;
end $$;

-- A backend-created/unconfirmed vehicle with the same plate is promoted to
-- customer-confirmed state when the customer confirms matching details.
reset role;
insert into public.customer_vehicles(owner_id, brand, model, year, plate)
values ('a1400000-0000-4000-8000-000000000001', 'BYD', 'Dolphin', 2024, 'BCK2E34');
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000001', true);

-- An unconfirmed canonical vehicle cannot back a customer service request.
select vehicle_onboarding_test.expect_error($statement$
  insert into public.service_requests(
    reference_code, customer_name, vehicle_brand, vehicle_model, city,
    customer_report, perceived_urgency, service_stage, created_by, vehicle_id, origin
  ) values (
    'VRH-VEH-PENDING', 'Cliente Veículo Um', 'BYD', 'Dolphin', 'Franca',
    'Atendimento sintético com veículo ainda não confirmado', 'baixa', 'solicitado',
    'a1400000-0000-4000-8000-000000000001',
    (select id from public.customer_vehicles where plate = 'BCK2E34'), 'customer'
  )
$statement$);

create temporary table promoted_vehicle as
select public.confirm_customer_vehicle(
  'bck2e34', 'BYD', 'Dolphin', 2024, null, null, null,
  'manual', null, null, false, true
) as result;

do $$ begin
  if (select result ->> 'created' from promoted_vehicle) <> 'false'
    or (select count(*) from public.customer_vehicles where plate = 'BCK2E34') <> 1 then
    raise exception 'Matching confirmation duplicated a backend-created vehicle';
  end if;
  if not exists (
    select 1 from public.customer_vehicles
    where plate = 'BCK2E34'
      and data_source = 'customer_confirmed'
      and customer_confirmed_at is not null
  ) then
    raise exception 'Matching confirmation did not promote the existing vehicle';
  end if;
end $$;

-- The promoted canonical vehicle, even outside the fixed catalog, backs a service request.
insert into public.service_requests(
  reference_code, customer_name, vehicle_brand, vehicle_model, city,
  customer_report, perceived_urgency, service_stage, created_by, vehicle_id, origin
)
select
  'VRH-VEH-PROMOTED', 'Cliente Veículo Um', vehicle.brand, vehicle.model, 'Franca',
  'Atendimento sintético com veículo promovido e confirmado', 'baixa', 'solicitado',
  'a1400000-0000-4000-8000-000000000001', vehicle.id, 'customer'
from public.customer_vehicles vehicle
where vehicle.plate = 'BCK2E34';
do $$ begin
  if not exists (select 1 from public.service_requests where reference_code = 'VRH-VEH-PROMOTED') then
    raise exception 'Promoted canonical vehicle was not accepted by service request';
  end if;
end $$;

-- A second customer may confirm the same plate without learning or taking ownership of the first record.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000002', true);
select public.start_customer_onboarding('Cliente Veículo Dois');
select public.complete_customer_basic_onboarding('Cliente Veículo Dois', 'pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle(
  'ABC1234', 'Volkswagen', 'Polo', 2022, '1.0 MPI', null, 'Manual',
  'manual', null, null, false, true
);
do $$ begin
  if (select count(*) from public.customer_vehicles) <> 1 then
    raise exception 'Cross-customer vehicle existence leaked through RLS';
  end if;
end $$;
do $$
declare affected integer;
begin
  update public.customer_vehicles set nickname = 'Invadido'
  where owner_id = 'a1400000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-customer vehicle update was allowed'; end if;
end $$;

-- A service request cannot reference another customer's vehicle, but can use the caller's canonical vehicle.
select vehicle_onboarding_test.expect_error($statement$
  insert into public.service_requests(
    reference_code, customer_name, vehicle_brand, vehicle_model, city,
    customer_report, perceived_urgency, service_stage, created_by, vehicle_id, origin
  ) values (
    'VRH-VEH-CROSS', 'Cliente Dois', 'Volkswagen', 'Polo', 'Franca',
    'Atendimento sintético de autorização veicular', 'baixa', 'solicitado',
    'a1400000-0000-4000-8000-000000000002',
    (select (result ->> 'vehicle_id')::uuid from first_vehicle limit 1), 'customer'
  )
$statement$);
insert into public.service_requests(
  reference_code, customer_name, vehicle_brand, vehicle_model, city,
  customer_report, perceived_urgency, service_stage, created_by, vehicle_id, origin
)
select
  'VRH-VEH-OWN', 'Cliente Dois', vehicle.brand, vehicle.model, 'Franca',
  'Atendimento sintético com veículo canônico', 'baixa', 'solicitado',
  'a1400000-0000-4000-8000-000000000002', vehicle.id, 'customer'
from public.customer_vehicles vehicle
where vehicle.plate = 'ABC1234';
do $$ begin
  if not exists (select 1 from public.service_requests where reference_code = 'VRH-VEH-OWN') then
    raise exception 'Own canonical vehicle was not accepted by service request';
  end if;
end $$;

-- Providers have no general garage access.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000003', true);
select public.start_provider_application('Provider Vehicle Test Ltda', 'Provider Vehicle Test', 'Franca');
do $$ begin
  if exists (select 1 from public.customer_vehicles) then
    raise exception 'Provider gained general garage access';
  end if;
end $$;

rollback;
