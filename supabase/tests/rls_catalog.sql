\set ON_ERROR_STOP on

-- This contract intentionally lists every application table in public.
-- Adding or removing a public table requires an explicit RLS review here.
do $$
declare
  expected_tables constant text[] := array[
    'ai_agents',
    'customer_channels',
    'customer_vehicles',
    'customers',
    'dispatcher_jobs',
    'integration_outbox',
    'service_attachments',
    'service_conversations',
    'service_messages',
    'service_providers',
    'service_quote_items',
    'service_quotes',
    'service_request_events',
    'service_requests',
    'system_settings',
    'user_profiles',
    'work_orders'
  ];
  actual_table_count integer;
  rls_enabled boolean;
  table_name text;
begin
  select count(*)
  into actual_table_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p');

  if actual_table_count <> cardinality(expected_tables) then
    raise exception
      'Expected % public application tables, found %. Update the RLS contract.',
      cardinality(expected_tables),
      actual_table_count;
  end if;

  foreach table_name in array expected_tables
  loop
    select c.relrowsecurity
    into rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and c.relkind in ('r', 'p');

    if not found then
      raise exception 'Expected public table % does not exist', table_name;
    end if;

    if not rls_enabled then
      raise exception 'RLS is disabled for public.%', table_name;
    end if;
  end loop;
end;
$$;
