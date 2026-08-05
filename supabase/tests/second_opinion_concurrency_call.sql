\set ON_ERROR_STOP on

begin;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333"}', true);

select public.request_second_opinion(
  'c8888888-8888-4888-8888-888888888881',
  'c5555555-5555-4555-8555-555555555552',
  'c9999999-9999-4999-8999-999999999991',
  'Revisão elegível para validação concorrente.',
  'Validar escopo técnico de forma idempotente.',
  'second-opinion-concurrency-request'
);
commit;
