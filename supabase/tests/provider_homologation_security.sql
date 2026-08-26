\set ON_ERROR_STOP on

begin;

create schema provider_homologation_test;
create function provider_homologation_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema provider_homologation_test to authenticated, service_role;
grant execute on function provider_homologation_test.expect_error(text) to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'provider_homologation_profiles', 'provider_homologation_checklist_items',
    'provider_category_authorizations', 'provider_homologation_events',
    'provider_performance_events', 'service_completion_records'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then raise exception 'RLS is disabled for public.%', table_name; end if;
    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe grants on public.%', table_name;
    end if;
  end loop;
  if pg_catalog.has_column_privilege('authenticated', 'public.service_providers', 'document', 'select')
    or pg_catalog.has_column_privilege('authenticated', 'public.service_providers', 'phone', 'select')
    or pg_catalog.has_column_privilege('authenticated', 'public.service_providers', 'email', 'select') then
    raise exception 'Sensitive provider columns are exposed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'service_requests_real_provider_eligibility' and not tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'provider_invitations_real_eligibility' and not tgisinternal
  ) then raise exception 'Pilot Alpha eligibility gates are missing'; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'homologation.provider1@example.invalid', '{}', '{}', now(), now()),
  ('e1111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'homologation.provider2@example.invalid', '{}', '{}', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'homologation.admin@example.invalid', '{}', '{}', now(), now()),
  ('e3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'homologation.concierge@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, document, city, specialties, status)
values
  ('e4444444-4444-4444-8444-444444444441', 'Alpha Provider A', 'Alpha A', 'SYNTHETIC-REG-A', 'Test City', '["freios"]', 'active'),
  ('e4444444-4444-4444-8444-444444444442', 'Alpha Provider B', 'Alpha B', 'SYNTHETIC-REG-B', 'Test City', '["eletrica"]', 'active')
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('e1111111-1111-4111-8111-111111111111', 'provider', 'Alpha Provider A', 'e4444444-4444-4444-8444-444444444441'),
  ('e1111111-1111-4111-8111-111111111112', 'provider', 'Alpha Provider B', 'e4444444-4444-4444-8444-444444444442'),
  ('e2222222-2222-4222-8222-222222222222', 'admin', 'Human Homologator', null),
  ('e3333333-3333-4333-8333-333333333333', 'concierge', 'Alpha Concierge', null)
on conflict (user_id) do nothing;

-- Operationally active is not enough for a real Pilot Alpha assignment.
do $$ begin
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Active provider without homologation became eligible'; end if;
end $$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'e1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e1111111-1111-4111-8111-111111111111"}', true);

select provider_homologation_test.expect_error(
  $$select public.set_provider_homologation_status('e4444444-4444-4444-8444-444444444441','pilot_approved','self approval')$$
);
select provider_homologation_test.expect_error(
  $$select public.review_provider_checklist_item('e4444444-4444-4444-8444-444444444442','company_registration','verified',null,null,'cross-provider review')$$
);
do $$ begin
  if exists (select 1 from public.provider_homologation_profiles)
    or exists (select 1 from public.provider_homologation_checklist_items)
    or exists (select 1 from public.provider_homologation_events) then
    raise exception 'Provider accessed internal homologation data';
  end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e2222222-2222-4222-8222-222222222222"}', true);

select public.upsert_provider_homologation_profile(
  'e4444444-4444-4444-8444-444444444441', 'Alpha Provider A Ltda', 'Alpha A',
  'SYNTHETIC-REG-A', '{"city":"Test City"}', '{"name":"Responsible A"}',
  '{"channel":"internal-test"}', array['freios'], array['Test City'],
  '{"weekdays":"08:00-18:00"}', 3, '90 dias', 90, true, 'Synthetic test profile'
);
do $$ begin
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Candidate provider became eligible'; end if;
end $$;

do $$
declare item record;
begin
  for item in
    select item_code from public.provider_homologation_checklist_items
    where provider_id = 'e4444444-4444-4444-8444-444444444441' and is_required_for_pilot
  loop
    perform public.review_provider_checklist_item(
      'e4444444-4444-4444-8444-444444444441', item.item_code, 'verified',
      gen_random_uuid(), pg_catalog.now() + interval '1 year', 'Human verification'
    );
  end loop;
end;
$$;

select provider_homologation_test.expect_error(
  $$select public.review_provider_checklist_item(
    'e4444444-4444-4444-8444-444444444441','company_registration','verified',
    'https://public.example/document',null,'public evidence')$$
);

select public.set_provider_category_authorization(
  'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_approved',
  pg_catalog.now() + interval '1 year', 'Human category approval'
);
select public.set_provider_homologation_status(
  'e4444444-4444-4444-8444-444444444441', 'pilot_approved',
  'Human Pilot Alpha approval', pg_catalog.now() + interval '6 months'
);

do $$ begin
  if not public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Pilot-approved provider with correct category is ineligible'; end if;
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'eletrica', 'pilot_alpha'
  ) then raise exception 'Provider became eligible for an unauthorized category'; end if;
  if (select count(*) from public.provider_homologation_events
      where provider_id = 'e4444444-4444-4444-8444-444444444441') < 13 then
    raise exception 'Homologation audit history was not preserved';
  end if;
end $$;

select public.review_provider_checklist_item(
  'e4444444-4444-4444-8444-444444444441', 'company_registration', 'verified',
  gen_random_uuid(), pg_catalog.now() - interval '1 minute', 'Expired mandatory document'
);
do $$ begin
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Expired mandatory document did not block eligibility'; end if;
end $$;
select public.review_provider_checklist_item(
  'e4444444-4444-4444-8444-444444444441', 'company_registration', 'verified',
  gen_random_uuid(), pg_catalog.now() + interval '1 year', 'Renewed mandatory document'
);
select public.set_provider_operational_block(
  'e4444444-4444-4444-8444-444444444441', true, 'Human safety hold'
);
do $$ begin
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Critical operational block did not block eligibility'; end if;
end $$;
select public.set_provider_operational_block(
  'e4444444-4444-4444-8444-444444444441', false, 'Human review cleared the hold'
);

reset role;
insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year,
  city, customer_report, perceived_urgency, service_stage, origin, created_by,
  operation_context, service_category_code, provider_id
) values (
  'e5555555-5555-4555-8555-555555555555', 'VERAH-HOMOLOGATION-001', 'Synthetic Customer',
  'Volkswagen', 'Polo', 2022, 'Test City', 'Synthetic brake request.', 'media',
  'prestador_indicado', 'concierge', 'e3333333-3333-4333-8333-333333333333',
  'pilot_alpha', 'freios', 'e4444444-4444-4444-8444-444444444441'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e2222222-2222-4222-8222-222222222222"}', true);
select public.set_provider_homologation_status(
  'e4444444-4444-4444-8444-444444444441', 'suspended', 'Human safety suspension', null
);
do $$ begin
  if public.provider_is_eligible_for_service(
    'e4444444-4444-4444-8444-444444444441', 'freios', 'pilot_alpha'
  ) then raise exception 'Suspended provider remained eligible'; end if;
  if not exists (
    select 1 from public.service_requests
    where id = 'e5555555-5555-4555-8555-555555555555'
      and provider_id = 'e4444444-4444-4444-8444-444444444441'
  ) then raise exception 'Suspension removed historical service assignment'; end if;
end $$;

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select provider_homologation_test.expect_error(
  $$select public.set_provider_homologation_status('e4444444-4444-4444-8444-444444444442','approved','agent approval')$$
);

reset role;
do $$ begin
  if not exists (
    select 1 from public.service_providers where is_synthetic
  ) then raise exception 'Demo fixtures lost their explicit synthetic marker'; end if;
  if not exists (
    select 1 from public.service_providers provider
    where provider.is_synthetic
      and public.provider_is_eligible_for_service(provider.id, 'demo-only', 'demo')
  ) then raise exception 'Existing synthetic demo providers stopped working'; end if;
end $$;

rollback;
