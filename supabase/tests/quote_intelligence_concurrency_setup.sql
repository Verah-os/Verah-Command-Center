\set ON_ERROR_STOP on

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
  origin
)
values (
  '96666666-6666-4666-8666-666666666666',
  'VERAH-QI-CONCURRENCY',
  'Synthetic Concurrent Customer',
  'Honda',
  'Fit',
  2018,
  'Test City',
  'Concurrent synthetic quoteability assessment.',
  'baixa',
  'concierge_aceitou',
  'concierge'
)
on conflict (id) do nothing;

