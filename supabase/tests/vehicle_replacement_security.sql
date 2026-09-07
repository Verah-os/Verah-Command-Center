\set ON_ERROR_STOP on

begin;

create schema vehicle_replacement_test;
create function vehicle_replacement_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema vehicle_replacement_test to authenticated;
grant execute on function vehicle_replacement_test.expect_error(text) to authenticated;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b1400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'replacement.one@example.invalid', '{}', '{}', now(), now()),
  ('b1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'replacement.two@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1400000-0000-4000-8000-000000000001', true);
select public.start_customer_onboarding('Cliente Troca Um');
select public.complete_customer_basic_onboarding('Cliente Troca Um', 'pilot-alpha-onboarding-v1');

create temporary table replaced_vehicles as
select public.replace_customer_vehicle(
  '00000000-0000-4000-8000-000000000000', null, true
) as result;

do $$ begin
  if not exists (select 1 from public.customer_vehicles where id = '00000000-0000-4000-8000-000000000000' and active is not true) then
    raise exception 'Replace did not preserve the canonical vehicle row';
  end if;
end $$;

-- Only the customer's own active vehicle can be replaced. A second customer cannot
-- touch the first customer's garage through the RPC (RLS would also block direct tampering).
select pg_catalog.set_config('request.jwt.claim.sub', 'b1400000-0000-4000-8000-000000000002', true);
select vehicle_replacement_test.expect_error(
  $$select public.replace_customer_vehicle('b1400000-0000-4000-8000-000000000001', null, true)$$
);

-- An explicit confirmation is mandatory.
select vehicle_replacement_test.expect_error(
  $$select public.replace_customer_vehicle('b1400000-0000-4000-8000-000000000001', null, false)$$
);

-- Replacing does not erase the historical service record that references the vehicle.
select pg_catalog.set_config('request.jwt.claim.sub', 'b1400000-0000-4000-8000-000000000001', true);
select public.confirm_customer_vehicle(
  'XYZ9876', 'Fiat', 'Uno', 2020, null, null, 'Manual', 'manual', null, null, false, true
);
insert into public.service_requests(
  reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year, city,
  customer_report, perceived_urgency, service_stage, created_by, origin, vehicle_id
)
select
  'VRH-REPLACE-KEEP', 'Cliente Troca Um', 'Fiat', 'Uno', 2020,, 'Franca',
  'Atendimento sintético de preservação de histórico', 'baixa', 'solicitado',
  'b1400000-0000-4000-8000-000000000001', 'customer',
  (select id from public.customer_vehicles where plate = 'XYZ9876')
;
select public.replace_customer_vehicle(
  (select id from public.customer_vehicles where plate = 'XYZ9876'), null,, true
);

do $$ begin
  if not exists (
    select 1 from public.service_requests where reference_code = 'VRH-REPLACE-KEEP'
  ) then
    raise exception 'Replacement removed historical service request';
  end if;
  if exists (select 1 from public.customer_vehicles where plate = 'XYZ9876' and active) then
    raise exception 'Replacement did not deactivate the canonical vehicle';
  end if;
end $$;

rollback;