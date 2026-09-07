\set ON_ERROR_STOP on

-- Issue #213: canonical mileage logs must be owner-scoped, append-only and
-- non-regressive. Cross-customer reads/writes must fail closed.

begin;

create schema vehicle_mileage_test;
create table vehicle_mileage_test.other_vehicle (vehicle_id uuid primary key);
grant insert, select on vehicle_mileage_test.other_vehicle to authenticated;;
create function vehicle_mileage_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema vehicle_mileage_test to authenticated;
grant execute on function vehicle_mileage_test.expect_error(text) to authenticated;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'mileage.one@example.invalid', '{}', '{}', now(), now()),
  ('a1700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'mileage.two@example.invalid', '{}', '{}', now(), now()),
  ('a1700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mileage.provider@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

-- Two customers each confirm their own canonical vehicle.



set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000001', true);
select public.start_customer_onboarding('Cliente Quilometragem Um');
select public.complete_customer_basic_onboarding('Cliente Quilometragem Um', 'pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle(
  'ABC1234', 'Volkswagen', 'Polo', 2022, '1.0 MPI', null, 'Manual',
  'manual', null, null, false, true
);

select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000002', true);
select public.start_customer_onboarding('Cliente Quilometragem Dois');
select public.complete_customer_basic_onboarding('Cliente Quilometragem Dois', 'pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle(
  'XYZ9O87', 'Fiat', 'Argo', 2023, null, null, null,
  'manual', null, null, false, true
);

-- Capture the first customer's vehicle id for cross-tenant negative tests.

select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000001', true);
insert into vehicle_mileage_test.other_vehicle
select vehicle.id from public.customer_vehicles vehicle where vehicle.plate = 'ABC1234';

-- Owner inserts are allowedand history is returned for the owned vehicle only.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000001', true);
insert into public.vehicle_mileage_logs (vehicle_id, recorded_at, odometer_km, note, created_by)
select vehicle.id, '2026-09-01T10:00:00Z', 12000, 'Registro inicial', 'a1700000-0000-4000-8000-000000000001'
from public.customer_vehicles vehicle
where vehicle.plate = 'ABC1234';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.vehicle_mileage_logs;
  if visible_count <> 1 then
    raise exception 'Owner mileage visibility leaked across customers: %', visible_count;
  end if;
  if not exists (
    select 1 from public.vehicle_mileage_logs
    where odometer_km =12000
    and note = 'Registro inicial'
   and created_by = 'a1700000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Own mileage log was not persisted';
  end if;
end
$$;

-- Minimal grants: no UPDATE/DELETE is granted, so modifications must fail closed
-- (permission denied), not silently no-op.

do $$
begin
  begin
    update public.vehicle_mileage_logs
    set odometer_km =13000
    where created_by = 'a1700000-0000-4000-8000-000000000001';
    raise exception 'Mileage history update was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;

do $$
begin
  begin
    delete from public.vehicle_mileage_logs
    where created_by = 'a1700000-0000-4000-8000-000000000001';
    raise exception 'Mileage history delete was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Non-regressive km constraint blocks lowering the latest value, without destroying
-- the original row.


select vehicle_mileage_test.expect_error($statement$
  insert into public.vehicle_mileage_logs (vehicle_id, recorded_at, odometer_km, created_by)
  select vehicle.id, '2026-09-02T10:00:00Z', 11999, 'a1700000-0000-4000-8000-000000000001'
  from public.customer_vehicles vehicle
  where vehicle.plate = 'ABC1234'
$statement$);
do $$
declare
  visible_count integer;begin
  select count(*) into visible_count from public.vehicle_mileage_logs;
  if visible_count <> 1 then
    raise exception 'Blocked regression destroyed or duplicated mileage history';
  end if;
end
$$;

-- Same-owner advancement remains allowed (including exactly equal readings):
insert into public.vehicle_mileage_logs (vehicle_id, recorded_at, odometer_km, created_by)
select vehicle.id,'2026-09-02T12:00:00Z',  12000, 'a1700000-0000-4000-8000-000000000001'
from public.customer_vehicles vehicle
where vehicle.plate = 'ABC1234';
insert into public.vehicle_mileage_logs (vehicle_id, recorded_at, odometer_km, created_by)
select vehicle.id,'2026-09-03T09:00:00Z',  12500, 'a1700000-0000-4000-8000-000000000001'
from public.customer_vehicles vehicle
where vehicle.plate = 'ABC1234';

-- A customer cannot read another customer's mileage history, even knowing the
-- vehicle id. The RLS filter must hide all rows.

select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.vehicle_mileage_logs) then
    raise exception 'Cross-customer mileage read leaked through RLS';
  end if;
end
$$;

-- A customer cannot write mileage for another customer's vehicle, even when the
-- vehicle id is already known from an earlier legitimate read.



select vehicle_mileage_test.expect_error($statement$
  insert into public.vehicle_mileage_logs (vehicle_id, recorded_at, odometer_km, created_by)
  values (
    (select vehicle_id from vehicle_mileage_test.other_vehicle limit 1),
    '2026-09-04T10:00:00Z', 9000,
    'a1700000-0000-4000-8000-000000000002'
  )
$statement$);

-- Providers have no mileage access at all (garage access is already forbidden).
select pg_catalog.set_config('request.jwt.claim.sub', 'a1700000-0000-4000-8000-000000000003', true);
select public.start_provider_application('Provider Mileage Test Ltda', 'Provider Mileage Test', 'Franca');
do $$
begin
  if exists (select 1 from public.vehicle_mileage_logs) then
    raise exception 'Provider gained general mileage access';
  end if;
end
$$;

rollback;