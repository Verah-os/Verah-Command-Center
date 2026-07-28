\set ON_ERROR_STOP on

begin;

create or replace function issue43_test.expect_admin_denied(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise exception 'Expected administrative authorization failure: %', statement;
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

grant usage on schema issue43_test to authenticated;
grant execute on function issue43_test.expect_admin_denied(text)
  to authenticated;

do $$
declare
  expected_count bigint;
  actual_count bigint;
  resource_name text;
begin
  for resource_name, expected_count in
    select resource, row_count from issue43_test.baseline_counts
  loop
    execute format('select count(*) from public.%I', resource_name)
      into actual_count;
    if actual_count <> expected_count then
      raise exception
        'Data changed for %, expected %, found %',
        resource_name,
        expected_count,
        actual_count;
    end if;
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'work_orders',
    'dispatcher_jobs',
    'ai_agents',
    'system_settings'
  ]
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relrowsecurity
    ) then
      raise exception 'RLS is disabled for %', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'select')
      or has_table_privilege('anon', format('public.%I', table_name), 'insert')
      or has_table_privilege('anon', format('public.%I', table_name), 'update')
      or has_table_privilege('anon', format('public.%I', table_name), 'delete') then
      raise exception 'anon retains a privilege on %', table_name;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.work_orders', 'update')
    or has_table_privilege('authenticated', 'public.work_orders', 'delete')
    or has_table_privilege('authenticated', 'public.dispatcher_jobs', 'insert')
    or has_table_privilege('authenticated', 'public.dispatcher_jobs', 'update')
    or has_table_privilege('authenticated', 'public.dispatcher_jobs', 'delete')
    or has_table_privilege('authenticated', 'public.ai_agents', 'insert')
    or has_table_privilege('authenticated', 'public.ai_agents', 'update')
    or has_table_privilege('authenticated', 'public.ai_agents', 'delete')
    or has_table_privilege('authenticated', 'public.system_settings', 'insert')
    or has_table_privilege('authenticated', 'public.system_settings', 'delete') then
    raise exception 'authenticated retains an excessive table privilege';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.system_settings',
    'value',
    'update'
  ) or has_column_privilege(
    'authenticated',
    'public.system_settings',
    'key',
    'update'
  ) then
    raise exception 'system_settings column grants are not minimal';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'service_requests'
      and p.polname = 'Role scoped service request access'
  ) then
    raise exception 'The role-scoped service request policy was removed';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_vehicles'
      and p.polname = 'Customers and admins read customer vehicles'
  ) then
    raise exception 'The customer vehicle read policy was removed';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.user_profiles (user_id, role, display_name)
    values (
      '55555555-5555-4555-8555-555555555555',
      'owner',
      'Invalid synthetic role'
    );
    raise exception 'Invalid role was accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

do $$
begin
  if (select count(*) from public.work_orders) <> 0
    or (select count(*) from public.dispatcher_jobs) <> 0
    or (select count(*) from public.ai_agents) <> 0
    or (select count(*) from public.system_settings) <> 0 then
    raise exception 'Customer can read administrative resources';
  end if;

  if (select count(*) from public.service_requests) <> 1
    or (select count(*) from public.customer_vehicles) <> 1 then
    raise exception 'Customer normal flow regressed';
  end if;
end;
$$;

select issue43_test.expect_admin_denied(
  'select public.dispatcher_engine_start_next_job()'
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_finish_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_retry_failed_job(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_completed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_failed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_complete_ai_runtime_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true,
    1,
    null,
    null,
    null
  )$$
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

do $$
begin
  if (select count(*) from public.work_orders) <> 0
    or (select count(*) from public.system_settings) <> 0 then
    raise exception 'Concierge can read administrative resources';
  end if;

  if (select count(*) from public.service_requests) <> 1 then
    raise exception 'Concierge normal flow regressed';
  end if;
end;
$$;

select issue43_test.expect_admin_denied(
  'select public.dispatcher_engine_start_next_job()'
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_finish_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_retry_failed_job(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_completed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_failed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_complete_ai_runtime_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true,
    1,
    null,
    null,
    null
  )$$
);

select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

do $$
begin
  if (select count(*) from public.work_orders) <> 0
    or (select count(*) from public.system_settings) <> 0 then
    raise exception 'Provider can read administrative resources';
  end if;

  if (select count(*) from public.service_requests) <> 1 then
    raise exception 'Provider normal flow regressed';
  end if;
end;
$$;

select issue43_test.expect_admin_denied(
  'select public.dispatcher_engine_start_next_job()'
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_finish_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_retry_failed_job(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_completed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_failed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_complete_ai_runtime_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true,
    1,
    null,
    null,
    null
  )$$
);

select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  true
);

do $$
begin
  if public.current_verah_role() is not null then
    raise exception 'Authenticated user without profile acquired a role';
  end if;

  if (select count(*) from public.work_orders) <> 0
    or (select count(*) from public.service_requests) <> 0 then
    raise exception 'Authenticated user without profile acquired access';
  end if;
end;
$$;

select issue43_test.expect_admin_denied(
  'select public.dispatcher_engine_start_next_job()'
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_finish_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_retry_failed_job(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_completed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_engine_mark_job_failed(
    '00000000-0000-4000-8000-000000000001'
  )$$
);
select issue43_test.expect_admin_denied(
  $$select public.dispatcher_complete_ai_runtime_job(
    '00000000-0000-4000-8000-000000000001',
    'synthetic',
    true,
    1,
    null,
    null,
    null
  )$$
);

select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);

do $$
declare
  updated_rows bigint;
begin
  if (select count(*) from public.work_orders) < 1
    or (select count(*) from public.dispatcher_jobs) < 1
    or (select count(*) from public.ai_agents) < 1
    or (select count(*) from public.system_settings) < 1 then
    raise exception 'Admin cannot read an administrative resource';
  end if;

  insert into public.work_orders (
    id,
    title,
    description,
    status,
    priority,
    owner,
    origin,
    category
  )
  values (
    'ISSUE43-ADMIN-INSERT',
    'Synthetic admin insert',
    'Rolled back after the authorization test',
    'Backlog',
    'Low',
    'Issue 43 test',
    'Manual',
    'engineering'
  );

  update public.system_settings
  set value = value
  where is_editable
    and id = (
      select id
      from public.system_settings
      where is_editable
      order by id
      limit 1
    );
  get diagnostics updated_rows = row_count;

  if updated_rows <> 1 then
    raise exception 'Admin cannot update an editable setting';
  end if;
end;
$$;

select public.dispatcher_engine_start_next_job();
select public.dispatcher_engine_finish_job(
  '00000000-0000-4000-8000-000000000001',
  'synthetic',
  true
);
select public.dispatcher_engine_retry_failed_job(
  '00000000-0000-4000-8000-000000000001'
);
select public.dispatcher_engine_mark_job_completed(
  '00000000-0000-4000-8000-000000000001'
);
select public.dispatcher_engine_mark_job_failed(
  '00000000-0000-4000-8000-000000000001'
);
select public.dispatcher_complete_ai_runtime_job(
  '00000000-0000-4000-8000-000000000001',
  'synthetic',
  true,
  1,
  null,
  null,
  null
);

reset role;

set local role anon;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.dispatcher_engine_start_next_job()',
    'public.dispatcher_engine_finish_job(uuid,text,boolean)',
    'public.dispatcher_engine_retry_failed_job(uuid)',
    'public.dispatcher_engine_mark_job_completed(uuid)',
    'public.dispatcher_engine_mark_job_failed(uuid)',
    'public.dispatcher_complete_ai_runtime_job(uuid,text,boolean,integer,text,text,text)'
  ]
  loop
    if has_function_privilege(current_user, function_signature, 'execute') then
      raise exception 'anon can execute %', function_signature;
    end if;
  end loop;
end;
$$;

reset role;

rollback;
