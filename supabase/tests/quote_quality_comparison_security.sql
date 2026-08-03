\set ON_ERROR_STOP on

begin;

create schema quote_quality_test;

create function quote_quality_test.expect_error(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema quote_quality_test to anon, authenticated, service_role;
grant execute on function quote_quality_test.expect_error(text) to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_quote_revisions',
    'quote_quality_assessments',
    'quote_comparison_sets',
    'quote_comparison_members'
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

  if pg_catalog.has_function_privilege('anon', 'public.create_service_quote_revision(uuid,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.create_service_quote_revision(uuid,text)', 'execute')
    or not pg_catalog.has_function_privilege('service_role', 'public.create_service_quote_revision(uuid,text)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.get_published_quote_comparison(uuid)', 'execute') then
    raise exception 'Quote quality function grants are unsafe';
  end if;

  if pg_catalog.has_function_privilege('authenticated', 'private.capture_service_quote_revision(uuid,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'private.capture_service_quote_revision(uuid,text)', 'execute') then
    raise exception 'Private revision helper is executable outside its owner';
  end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'quality.customer@example.invalid', '{}', '{}', now(), now()),
  ('a1111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'quality.other@example.invalid', '{}', '{}', now(), now()),
  ('a2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'quality.provider1@example.invalid', '{}', '{}', now(), now()),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'quality.provider2@example.invalid', '{}', '{}', now(), now()),
  ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'quality.concierge@example.invalid', '{}', '{}', now(), now()),
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'quality.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values
  ('a5555555-5555-4555-8555-555555555551', 'Synthetic Provider One', 'Synthetic Provider One', 'Test City', '["maintenance"]', 'active', 5),
  ('a5555555-5555-4555-8555-555555555552', 'Synthetic Provider Two', 'Synthetic Provider Two', 'Test City', '["maintenance"]', 'active', 4.5)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('a1111111-1111-4111-8111-111111111111', 'customer', 'Synthetic Customer', null),
  ('a1111111-1111-4111-8111-111111111112', 'customer', 'Other Customer', null),
  ('a2222222-2222-4222-8222-222222222221', 'provider', 'Synthetic Provider One', 'a5555555-5555-4555-8555-555555555551'),
  ('a2222222-2222-4222-8222-222222222222', 'provider', 'Synthetic Provider Two', 'a5555555-5555-4555-8555-555555555552'),
  ('a3333333-3333-4333-8333-333333333333', 'concierge', 'Synthetic Concierge', null),
  ('a4444444-4444-4444-8444-444444444444', 'admin', 'Synthetic Admin', null)
on conflict (user_id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year,
  city, customer_report, perceived_urgency, service_stage, origin, created_by
)
values
  ('a6666666-6666-4666-8666-666666666661', 'VERAH-QQ-001', 'Synthetic Customer', 'Honda', 'Fit', 2018, 'Test City', 'Synthetic request one.', 'media', 'aguardando_aprovacao', 'concierge', 'a1111111-1111-4111-8111-111111111111'),
  ('a6666666-6666-4666-8666-666666666662', 'VERAH-QQ-002', 'Synthetic Customer', 'Honda', 'Fit', 2018, 'Test City', 'Synthetic approval request.', 'media', 'aguardando_aprovacao', 'concierge', 'a1111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
)
values (
  'a7777777-7777-4777-8777-777777777771',
  'a6666666-6666-4666-8666-666666666661',
  'a5555555-5555-4555-8555-555555555551',
  'submitted', 100, 200, 0, 300, '2 horas', 'Escopo sintético A',
  '90 dias', current_date + 7, now(), 'a2222222-2222-4222-8222-222222222221'
);

insert into public.service_quote_items (
  id, quote_id, item_type, description, quantity, unit_price, total_price, is_optional
)
values
  ('a8888888-8888-4888-8888-888888888881', 'a7777777-7777-4777-8777-777777777771', 'labor', 'Instalação sintética', 1, 100, 100, false),
  ('a8888888-8888-4888-8888-888888888882', 'a7777777-7777-4777-8777-777777777771', 'part', 'Peça sintética A', 1, 200, 200, false);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222221', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222221"}', true);

select public.create_service_quote_revision(
  'a7777777-7777-4777-8777-777777777771',
  'quality-revision-provider-one'
) as provider_one_revision \gset

select public.create_service_quote_revision(
  'a7777777-7777-4777-8777-777777777771',
  'quality-revision-provider-one'
) as provider_one_revision_replayed \gset

do $$
declare
  first_revision uuid;
  replayed_revision uuid;
begin
  select id into first_revision
  from public.service_quote_revisions
  where idempotency_key = 'quality-revision-provider-one';
  replayed_revision := first_revision;

  if first_revision is distinct from replayed_revision
    or (select count(*) from public.service_quote_revisions where quote_id = 'a7777777-7777-4777-8777-777777777771') <> 1 then
    raise exception 'Revision resolution is not idempotent';
  end if;
end;
$$;

reset role;
update public.service_quotes
set status = 'cancelled'
where id = 'a7777777-7777-4777-8777-777777777771';

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
)
values (
  'a7777777-7777-4777-8777-777777777772',
  'a6666666-6666-4666-8666-666666666661',
  'a5555555-5555-4555-8555-555555555552',
  'submitted', 120, 230, 0, 350, '3 horas', 'Escopo sintético B',
  '180 dias', current_date + 10, now(), 'a2222222-2222-4222-8222-222222222222'
);

insert into public.service_quote_items (
  id, quote_id, item_type, description, quantity, unit_price, total_price, is_optional
)
values
  ('a8888888-8888-4888-8888-888888888883', 'a7777777-7777-4777-8777-777777777772', 'labor', 'Instalação sintética', 1, 120, 120, false),
  ('a8888888-8888-4888-8888-888888888884', 'a7777777-7777-4777-8777-777777777772', 'part', 'Peça sintética B', 1, 230, 230, false);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}', true);

select public.create_service_quote_revision(
  'a7777777-7777-4777-8777-777777777772',
  'quality-revision-provider-two'
) as provider_two_revision \gset

do $$
begin
  if exists (
    select 1 from public.service_quote_revisions
    where provider_id = 'a5555555-5555-4555-8555-555555555551'
  ) then
    raise exception 'Provider can read a competing revision';
  end if;
  if exists (select 1 from public.quote_quality_assessments)
    or exists (select 1 from public.quote_comparison_sets) then
    raise exception 'Provider can read internal quality or comparison data';
  end if;
end;
$$;

select quote_quality_test.expect_error(
  $$select public.create_service_quote_revision('a7777777-7777-4777-8777-777777777771', 'cross-provider')$$
);

select pg_catalog.set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a3333333-3333-4333-8333-333333333333"}', true);

select public.assess_quote_revision(
  :'provider_one_revision', 'maintenance.synthetic.v1',
  85::smallint, 80::smallint, 75::smallint, 80::smallint, 90::smallint,
  70::smallint, 95::smallint, false, 'comparison_ready',
  '[]', '[]', '["Prazo de peça sujeito a confirmação"]', 'assessment-provider-one'
) as provider_one_assessment \gset

select public.assess_quote_revision(
  :'provider_two_revision', 'maintenance.synthetic.v1',
  90::smallint, 85::smallint, 80::smallint, 90::smallint, 85::smallint,
  90::smallint, 95::smallint, false, 'comparison_ready',
  '[]', '[]', '[]', 'assessment-provider-two'
) as provider_two_assessment \gset

select public.assess_quote_revision(
  :'provider_two_revision', 'maintenance.synthetic.v1',
  90::smallint, 85::smallint, 80::smallint, 90::smallint, 85::smallint,
  90::smallint, 95::smallint, false, 'technically_confirmed',
  '[]', '[]', '[]', 'assessment-provider-two-human'
) as provider_two_human_assessment \gset

do $$
begin
  if not exists (
    select 1 from public.quote_quality_assessments
    where idempotency_key = 'assessment-provider-two-human'
      and human_confirmed_by = 'a3333333-3333-4333-8333-333333333333'
      and human_confirmed_at is not null
  ) then
    raise exception 'Human technical confirmation was not recorded';
  end if;
end;
$$;

select quote_quality_test.expect_error(
  pg_catalog.format(
    'select public.create_quote_comparison_set(%L, array[%L::uuid,%L::uuid], %L, %L)',
    'a6666666-6666-4666-8666-666666666661',
    :'provider_one_revision',
    :'provider_two_revision',
    'lowest_price',
    'comparison-price-only'
  )
);

select public.create_quote_comparison_set(
  'a6666666-6666-4666-8666-666666666661',
  array[:'provider_one_revision'::uuid, :'provider_two_revision'::uuid],
  'qualidade, garantia, escopo e preço',
  'comparison-valid'
) as comparison_id \gset

select public.create_quote_comparison_set(
  'a6666666-6666-4666-8666-666666666661',
  array[:'provider_one_revision'::uuid, :'provider_two_revision'::uuid],
  'qualidade, garantia, escopo e preço',
  'comparison-valid'
) as comparison_replayed \gset

do $$
declare
  resolved_comparison_id uuid;
begin
  select id into resolved_comparison_id
  from public.quote_comparison_sets
  where idempotency_key = 'comparison-valid';

  if resolved_comparison_id is null
    or (select count(*) from public.quote_comparison_members where comparison_set_id = resolved_comparison_id) <> 2 then
    raise exception 'Comparison creation is not idempotent';
  end if;
  if exists (
    select 1 from public.quote_comparison_members
    where comparison_set_id = resolved_comparison_id
      and not (
        differences ? 'parts'
        and differences ? 'warranty'
        and differences ? 'price_breakdown'
      )
  ) then
    raise exception 'Comparison differences are incomplete';
  end if;
end;
$$;

select public.publish_quote_comparison_set(:'comparison_id') as published_comparison \gset
select public.publish_quote_comparison_set(:'comparison_id');

select quote_quality_test.expect_error(
  pg_catalog.format('update public.service_quote_revisions set revision_number = 99 where id = %L', :'provider_one_revision')
);
select quote_quality_test.expect_error(
  pg_catalog.format('delete from public.quote_quality_assessments where id = %L', :'provider_one_assessment')
);

select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111"}', true);

do $$
declare
  customer_payload jsonb;
  resolved_comparison_id uuid;
begin
  if exists (select 1 from public.service_quote_revisions)
    or exists (select 1 from public.quote_quality_assessments)
    or exists (select 1 from public.quote_comparison_sets)
    or exists (select 1 from public.quote_comparison_members) then
    raise exception 'Customer can directly read internal comparison tables';
  end if;

  select id into resolved_comparison_id
  from public.quote_comparison_sets
  where idempotency_key = 'comparison-valid';
  customer_payload := public.get_published_quote_comparison(resolved_comparison_id);
  if pg_catalog.jsonb_array_length(customer_payload -> 'proposals') <> 2
    or customer_payload::text ~* '(provider_id|trade_name|technical_notes|created_by|human_confirmed_by|Synthetic Provider)' then
    raise exception 'Customer projection is incomplete or leaks internal/provider identity';
  end if;
end;
$$;

select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111112', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111112"}', true);
select quote_quality_test.expect_error(
  pg_catalog.format('select public.get_published_quote_comparison(%L)', :'comparison_id')
);

reset role;
set local role anon;
select quote_quality_test.expect_error(
  pg_catalog.format('select public.get_published_quote_comparison(%L)', :'comparison_id')
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
select quote_quality_test.expect_error(
  pg_catalog.format(
    'select public.assess_quote_revision(%L,%L,90::smallint,90::smallint,90::smallint,90::smallint,90::smallint,90::smallint,90::smallint,false,%L,%L::jsonb,%L::jsonb,%L::jsonb,%L)',
    :'provider_one_revision', 'maintenance.synthetic.v1', 'technically_confirmed', '[]', '[]', '[]', 'service-role-human-confirmation'
  )
);
reset role;

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
)
values (
  'a7777777-7777-4777-8777-777777777773',
  'a6666666-6666-4666-8666-666666666662',
  'a5555555-5555-4555-8555-555555555551',
  'submitted', 100, 200, 0, 300, '2 horas', 'Approval snapshot',
  '90 dias', current_date + 7, now(), 'a2222222-2222-4222-8222-222222222221'
);
insert into public.service_quote_items (
  id, quote_id, item_type, description, quantity, unit_price, total_price, is_optional
)
values
  ('a8888888-8888-4888-8888-888888888885', 'a7777777-7777-4777-8777-777777777773', 'labor', 'Instalação sintética', 1, 100, 100, false),
  ('a8888888-8888-4888-8888-888888888886', 'a7777777-7777-4777-8777-777777777773', 'part', 'Peça sintética', 1, 200, 200, false);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a3333333-3333-4333-8333-333333333333"}', true);
select public.create_service_quote_revision('a7777777-7777-4777-8777-777777777773', 'approval-revision-one') as approval_revision_one \gset
select public.create_service_quote_revision('a7777777-7777-4777-8777-777777777773', 'approval-revision-two') as approval_revision_two \gset

select pg_catalog.set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111"}', true);
select quote_quality_test.expect_error(
  pg_catalog.format(
    'select public.approve_service_quote_revision(%L,%L,%L)',
    'a7777777-7777-4777-8777-777777777773', :'approval_revision_one', 'stale'
  )
);
select public.approve_service_quote(
  'a7777777-7777-4777-8777-777777777773',
  'Approved current revision'
);

do $$
begin
  if not exists (
    select 1 from public.service_quotes
    where id = 'a7777777-7777-4777-8777-777777777773'
      and status = 'approved'
      and approved_revision_id = (
        select id from public.service_quote_revisions
        where idempotency_key = 'approval-revision-two'
      )
      and total_amount = 300
  ) then
    raise exception 'Approval did not reference the latest revision or changed totals';
  end if;
end;
$$;

rollback;
