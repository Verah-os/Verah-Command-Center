\set ON_ERROR_STOP on
begin;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e3333333-3333-4333-8333-333333333333"}', true);
select public.invite_service_provider(
  'e6666666-6666-4666-8666-666666666661', 'e8888888-8888-4888-8888-888888888881',
  'e5555555-5555-4555-8555-555555555552', '{"summary":"Concurrent synthetic invitation"}',
  pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '7 days',
  'provider-invitation-concurrency'
);
commit;
