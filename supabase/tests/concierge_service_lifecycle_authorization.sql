\set ON_ERROR_STOP on

begin;

create schema if not exists issue207_test;

create or replace function issue207_test.expect_denied(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise exception 'Expected authorization failure: %', statement;
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

grant usage on schema issue207_test to authenticated;
grant execute on function issue207_test.expect_denied(text) to authenticated;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('20700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'customer.issue207@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'concierge-a.issue207@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'concierge-b.issue207@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20700000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'provider.issue207@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20700000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin.issue207@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.service_providers (
  id,
  name,
  trade_name,
  city,
  specialties,
  status,
  rating
)
values (
  '20700000-0000-4000-8000-000000000010',
  'Synthetic Provider Issue 207',
  'Synthetic Provider Issue 207',
  'Test City',
  '["maintenance"]'::jsonb,
  'active',
  5
);

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('20700000-0000-4000-8000-000000000001', 'customer', 'Issue 207 Customer', null),
  ('20700000-0000-4000-8000-000000000002', 'concierge', 'Issue 207 Concierge A', null),
  ('20700000-0000-4000-8000-000000000003', 'concierge', 'Issue 207 Concierge B', null),
  ('20700000-0000-4000-8000-000000000004', 'provider', 'Issue 207 Provider', '20700000-0000-4000-8000-000000000010'),
  ('20700000-0000-4000-8000-000000000005', 'admin', 'Issue 207 Admin', null);

insert into public.service_requests (
  id,
  reference_code,
  customer_name,
  vehicle_brand,
  vehicle_model,
  city,
  customer_report,
  perceived_urgency,
  service_stage,
  created_by
)
values
  (
    '20700000-0000-4000-8000-000000000101',
    'ISSUE207-CONCIERGE',
    'Synthetic Customer',
    'Test Brand',
    'Test Model',
    'Test City',
    'Synthetic authorization request',
    'media',
    'solicitado',
    null
  ),
  (
    '20700000-0000-4000-8000-000000000102',
    'ISSUE207-ADMIN-ASSIGN',
    'Synthetic Customer',
    'Test Brand',
    'Test Model',
    'Test City',
    'Synthetic admin assignment request',
    'media',
    'concierge_aceitou',
    null
  ),
  (
    '20700000-0000-4000-8000-000000000103',
    'ISSUE207-ADMIN-COMPLETE',
    'Synthetic Customer',
    'Test Brand',
    'Test Model',
    'Test City',
    'Synthetic admin completion request',
    'media',
    'em_execucao',
    null
  );

update public.service_requests
set
  concierge_id = '20700000-0000-4000-8000-000000000002',
  concierge_accepted_at = now()
where id in (
  '20700000-0000-4000-8000-000000000102',
  '20700000-0000-4000-8000-000000000103'
);

update public.service_requests
set
  provider_id = '20700000-0000-4000-8000-000000000010',
  provider_assigned_at = now(),
  provider_assigned_by = '20700000-0000-4000-8000-000000000002',
  provider_completed_at = now()
where id = '20700000-0000-4000-8000-000000000103';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A customer cannot assume a request or move the Concierge lifecycle.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000001', true);
select issue207_test.expect_denied(
  $$select * from public.accept_service_request('20700000-0000-4000-8000-000000000101')$$
);
select issue207_test.expect_denied(
  $$select * from public.assign_provider_to_service_request('20700000-0000-4000-8000-000000000102', '20700000-0000-4000-8000-000000000010')$$
);
select issue207_test.expect_denied(
  $$select public.concierge_confirm_service_completion('20700000-0000-4000-8000-000000000103')$$
);

-- A provider cannot assume or assign a request and cannot perform the Concierge confirmation.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000004', true);
select issue207_test.expect_denied(
  $$select * from public.accept_service_request('20700000-0000-4000-8000-000000000101')$$
);
select issue207_test.expect_denied(
  $$select * from public.assign_provider_to_service_request('20700000-0000-4000-8000-000000000102', '20700000-0000-4000-8000-000000000010')$$
);
select issue207_test.expect_denied(
  $$select public.concierge_confirm_service_completion('20700000-0000-4000-8000-000000000103')$$
);

-- Concierge A can accept the request and becomes its canonical Concierge.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000002', true);
select *
from public.accept_service_request('20700000-0000-4000-8000-000000000101');

-- Another Concierge cannot mutate a request accepted by Concierge A.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000003', true);
select issue207_test.expect_denied(
  $$select * from public.assign_provider_to_service_request('20700000-0000-4000-8000-000000000101', '20700000-0000-4000-8000-000000000010')$$
);

-- The owning Concierge can assign the provider.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000002', true);
select *
from public.assign_provider_to_service_request(
  '20700000-0000-4000-8000-000000000101',
  '20700000-0000-4000-8000-000000000010'
);

reset role;
update public.service_requests
set
  service_stage = 'em_execucao',
  provider_completed_at = now()
where id = '20700000-0000-4000-8000-000000000101';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Another Concierge cannot confirm completion for Concierge A's request.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000003', true);
select issue207_test.expect_denied(
  $$select public.concierge_confirm_service_completion('20700000-0000-4000-8000-000000000101')$$
);

-- The owning Concierge can confirm completion.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000002', true);
select public.concierge_confirm_service_completion(
  '20700000-0000-4000-8000-000000000101'
);

-- Admin override remains explicit for assignment and completion.
select set_config('request.jwt.claim.sub', '20700000-0000-4000-8000-000000000005', true);
select *
from public.assign_provider_to_service_request(
  '20700000-0000-4000-8000-000000000102',
  '20700000-0000-4000-8000-000000000010'
);
select public.concierge_confirm_service_completion(
  '20700000-0000-4000-8000-000000000103'
);

reset role;

do $$
begin
  if not exists (
    select 1
    from public.service_requests
    where id = '20700000-0000-4000-8000-000000000101'
      and concierge_id = '20700000-0000-4000-8000-000000000002'
      and provider_id = '20700000-0000-4000-8000-000000000010'
      and service_stage = 'concluido'
      and concierge_confirmed_at is not null
      and completed_at is not null
  ) then
    raise exception 'Owning Concierge happy path did not complete correctly';
  end if;

  if not exists (
    select 1
    from public.service_requests
    where id = '20700000-0000-4000-8000-000000000102'
      and provider_id = '20700000-0000-4000-8000-000000000010'
      and provider_assigned_by = '20700000-0000-4000-8000-000000000005'
      and service_stage = 'prestador_indicado'
  ) then
    raise exception 'Admin provider-assignment override did not remain available';
  end if;

  if not exists (
    select 1
    from public.service_requests
    where id = '20700000-0000-4000-8000-000000000103'
      and service_stage = 'concluido'
      and concierge_confirmed_at is not null
      and completed_at is not null
  ) then
    raise exception 'Admin completion override did not remain available';
  end if;
end;
$$;

rollback;
