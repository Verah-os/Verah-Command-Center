\set ON_ERROR_STOP on

begin;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.create_service_quote_revision(
  'b4444444-4444-4444-8444-444444444444',
  'quote-quality-concurrent-revision'
);
commit;
