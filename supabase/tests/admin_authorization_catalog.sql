-- Run only after the hardening migration in local or staging.
-- This script is read-only and fails when the authorization catalog drifts.

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
      raise exception 'RLS is not enabled for %', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'select')
      or has_table_privilege('anon', format('public.%I', table_name), 'insert')
      or has_table_privilege('anon', format('public.%I', table_name), 'update')
      or has_table_privilege('anon', format('public.%I', table_name), 'delete') then
      raise exception 'anon retains privileges on %', table_name;
    end if;
  end loop;
end;
$$;

do $$
declare
  policy_count integer;
begin
  select count(*) into policy_count
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'work_orders',
      'dispatcher_jobs',
      'ai_agents',
      'system_settings'
    )
    and (
      pg_get_expr(p.polqual, p.polrelid) like '%current_verah_role%'
      or pg_get_expr(p.polwithcheck, p.polrelid) like '%current_verah_role%'
    );

  if policy_count <> 6 then
    raise exception 'Expected 6 admin-scoped policies, found %', policy_count;
  end if;
end;
$$;

do $$
declare
  function_signature text;
  function_oid oid;
  definition text;
  config text[];
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
    function_oid := function_signature::regprocedure::oid;

    select pg_get_functiondef(p.oid), p.proconfig
      into definition, config
    from pg_proc p
    where p.oid = function_oid;

    if has_function_privilege('anon', function_oid, 'execute') then
      raise exception 'anon can execute %', function_signature;
    end if;

    if not has_function_privilege('authenticated', function_oid, 'execute') then
      raise exception 'authenticated cannot reach guarded function %', function_signature;
    end if;

    if not has_function_privilege('service_role', function_oid, 'execute') then
      raise exception 'service_role cannot execute internal function %', function_signature;
    end if;

    if config is null or not ('search_path=""' = any(config)) then
      raise exception 'Dispatcher function has unsafe search_path: % => %', function_signature, config;
    end if;

    if position('service_role' in definition) = 0
      or position('current_verah_role' in definition) = 0
      or position('admin' in definition) = 0 then
      raise exception 'Dispatcher function is missing Admin/service_role authorization: %', function_signature;
    end if;
  end loop;
end;
$$;