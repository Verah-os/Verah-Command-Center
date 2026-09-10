\set ON_ERROR_STOP on

begin;

create schema vehicle_charging_log_test;

create function vehicle_charging_log_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema vehicle_charging_log_test to authenticated, service_role;
grant execute on function vehicle_charging_log_test.expect_error(text) to authenticated, service_role;

-- RLS must be enabled and grants must be read-only for authenticated/anon/service_role
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'vehicle_charging_logs'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is disabled for public.vehicle_charging_logs';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.vehicle_charging_logs', 'select')
    or pg_catalog.has_table_privilege('service_role', 'public.vehicle_charging_logs', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_charging_logs', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_charging_logs', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_charging_logs', 'delete')
    or not pg_catalog.has_table_privilege('authenticated', 'public.vehicle_charging_logs', 'select') then
    raise exception 'Unsafe grants on public.vehicle_charging_logs';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.register_vehicle_charging(uuid,timestamptz,integer,numeric,numeric,integer,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.register_vehicle_charging(uuid,timestamptz,integer,numeric,numeric,integer,text,text,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.register_vehicle_charging(uuid,timestamptz,integer,numeric,numeric,integer,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'private.reject_vehicle_mileage_log_mutation()', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'private.reject_vehicle_mileage_log_mutation()', 'execute') then
    raise exception 'Vehicle charging log function grants are unsafe';
  end if;
end;
$$;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1111111-1111-4111-8111-111111111121', 'authenticated', 'authenticated', 'charge.one@example.invalid', '{}', '{}', now(), now()),
  ('b1111111-1111-4111-8111-111111111122', 'authenticated', 'authenticated', 'charge.two@example.invalid', '{}', '{}', now(), now()),
  ('b1111111-1111-4111-8111-111111111123', 'authenticated', 'authenticated', 'charge.unprofiled@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role, display_name)
values
  ('b1111111-1111-4111-8111-111111111121', 'customer', 'Charge Customer One'),
  ('b1111111-1111-4111-8111-111111111122', 'customer', 'Charge Customer Two')
on conflict (user_id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111121', true);
select public.start_customer_onboarding('Charge Customer One');
select public.complete_customer_basic_onboarding('Charge Customer One', 'pilot-alpha-onboarding-v1');

-- Canonical vehicle confirmation, then a first charging log with no valid
-- odometer interval: consumption must remain NULL deterministic.
select public.confirm_customer_vehicle(
  'CHG1234', 'Volkswagen', 'ID.4', 2023, 'Pro', null, 'Automatico',
  'manual', null, null, false, true
)->>'vehicle_id' as vehicle_id \gset

select public.register_vehicle_charging(
  :'vehicle_id', '2026-08-01T12:00:00Z', 15000, 22.500, 68.00, 82, 'recarga_publica', 'Entrada sintética.', 'charge-first-reading'
)->>'log_id' as first_log_id \gset
select pg_catalog.set_config('vehicle_charging_log_test.first_log_id', :'first_log_id', true);
select pg_catalog.set_config('vehicle_charging_log_test.vehicle_id', :'vehicle_id', true);

do $$
begin
  if (select count(*) from public.vehicle_charging_logs) <> 1
    or not exists (
      select 1
      from public.vehicle_charging_logs
      where id = pg_catalog.current_setting('vehicle_charging_log_test.first_log_id')::uuid
        and vehicle_id = pg_catalog.current_setting('vehicle_charging_log_test.vehicle_id')::uuid
       and odometer_value = 15000
        and kwh = 22.5
        and total_amount = 68.00
       and battery_percent =  82
        and charging_type = 'recarga_publica'
        and consumption_km_kwh is null
       and created_by = 'b1111111-1111-4111-8111-111111111121'
       and note = 'Entrada sintética.'
    ) then
    raise exception 'First charging log was not persisted canonically.';
  end if;
end;
$$;

-- Second charge with a valid odometer interval derives deterministic km/kWh.
select public.register_vehicle_charging(
  :'vehicle_id', '2026-08-10T12:00:00Z', 15600, 20, 62.00, null, null, null, 'charge-second-reading'
)->>'log_id' as second_log_id \gset
select pg_catalog.set_config('vehicle_charging_log_test.second_log_id', :'second_log_id', true);

do $$
begin
  if (
    select consumption_km_kwh
    from public.vehicle_charging_logs
    where id = pg_catalog.current_setting('vehicle_charging_log_test.second_log_id')::uuid
  ) <> 30.000 then
    raise exception 'Valid odometer interval did not derive deterministic km/kWh.';
  end if;
end;
$$;

-- A same-odometer charge (no distance traveled) leaves consumption NULL
select public.register_vehicle_charging(
  :'vehicle_id', '2026-08-15T12:00:00Z', 15600, 18, 54.00, 90, 'recarga_domestica', null, 'charge-same-odometer'
)->>'log_id' as same_odometer_log_id \gset
select pg_catalog.set_config('vehicle_charging_log_test.same_odometer_log_id', :'same_odometer_log_id', true);

do $$
begin
  if (
    select consumption_km_kwh
    from public.vehicle_charging_logs
    where id = pg_catalog.current_setting('vehicle_charging_log_test.same_odometer_log_id')::uuid
  ) is not null then
    raise exception 'No-valid-interval charging log derived a spurious consumption.';
  end if;
end;
$$;

-- Idempotent replay returns the original log without duplicating it
do $$
begin
  if (
    select count(*)
    from public.vehicle_charging_logs
    where idempotency_key = 'charge-second-reading'
  ) <> 1 then
    raise exception 'Charging idempotency replay duplicated the log.';
   end if;
end;
$$;

-- Regressive odometer rejects the entry and preserves history (fuel-domain parity: odometer never regresses across fuel, charging or mileage channels)
select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, null, null, %L)',
    :'vehicle_id', '2026-08-20T12:00:00Z', 14000, 22,  66.00, 'charge-regression'
  )
);

-- A fuel log on the same vehicle advances the shared odometer floor: a following
-- charging reading below it must be rejected without touching history.

select public.register_vehicle_fuel(
  :'vehicle_id', '2026-08-21T12:00:00Z', 16000,  40,  350.00, 'gasolina', null, 'charge-fuel-cross-floor'
)->>'log_id' as fuel_log_id \gset

do $$
begin
  if (
    select consumption_km_kwh
    from public.vehicle_charging_logs
    where id = pg_catalog.current_setting('vehicle_charging_log_test.second_log_id')::uuid
  ) <> 30.000 then
    raise exception 'Fuel log disturbed derived charging consumption.';
  end if;
end;
$$;

select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, null, null, %L)',
    :'vehicle_id', '2026-08-22T12:00:00Z', 15900,  20,  60.00, 'charge-below-fuel-floor'
  )
);

-- A different customer cannot read or register charging on the first customer's vehicle
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111122', true);
do $$
begin
  if exists(select 1 from public.vehicle_charging_logs) then
    raise exception 'Cross-customer charging read leaked through RLS.';
  end if;
end;
$$;
select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, null, null, %L)',
    :'vehicle_id', '2026-08-23T12:00:00Z',  17000,  20,  60.00, 'cross-customer-charge'
  )
);
do $$
begin
  if (select count(*) from public.vehicle_charging_logs where created_by = 'b1111111-1111-4111-8111-111111111122') <> 0 then
    raise exception 'Cross-customer charging write was persisted.';
  end if;
end;
$$;

-- Even as service_role, the immutable trigger rejects mutating the history
reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select vehicle_charging_log_test.expect_error(
  pg_catalog.format('delete from public.vehicle_charging_logs where id = %L', :'first_log_id')
);

reset role; set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

-- An unprofiled caller cannot register or read charging history
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111123', true);
select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, null, null, %L)',
    :'vehicle_id', '2026-08-24T12:00:00Z',  17000,  20,  60.00, 'unprofiled-charge'
  )
);
do $$
begin
  if exists(select 1 from public.vehicle_charging_logs) then
    raise exception 'Unprofiled identity read vehicle charging logs.';
  end if;
end;
$$;

-- Admin projection: operations can read charging receipts for audit but cannot mutate them
reset role;
insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1111111-1111-4111-8111-111111111124', 'authenticated', 'authenticated', 'charge.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role, display_name)
values
  ('b1111111-1111-4111-8111-111111111124', 'admin', 'Charge Admin')
on conflict (user_id) do nothing;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111124', true);
do $$
begin
  if (select count(*) from public.vehicle_charging_logs) <> 3 then
    raise exception 'Admin cannot see all charging receipts for operations.';
  end if;
end;
$$;
select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, null, null, %L)',
    :'vehicle_id', '2026-08-25T12:00:00Z',  18000,  20,  60.00, 'admin-charge-write'
  )
);

-- Invalid charging type cannot be registered even by the owner
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111121', true);
select vehicle_charging_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_charging(%L, %L, %L, %L, %L, null, %L, null, null)',
    :'vehicle_id', '2026-08-26T12:00:00Z',  17000,  20,  60.00, 'invalid-charging-type'
  )
);

rollback;
