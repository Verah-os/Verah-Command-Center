\set ON_ERROR_STOP on

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'b1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
  'quality.concurrent@example.invalid', '{}', '{}', now(), now()
) on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values (
  'b2222222-2222-4222-8222-222222222222', 'Concurrent Provider',
  'Concurrent Provider', 'Test City', '["maintenance"]', 'active', 5
) on conflict (id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, city,
  customer_report, perceived_urgency, service_stage, origin, created_by
)
values (
  'b3333333-3333-4333-8333-333333333333', 'VERAH-QQ-CONCURRENT',
  'Concurrent Customer', 'Test', 'Car', 'Test City', 'Synthetic concurrent request.',
  'baixa', 'aguardando_aprovacao', 'concierge', 'b1111111-1111-4111-8111-111111111111'
) on conflict (id) do nothing;

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, submitted_at
)
values (
  'b4444444-4444-4444-8444-444444444444',
  'b3333333-3333-4333-8333-333333333333',
  'b2222222-2222-4222-8222-222222222222',
  'submitted', 100, 0, 0, 100, now()
) on conflict (id) do nothing;

insert into public.service_quote_items (
  id, quote_id, item_type, description, quantity, unit_price, total_price, is_optional
)
values (
  'b5555555-5555-4555-8555-555555555555',
  'b4444444-4444-4444-8444-444444444444',
  'labor', 'Concurrent labor', 1, 100, 100, false
) on conflict (id) do nothing;
