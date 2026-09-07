\set ON_ERROR_STOP on

begin;

create schema vehicle_mileage_log_test;

create function vehicle_mileage_log_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema vehicle_mileage_log_test to authenticated;
grant execute on function vehicle_mileage_log_test.expect_error(text) to authenticated;

-- RLS must be enabled and grants must be read-only for authenticated/anon/service_role.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'vehicle_mileage_logs'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is disabled for public.vehicle_mileage_logs';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.vehicle_mileage_logs', 'select')
    or pg_catalog.has_table_privilege('service_role', 'public.vehicle_mileage_logs', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_mileage_logs', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_mileage_logs', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.vehicle_mileage_logs', 'delete')
    or not pg_catalog.has_table_privilege('authenticated', 'public.vehicle_mileage_logs', 'select') then
    raise exception 'Unsafe grants on public.vehicle_mileage_logs';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.register_vehicle_mileage(uuid,integer,timestamptz,text,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.register_vehicle_mileage(uuid,integer,timestamptz,text,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.register_vehicle_mileage(uuid,integer,timestamptz,text,text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'private.reject_vehicle_mileage_log_mutation()', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'private.reject_vehicle_mileage_log_mutation()', 'execute') then
    raise exception 'Vehicle mileage log function grants are unsafe';
  end if;
end;
$$;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'mileage.one@example.invalid', '{}', '{}', now(), now()),
  ('a1111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'mileage.two@example.invalid', '{}', '{}', now(), now()),
  ('a1111111-1111-4111-8111-111111111113', 'authenticated', 'authenticated', 'mileage.unprofiled@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role, display_name)
values
  ('a1111111-1111-4111-8111-111111111111', 'customer', 'Mileage Customer One'),
  ('a1111111-1111-4111-8111-111111111112', 'customer', 'Mileage Customer Two')
on conflict (user_id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select public.start_customer_onboarding('Mileage Customer One');
select public.complete_customer_basic_onboarding('Mileage Customer One', 'pilot-alpha-onboarding-v1');

-- Canonical vehicle confirmation, then a first mileage reading. confirm_customer_vehicle
-- returns jsonb, so extract the canonical UUID before storing it as a psql variable.
select public.confirm_customer_vehicle(
  'ABC3865', 'Volkswagen', 'Gol', 2021, '1.0', null, 'Manual',
  'manual', null, null, false, true
)->>'vehicle_id' as vehicle_id \gset

select public.register_vehicle_mileage(
  :'vehicle_id', 15000, '2026-08-01T12:00:00Z', 'Entrada sintética.', 'mileage-first-reading'
) as first_log_id \gset

-- psql variables are not substituted inside dollar-quoted PL/pgSQL blocks. Persist
-- the runtime ids in transaction-local settings so the assertions remain deterministic.
select pg_catalog.set_config('vehicle_mileage_log_test.first_log_id', :'first_log_id', true);
select pg_catalog.set_config('vehicle_mileage_log_test.vehicle_id', :'vehicle_id', true);

do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 1
    or not exists (
      select 1
      from public.vehicle_mileage_logs
      where id = pg_catalog.current_setting('vehicle_mileage_log_test.first_log_id')::uuid
        and vehicle_id = pg_catalog.current_setting('vehicle_mileage_log_test.vehicle_id')::uuid
        and mileage_value = 15000
        and created_by = 'a1111111-1111-4111-8111-111111111111'
        and note = 'Entrada sintética.'
    ) then
    raise exception 'First mileage reading was not persisted canonically';
  end if;

  if (
    select current_mileage
    from public.customer_vehicles
    where id = pg_catalog.current_setting('vehicle_mileage_log_test.vehicle_id')::uuid
  ) <> 15000 then
    raise exception 'Registering mileage did not advance the canonical current mileage';
  end if;
end;
$$;

-- Non-regressive validation: a lower reading is rejected and the original history survives.
select vehicle_mileage_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_mileage(%L, 12000, %L, null, %L)',
    :'vehicle_id', '2026-08-02T12:00:00Z', 'mileage-regression'
  )
);
do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 1 then
    raise exception 'Regressive mileage reading destroyed the historical log';
  end if;
end;
$$;

-- Same vehicle higher reading advances the current mileage without duplicating.
select public.register_vehicle_mileage(
  :'vehicle_id', 17000, '2026-08-03T12:00:00Z', null, 'mileage-second-reading'
) as second_log_id \gset
select public.register_vehicle_mileage(
  :'vehicle_id', 17000, '2026-08-03T12:00:00Z', null, 'mileage-second-reading'
);
do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 2
    or (select count(*) from public.vehicle_mileage_logs where idempotency_key = 'mileage-second-reading') <> 1 then
    raise exception 'Mileage idempotency replay duplicated the log';
  end if;
end;
$$;

-- A different customer cannot read or register mileage on the first customer's vehicle.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111112', true);
do $$
begin
  if exists(select 1 from public.vehicle_mileage_logs) then
    raise exception 'Cross-customer mileage read leaked through RLS';
  end if;
end;
$$;
select vehicle_mileage_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_mileage(%L, 16000, %L, null, %L)',
    :'vehicle_id', '2026-08-04T12:00:00Z', 'cross-customer-mileage'
  )
);
do $$
begin
  if (select count(*) from public.vehicle_mileage_logs where created_by = 'a1111111-1111-4111-8111-111111111112') <> 0 then
    raise exception 'Cross-customer mileage write was persisted';
  end if;
end;
$$;

-- Even as service_role, the immutable trigger rejects mutating the history.
reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select vehicle_mileage_log_test.expect_error(
  pg_catalog.format('delete from public.vehicle_mileage_logs where id = %L', :'first_log_id')
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

-- An unprofiled caller cannot register or read mileage.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111113', true);
select vehicle_mileage_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_mileage(%L, 15000, %L, null, %L)',
    :'vehicle_id', '2026-08-05T12:00:00Z', 'unprofiled-mileage'
  )
);
do $$
begin
  if exists(select 1 from public.vehicle_mileage_logs) then
    raise exception 'Unprofiled identity read vehicle mileage logs';
  end if;
end;
$$;

-- Admin projection: operations can read mileage for audit but cannot mutate it.
reset role;
insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1111111-1111-4111-8111-111111111114', 'authenticated', 'authenticated', 'mileage.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_profiles(user_id, role, display_name)
values
  ('a1111111-1111-4111-8111-111111111114', 'admin', 'Mileage Admin')
on conflict (user_id) do nothing;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111114', true);
do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 2 then
    raise exception 'Admin cannot see all mileage logs for operations';
  end if;
end;
$$;
select vehicle_mileage_log_test.expect_error(
  pg_catalog.format(
    'select public.register_vehicle_mileage(%L, 18000, %L, null, %L)',
    :'vehicle_id', '2026-08-06T12:00:00Z', 'admin-mileage-write'
  )
);

rollback;
