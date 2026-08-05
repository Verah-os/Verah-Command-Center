\set ON_ERROR_STOP on

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'concurrency.concierge@example.invalid', '{}', '{}', now(), now()),
  ('c2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'concurrency.provider1@example.invalid', '{}', '{}', now(), now()),
  ('c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'concurrency.provider2@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values
  ('c5555555-5555-4555-8555-555555555551', 'Concurrency Provider One', 'Concurrency Provider One', 'Test City', '["maintenance"]', 'active', 5),
  ('c5555555-5555-4555-8555-555555555552', 'Concurrency Provider Two', 'Concurrency Provider Two', 'Test City', '["maintenance"]', 'active', 5)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('c3333333-3333-4333-8333-333333333333', 'concierge', 'Concurrency Concierge', null),
  ('c2222222-2222-4222-8222-222222222221', 'provider', 'Concurrency Provider One', 'c5555555-5555-4555-8555-555555555551'),
  ('c2222222-2222-4222-8222-222222222222', 'provider', 'Concurrency Provider Two', 'c5555555-5555-4555-8555-555555555552')
on conflict (user_id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year,
  city, customer_report, perceived_urgency, service_stage, origin, created_by
)
values (
  'c6666666-6666-4666-8666-666666666661', 'VERAH-SO-CONCURRENCY', 'Synthetic Customer',
  'Honda', 'Fit', 2018, 'Test City', 'Synthetic concurrency request.', 'media',
  'aguardando_aprovacao', 'concierge', 'c3333333-3333-4333-8333-333333333333'
)
on conflict (id) do nothing;

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
)
values (
  'c7777777-7777-4777-8777-777777777771',
  'c6666666-6666-4666-8666-666666666661',
  'c5555555-5555-4555-8555-555555555551',
  'submitted', 100, 0, 0, 100, '1 hora', 'Escopo sintético concorrente',
  '30 dias', current_date + 7, now(), 'c2222222-2222-4222-8222-222222222221'
)
on conflict (id) do nothing;

insert into public.service_quote_revisions (
  id, quote_id, service_request_id, provider_id, revision_number,
  commercial_scope, snapshot, content_hash, idempotency_key,
  author_user_id, submitted_at
)
values (
  'c8888888-8888-4888-8888-888888888881',
  'c7777777-7777-4777-8777-777777777771',
  'c6666666-6666-4666-8666-666666666661',
  'c5555555-5555-4555-8555-555555555551',
  1, 'service_only', '{"items":[],"totals":{"total":100}}',
  repeat('a', 64), 'second-opinion-concurrency-revision',
  'c2222222-2222-4222-8222-222222222221', now()
)
on conflict (id) do nothing;

insert into public.quote_quality_assessments (
  id, revision_id, normalized_scope_key,
  scope_completeness, evidence_quality, diagnosis_quality,
  parts_detail_quality, labor_detail_quality, warranty_quality,
  price_breakdown_quality, second_opinion_eligibility, classification,
  missing_fields, exclusions, caveats, idempotency_key, created_by
)
values (
  'c9999999-9999-4999-8999-999999999991',
  'c8888888-8888-4888-8888-888888888881', 'maintenance.concurrent.v1',
  80, 80, 70, 80, 80, 80, 90, true, 'usable_with_caveats',
  '[]', '[]', '[]', 'second-opinion-concurrency-assessment',
  'c3333333-3333-4333-8333-333333333333'
)
on conflict (id) do nothing;
