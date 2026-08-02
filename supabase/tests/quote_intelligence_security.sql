\set ON_ERROR_STOP on

begin;

create schema quote_intelligence_test;

create function quote_intelligence_test.expect_denied(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise exception 'Expected authorization failure: %', statement;
  exception when insufficient_privilege then null;
  end;
end;
$$;

grant usage on schema quote_intelligence_test to anon, authenticated;
grant execute on function quote_intelligence_test.expect_denied(text) to anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'quote_rule_sets',
    'service_taxonomy_entries',
    'service_quoteability_rules',
    'quote_rule_requirements',
    'service_taxonomy_related_services',
    'quote_intelligence_assessments'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is disabled for public.%', table_name;
    end if;

    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe grants on public.%', table_name;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege(
      'service_role',
      'public.classify_quote_intelligence(uuid,text,jsonb,text)',
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.classify_quote_intelligence(uuid,text,jsonb,text)',
      'execute'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.classify_quote_intelligence(uuid,text,jsonb,text)',
      'execute'
    ) then
    raise exception 'classify_quote_intelligence grants are unsafe';
  end if;
end;
$$;

do $$
begin
  if (select count(*) from public.quote_rule_sets where version = 'quoteability-alpha-1' and status = 'active') <> 1 then
    raise exception 'Expected one active quoteability-alpha-1 rule set';
  end if;

  if (select count(*) from public.service_taxonomy_entries where active) <> 59
    or (select count(*) from public.service_quoteability_rules where active) <> 59 then
    raise exception 'Expected exactly 59 active taxonomy entries and rules';
  end if;

  if not exists (
    select 1
    from public.service_taxonomy_entries
    where service_code = 'accessory.accessibility_adaptation'
      and complexity = 'specialist'
      and dismantling_level = 'major'
      and hidden_cost_risk = 'high'
  ) then
    raise exception 'Labor Intelligence specialist contract is missing';
  end if;

  if exists (
    select 1
    from public.service_taxonomy_entries
    where minimum_minutes > typical_minutes
      or typical_minutes > maximum_minutes
  ) then
    raise exception 'Labor Intelligence time bounds are inconsistent';
  end if;

  if not exists (
    select 1
    from public.service_taxonomy_related_services
    where relationship_type = 'frequent'
  ) then
    raise exception 'Related services catalog is empty';
  end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'quote.customer@example.invalid', '{}', '{}', now(), now()),
  ('92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'quote.provider@example.invalid', '{}', '{}', now(), now()),
  ('93333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'quote.concierge@example.invalid', '{}', '{}', now(), now()),
  ('94444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'quote.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (
  id, name, trade_name, city, specialties, status, rating
)
values (
  '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Synthetic Quote Provider',
  'Synthetic Quote Provider',
  'Test City',
  '["suspensao","acessorios"]'::jsonb,
  'active',
  5
)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('91111111-1111-4111-8111-111111111111', 'customer', 'Synthetic Quote Customer', null),
  ('92222222-2222-4222-8222-222222222222', 'provider', 'Synthetic Quote Provider', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('93333333-3333-4333-8333-333333333333', 'concierge', 'Synthetic Quote Concierge', null),
  ('94444444-4444-4444-8444-444444444444', 'admin', 'Synthetic Quote Admin', null)
on conflict (user_id) do nothing;

insert into public.service_requests (
  id,
  reference_code,
  customer_name,
  vehicle_brand,
  vehicle_model,
  vehicle_year,
  city,
  customer_report,
  perceived_urgency,
  service_stage,
  origin,
  created_by
)
values
  (
    '95555555-5555-4555-8555-555555555551',
    'VERAH-QI-001',
    'Synthetic Quote Customer',
    'Honda',
    'Fit',
    2018,
    'Test City',
    'Solicitação sintética de película.',
    'baixa',
    'concierge_aceitou',
    'concierge',
    '91111111-1111-4111-8111-111111111111'
  ),
  (
    '95555555-5555-4555-8555-555555555552',
    'VERAH-QI-002',
    'Synthetic Quote Customer',
    'Honda',
    'Fit',
    2018,
    'Test City',
    'Ruído sintético na suspensão.',
    'media',
    'concierge_aceitou',
    'concierge',
    '91111111-1111-4111-8111-111111111111'
  ),
  (
    '95555555-5555-4555-8555-555555555553',
    'VERAH-QI-003',
    'Synthetic Quote Customer',
    'Honda',
    'Fit',
    2018,
    'Test City',
    'Superaquecimento sintético.',
    'critica',
    'concierge_aceitou',
    'concierge',
    '91111111-1111-4111-8111-111111111111'
  )
on conflict (id) do nothing;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"91111111-1111-4111-8111-111111111111"}', true);

do $$
begin
  if exists (select 1 from public.quote_rule_sets)
    or exists (select 1 from public.quote_intelligence_assessments) then
    raise exception 'Customer can read internal Quote Intelligence data';
  end if;
end;
$$;

select quote_intelligence_test.expect_denied(
  $$select public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551'::uuid,
    'accessory.tint',
    '{}'::jsonb,
    'customer-denied'
  )$$
);

select pg_catalog.set_config('request.jwt.claim.sub', '92222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"92222222-2222-4222-8222-222222222222"}', true);

do $$
begin
  if exists (select 1 from public.quote_rule_sets)
    or exists (select 1 from public.quote_intelligence_assessments) then
    raise exception 'Provider can read internal Quote Intelligence data';
  end if;
end;
$$;

select quote_intelligence_test.expect_denied(
  $$select public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551'::uuid,
    'accessory.tint',
    '{}'::jsonb,
    'provider-denied'
  )$$
);

select pg_catalog.set_config('request.jwt.claim.sub', '93333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"93333333-3333-4333-8333-333333333333"}', true);

do $$
begin
  if (select count(*) from public.quote_rule_sets) <> 1
    or (select count(*) from public.service_taxonomy_entries) <> 59 then
    raise exception 'Concierge cannot read the active catalog';
  end if;
end;
$$;

do $$
declare
  first_result record;
  duplicate_result record;
  inspection_result record;
  emergency_result record;
  compatibility_result record;
  incompatible_result record;
  evidence_result record;
begin
  select * into first_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551',
    'accessory.tint',
    '{
      "available_data":[
        "vehicle_brand","vehicle_model","vehicle_year","vehicle_version",
        "service_scope","commercial_scope","window_count","previous_film_removal"
      ],
      "available_evidence":["installation_area_photo"],
      "available_measurements":[],
      "available_documents":["legal_transparency_check","film_type","product_reference"],
      "compatibility_status":"confirmed",
      "commercial_scope":"product_and_installation",
      "evidence_refs":[]
    }'::jsonb,
    'quote-alpha:tint:1'
  );

  if first_result.quote_mode <> 'direct_accessory_quote'
    or first_result.comparison_readiness <> 'partially_ready'
    or first_result.compatibility_status <> 'confirmed'
    or first_result.commercial_scope <> 'product_and_installation'
    or first_result.requires_human_review is not true
    or first_result.rule_version <> 'quoteability-alpha-1'
    or first_result.engine_version <> 'quote-intelligence-1.0.0'
    or jsonb_array_length(first_result.required_questions) <> 0
    or jsonb_array_length(first_result.required_evidence) <> 0
    or jsonb_array_length(first_result.required_documents) <> 0 then
    raise exception 'Direct accessory classification contract failed';
  end if;

  select * into duplicate_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551',
    'accessory.tint',
    '{
      "available_data":[
        "vehicle_brand","vehicle_model","vehicle_year","vehicle_version",
        "service_scope","commercial_scope","window_count","previous_film_removal"
      ],
      "available_evidence":["installation_area_photo"],
      "available_measurements":[],
      "available_documents":["legal_transparency_check","film_type","product_reference"],
      "compatibility_status":"confirmed",
      "commercial_scope":"product_and_installation",
      "evidence_refs":[]
    }'::jsonb,
    'quote-alpha:tint:1'
  );

  if duplicate_result.assessment_id <> first_result.assessment_id
    or (select count(*) from public.quote_intelligence_assessments where idempotency_key = 'quote-alpha:tint:1') <> 1
    or (select count(*) from public.service_request_events where idempotency_key = 'quoteability.assessed:' || first_result.assessment_id::text) <> 1 then
    raise exception 'Quote Intelligence idempotency failed';
  end if;

  select * into inspection_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555552',
    'suspension.noise',
    '{
      "available_data":["vehicle_brand","vehicle_model","vehicle_year","service_scope"],
      "available_evidence":[],
      "available_measurements":[],
      "available_documents":[]
    }'::jsonb,
    'quote-alpha:suspension:1'
  );

  if inspection_result.quote_mode <> 'inspection_first'
    or inspection_result.comparison_readiness <> 'not_ready'
    or inspection_result.vehicle_movement <> 'inspection_location_required'
    or jsonb_array_length(inspection_result.required_questions) < 2
    or jsonb_array_length(inspection_result.required_evidence) < 1 then
    raise exception 'Inspection-first classification contract failed';
  end if;

  select * into emergency_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555553',
    'engine.overheating',
    '{}'::jsonb,
    'quote-alpha:emergency:1'
  );

  if emergency_result.quote_mode <> 'emergency'
    or emergency_result.comparison_readiness <> 'blocked'
    or emergency_result.risk_level <> 'critical'
    or emergency_result.vehicle_movement <> 'do_not_move'
    or emergency_result.next_action ~* 'segur[oa] para circular' then
    raise exception 'Emergency fail-closed contract failed';
  end if;

  select * into compatibility_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551',
    'accessory.multimedia',
    '{"available_data":[],"available_evidence":[],"available_measurements":[],"available_documents":[]}'::jsonb,
    'quote-alpha:compatibility:1'
  );

  if compatibility_result.quote_mode <> 'compatibility_check_required'
    or compatibility_result.comparison_readiness <> 'not_ready' then
    raise exception 'Unknown compatibility was not blocked';
  end if;

  select * into incompatible_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551',
    'accessory.multimedia',
    '{
      "available_data":[],"available_evidence":[],"available_measurements":[],"available_documents":[],
      "compatibility_status":"incompatible"
    }'::jsonb,
    'quote-alpha:incompatible:1'
  );

  if incompatible_result.comparison_readiness <> 'blocked'
    or incompatible_result.next_action !~* 'bloquear' then
    raise exception 'Incompatible accessory was not blocked';
  end if;

  begin
    perform public.classify_quote_intelligence(
      '95555555-5555-4555-8555-555555555551',
      'accessory.tint',
      '{"available_data":["telefone:5511999999999"]}'::jsonb,
      'quote-alpha:sensitive-token:1'
    );
    raise exception 'Expected sensitive input token to fail';
  exception when invalid_parameter_value then null;
  end;

  select * into evidence_result
  from public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551',
    'accessory.tint',
    '{"evidence_refs":["96666666-6666-4666-8666-666666666661"]}'::jsonb,
    'quote-alpha:evidence:1'
  );

  begin
    perform public.classify_quote_intelligence(
      '95555555-5555-4555-8555-555555555551',
      'accessory.tint',
      '{"evidence_refs":["96666666-6666-4666-8666-666666666662"]}'::jsonb,
      'quote-alpha:evidence:1'
    );
    raise exception 'Expected changed evidence under the same key to fail';
  exception when unique_violation then null;
  end;

  begin
    perform public.classify_quote_intelligence(
      '95555555-5555-4555-8555-555555555552',
      'suspension.noise',
      '{}'::jsonb,
      'quote-alpha:tint:1'
    );
    raise exception 'Expected conflicting idempotency key to fail';
  exception when unique_violation then null;
  end;

  begin
    update public.quote_intelligence_assessments
    set reason = 'Mutation must fail'
    where id = first_result.assessment_id;
    raise exception 'Expected immutable assessment update to fail';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.quote_intelligence_assessments
    where id = first_result.assessment_id;
    raise exception 'Expected immutable assessment delete to fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select pg_catalog.set_config('request.jwt.claim.sub', '94444444-4444-4444-8444-444444444444', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"94444444-4444-4444-8444-444444444444"}', true);

do $$
begin
  if (select count(*) from public.quote_intelligence_assessments) <> 6 then
    raise exception 'Admin cannot read all Quote Intelligence assessments';
  end if;
end;
$$;

reset role;

set local role anon;
select quote_intelligence_test.expect_denied('select * from public.quote_rule_sets');
select quote_intelligence_test.expect_denied(
  $$select public.classify_quote_intelligence(
    '95555555-5555-4555-8555-555555555551'::uuid,
    'accessory.tint',
    '{}'::jsonb,
    'anon-denied'
  )$$
);
reset role;

rollback;
