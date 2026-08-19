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
    'intake_assessments',
    'intake_session_events',
    'intake_sessions',
    'service_attachments',
    'service_conversations',
    'service_messages',
    'service_providers',
    'service_quoteability_rules',
    'service_quote_items',
    'service_quotes',
    'service_request_events',
    'service_requests',
    'service_taxonomy_entries',
    'service_taxonomy_related_services',
    'system_settings',
    'quote_intelligence_assessments',
    'quote_comparison_members',
    'quote_comparison_sets',
    'quote_quality_assessments',
    'quote_rule_requirements',
    'quote_rule_sets',
    'provider_invitation_events',
    'provider_invitation_responses',
    'provider_invitations',
    'provider_selections',
    'second_opinion_events',
    'second_opinion_requests',
    'service_quote_revisions',
    'user_profiles',
    'vehicle_movement_guidance',
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
