\set ON_ERROR_STOP on

begin;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

select *
from public.classify_quote_intelligence(
  '96666666-6666-4666-8666-666666666666',
  'preventive.oil_change',
  '{
    "available_data":[
      "vehicle_brand","vehicle_model","vehicle_year","service_scope",
      "current_mileage","oil_specification"
    ],
    "available_evidence":[],
    "available_measurements":[],
    "available_documents":[]
  }'::jsonb,
  'quote-alpha:concurrent:1'
);

commit;

