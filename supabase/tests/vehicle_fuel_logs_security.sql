\set ON_ERROR_STOP on

begin;

create schema vehicle_fuel_log_test;

create function vehicle_fuel_log_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema vehicle_fuel_log_test to authenticated, service_role;
grant execute on function vehicle_fuel_log_test.expect_error(text) to authenticated, service_role;

-- RLS must be enabled and grants must be read-only for authenticated/anon/service_role
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'vehicle_fuel_logs'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is disabled for public.vehicle_fuel_logs';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.vehicle_fuel_logs', 'select')
    or pg_catalog.has_table_privilege('service_role', 'public.vehicle_fuel_logs', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_fuel_logs', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_fuel_logs', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_fuel_logs', 'delete')
    or not pg_catalog.has_table_privilege('authenticated', 'public.vehicle_fuel_logs', 'select') then
    raise exception 'Unsafe grants on public.vehicle_fuel_logs';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.register_vehicle_fuel(uuid,timestamptz,integer,numeric,numeric,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.register_vehicle_fuel(uuid,timestamptz,integer,numeric,numeric,text,text,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.register_vehicle_fuel(uuid,timestamptz,integer,numeric,numeric,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'private.reject_vehicle_fuel_log_mutation()', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'private.reject_vehicle_fuel_log_mutation()', 'execute') then
    raise exception 'Vehicle fuel log function grants are unsafe';
  end if;
end;
$$;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1111111-1111-4111-8111-111111111121', 'authenticated', 'authenticated', 'fuel.one@example.invalid', '{}', '{}', now(), now()),
  ('a1111111-1111-4111-8111-111111111122', 'authenticated', 'authenticated', 'fuel.two@example.invalid', '{}', '{}', now(), now()),
  ('a1111111-1111-4111-8111-111111111123', 'authenticated', 'authenticated', 'fuel.unprofiled@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role, display_name)
values
  ('a1111111-1111-4111-8111-111111111121', 'customer', 'Fuel Customer One'),
  ('a1111111-1111-4111-8111-111111111122', 'customer', 'Fuel Customer Two')
on conflict (user_id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111121', true);
select public.start_customer_onboarding('Fuel Customer One');
select public.complete_customer_basic_onboarding('Fuel Customer One', 'pilot-alpha-onboarding-v1');

-- Canonical vehicle confirmation, then a first fuel log with no valid
-- odometer interval: consumption must remain NULL deterministic.
select public.confirm_customer_vehicle(
  'ABC1234', 'Volkswagen', 'Gol', 2021, '1.0', null, 'Manual',
  'manual', null, null, false, true
)->>'vehicle_id' as vehicle_id \gset

select public.register_vehicle_fuel(
  :'vehicle_id', '2026-08-01T12:00:00Z', 15000, 40.500, 340.00, 'gasolina', 'Entrada sintética.', 'fuel-first-reading'
)->>'log_id' as first_log_id \gset

select pg_catalog.set_config('vehicle_fuel_log_test.first_log_id', :'first_log_id', true);
select pg_catalog.set_config('vehicle_fuel_log_test.vehicle_id', :'vehicle_id', true);

do $$
begin
  if (select count(*) from public.vehicle_fuel_logs) <> 1
    or not exists (
      select 1
      from public.vehicle_fuel_logs
      where id = pg_catalog.current_setting('vehicle_fuel_log_test.first_log_id')::uuid
        and vehicle_id = pg_catalog.current_setting('vehicle_fuel_log_test.vehicle_id')::uuid
       and odometer_value = 15000
        and liters = 40.5
        and total_amount = 340.00
       and fuel_type = 'gasolina'
       and consumption_kmpl is null
       and created_by = 'a1111111-1111-4111-8111-111111111121'
       and note = 'Entrada sintética.'
    ) then
    raise exception 'First fuel log was not persisted canonically';
  end if;
end;
$$;

-- Second refuel with a valid odometer interval derives deterministic consumption.
select public.register_vehicle_fuel(
  :'vehicle_id', '2026-08-10T12:00:00Z', 15600, 40, 350.00, 'gasolina', null, 'fuel-second-reading'
)->>'log_id' as second_log_id \gset
select pg_catalog.set_config('vehicle_fuel_log_test.second_log_id', :'second_log_id', true);

do $$
begin
  if (
    select consumption_kmpl
    from public.vehicle_fuel_logs
    where id = pg_catalog.current_setting('vehicle_fuel_log_test.second_log_id')::uuid
  ) <> 15.00 then
    raise exception 'Valid odometer interval did not derive deterministic consumption';
  end if;
end;
$$;

-- A same-odometer refuel (no distance traveled) leaves consumption NULL
select public.register_vehicle_fuel(
  :'vehicle_id', '2026-08-15T12:00:00Z', 15600, 35, 320.00, 'etanol', null, 'fuel-same-odometer'
)->>'log_id' as same_odometer_log_id \gset
select pg_catalog.set_config('vehicle_fuel_log_test.same_odometer_log_id', :'same_odometer_log_id', true);

do $$
begin
  if (
    select consumption_kmpl
    from public.vehicle_fuel_logs
    where id = pg_catalog.current_setting('vehicle_fuel_log_test.same_odometer_log_id')::uuid
  ) is not null then
    raise exception 'No-valid-interval fuel log derived a spurious consumption';
  end if;
end;
$$;

-- Idempotent replay returns the original log without duplicating it
do $$
begin
  if (
    select count(*)
    from public.vehicle_fuel_logs
    where idempotency_key = 'fuel-second-reading'
  ) <> 1 then
    raise exception 'Fuel idempotency replay duplicated the log';
  end if;
end;
$$;

-- Regressive odometer rejects the entry and preserves history
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_fuel(%L, %L, %L, %L, %L, %L, null, %L)',
    :'vehicle_id', '2026-08-20T12:00:00Z', 14000, 40, 330.00, 'gasolina', 'fuel-regression'
  )
);

-- A different customer cannot read or register fuel on the first customer's vehicle
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111122', true);
do $$
begin
  if exists(select 1 from public.vehicle_fuel_logs) then
    raise exception 'Cross-customer fuel read leaked through RLS';
  end if;
end;
$$;
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_fuel(%L, %L, %L, %L, %L, %L, null, %L)',
    :'vehicle_id', '2026-08-21T12:00:00Z', 16000, 40, 340.00, 'gasolina', 'cross-customer-fuel'
  )
);
do $$
begin
  if (select count(*) from public.vehicle_fuel_logs where created_by = 'a1111111-1111-4111-8111-111111111122') <> 0 then
    raise exception 'Cross-customer fuel write was persisted';
  end if;
end;
$$;

-- Even as service_role, the immutable trigger rejects mutating the history

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format('delete from public.vehicle_fuel_logs where id = %L', :'first_log_id')
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

-- An unprofiled caller cannot register or read fuel history

select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111123', true);
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_fuel(%L, %L, %L, %L, %L, %L, null, %L)',
    :'vehicle_id', '2026-08-22T12:00:00Z', 15000, 40, 340.00, 'gasolina', 'unprofiled-fuel'
  )
);
do $$
begin
  if exists(select 1 from public.vehicle_fuel_logs) then
    raise exception 'Unprofiled identity read vehicle fuel logs';
  end if;
end;
$$;

-- Admin projection: operations can read fuel receipts for audit but cannot mutate them
reset role;
insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1111111-1111-4111-8111-111111111124', 'authenticated', 'authenticated', 'fuel.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role, display_name)
values
  ('a1111111-1111-4111-8111-111111111124', 'admin', 'Fuel Admin')
on conflict (user_id) do nothing;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111124', true);
do $$
begin
  if (select count(*) from public.vehicle_fuel_logs) <> 3 then
    raise exception 'Admin cannot see all fuel receipts for operations';
  end if;
end;
$$;
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_fuel(%L, %L, %L, %L, %L, %L, null, %L)',
    :'vehicle_id', '2026-08-23T12:00:00Z', 18000, 40, 360.00, 'gasolina', 'admin-fuel-write'
  )
);

-- Invalid fuel type cannot be registered even by the owner
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111121', true);
select vehicle_fuel_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_fuel(%L, %L, %L, %L, %L, %L, null, %L)',
    :'vehicle_id', '2026-08-24T12:00:00Z', 17000, 40, 350.00, 'hidrogenio', 'invalid-fuel-type'
  )
);

rollback;