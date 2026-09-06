\set ON_ERROR_STOP on

begin;

create schema if not exists issue209_test;

create or replace function issue209_test.expect_denied(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise exception 'Expected Dispatcher authorization failure: %', statement;
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

grant usage on schema issue209_test to authenticated;
grant execute on function issue209_test.expect_denied(text) to authenticated;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('20900000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'customer.issue209@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20900000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'concierge.issue209@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20900000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'provider.issue209@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20900000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin.issue209@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.service_providers (
  id, name, trade_name, city, specialties, status, rating, is_synthetic
)
values (
  '20900000-0000-4000-8000-000000000010',
  'Synthetic Dispatcher Provider',
  'Synthetic Dispatcher Provider',
  'Test City',
  '["maintenance"]'::jsonb,
  'active',
  5,
  true
);

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('20900000-0000-4000-8000-000000000001', 'customer', 'Issue 209 Customer', null),
  ('20900000-0000-4000-8000-000000000002', 'concierge', 'Issue 209 Concierge', null),
  ('20900000-0000-4000-8000-000000000003', 'provider', 'Issue 209 Provider', '20900000-0000-4000-8000-000000000010'),
  ('20900000-0000-4000-8000-000000000004', 'admin', 'Issue 209 Admin', null);

do $$
declare
  function_signature text;
  function_name text;
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

    select p.proname, pg_get_functiondef(p.oid), p.proconfig
      into function_name, definition, config
    from pg_proc p
    where p.oid = function_oid;

    if has_function_privilege('anon', function_oid, 'execute') then
      raise exception 'anon can execute %', function_signature;
    end if;

    if not has_function_privilege('authenticated', function_oid, 'execute') then
      raise exception 'authenticated cannot reach guarded RPC %', function_signature;
    end if;

    if not has_function_privilege('service_role', function_oid, 'execute') then
      raise exception 'service_role cannot execute internal RPC %', function_signature;
    end if;

    if config is null or not ('search_path=""' = any(config)) then
      raise exception 'Unsafe search_path for %: %', function_signature, config;
    end if;

    if position('service_role' in definition) = 0
      or position('current_verah_role' in definition) = 0
      or position('admin' in definition) = 0 then
      raise exception 'Missing Admin/service_role guard in %', function_signature;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Customer, Concierge and Provider are all ordinary authenticated callers and must fail closed.
select set_config('request.jwt.claim.sub', '20900000-0000-4000-8000-000000000001', true);
select issue209_test.expect_denied('select public.dispatcher_engine_start_next_job()');
select issue209_test.expect_denied($$select public.dispatcher_engine_finish_job('20900000-0000-4000-8000-000000000101', 'synthetic', true)$$);
select issue209_test.expect_denied($$select public.dispatcher_engine_retry_failed_job('20900000-0000-4000-8000-000000000101')$$);
select issue209_test.expect_denied($$select public.dispatcher_engine_mark_job_completed('20900000-0000-4000-8000-000000000101')$$);
select issue209_test.expect_denied($$select public.dispatcher_engine_mark_job_failed('20900000-0000-4000-8000-000000000101')$$);
select issue209_test.expect_denied($$select public.dispatcher_complete_ai_runtime_job('20900000-0000-4000-8000-000000000101', 'synthetic', true, 1, null, null, null)$$);

select set_config('request.jwt.claim.sub', '20900000-0000-4000-8000-000000000002', true);
select issue209_test.expect_denied('select public.dispatcher_engine_start_next_job()');
select issue209_test.expect_denied($$select public.dispatcher_engine_mark_job_completed('20900000-0000-4000-8000-000000000101')$$);
select issue209_test.expect_denied($$select public.dispatcher_complete_ai_runtime_job('20900000-0000-4000-8000-000000000101', 'synthetic', true, 1, null, null, null)$$);

select set_config('request.jwt.claim.sub', '20900000-0000-4000-8000-000000000003', true);
select issue209_test.expect_denied('select public.dispatcher_engine_start_next_job()');
select issue209_test.expect_denied($$select public.dispatcher_engine_mark_job_failed('20900000-0000-4000-8000-000000000101')$$);
select issue209_test.expect_denied($$select public.dispatcher_complete_ai_runtime_job('20900000-0000-4000-8000-000000000101', 'synthetic', false, 1, null, 'TEST', 'synthetic')$$);

-- Admin can reach the guarded control plane. Nonexistent ids return no-op/not_found results.
select set_config('request.jwt.claim.sub', '20900000-0000-4000-8000-000000000004', true);
select public.dispatcher_engine_finish_job('20900000-0000-4000-8000-000000000101', 'synthetic', true);
select public.dispatcher_engine_retry_failed_job('20900000-0000-4000-8000-000000000101');
select public.dispatcher_engine_mark_job_completed('20900000-0000-4000-8000-000000000101');
select public.dispatcher_engine_mark_job_failed('20900000-0000-4000-8000-000000000101');
select public.dispatcher_complete_ai_runtime_job('20900000-0000-4000-8000-000000000101', 'synthetic', true, 1, null, null, null);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

-- Trusted internal runtime can reach the same state-machine entry points without an end-user identity.
select public.dispatcher_engine_finish_job('20900000-0000-4000-8000-000000000101', 'synthetic', true);
select public.dispatcher_engine_retry_failed_job('20900000-0000-4000-8000-000000000101');
select public.dispatcher_engine_mark_job_completed('20900000-0000-4000-8000-000000000101');
select public.dispatcher_engine_mark_job_failed('20900000-0000-4000-8000-000000000101');
select public.dispatcher_complete_ai_runtime_job('20900000-0000-4000-8000-000000000101', 'synthetic-service', true, 1, null, null, null);

reset role;
rollback;
