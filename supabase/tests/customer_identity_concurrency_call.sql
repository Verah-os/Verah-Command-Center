\set ON_ERROR_STOP on

begin;

set local role service_role;
select pg_catalog.set_config(
  'request.jwt.claim.role',
  'service_role',
  true
);

select public.resolve_or_create_whatsapp_customer(
  '+5516999990099',
  'Concurrent Synthetic Customer'
);

commit;
