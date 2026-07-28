\set ON_ERROR_STOP on

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
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'customer.issue43@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'concierge.issue43@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'provider.issue43@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'admin.issue43@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'missing-profile.issue43@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

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
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Synthetic Provider Issue 43',
  'Synthetic Provider Issue 43',
  'Test City',
  '["maintenance"]'::jsonb,
  'active',
  5
);

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'customer',
    'Synthetic Customer',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'concierge',
    'Synthetic Concierge',
    null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'provider',
    'Synthetic Provider',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'admin',
    'Synthetic Admin',
    null
  );

insert into public.customer_vehicles (
  id,
  owner_id,
  nickname,
  brand,
  model,
  year,
  state,
  city
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'Synthetic Vehicle',
  'Test Brand',
  'Test Model',
  2020,
  'TS',
  'Test City'
);

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
  created_by,
  provider_id,
  provider_assigned_at,
  provider_assigned_by,
  vehicle_id
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'ISSUE43-SYNTHETIC',
  'Synthetic Customer',
  'Test Brand',
  'Test Model',
  'Test City',
  'Synthetic report without personal data',
  'media',
  'prestador_indicado',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  now(),
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

insert into public.work_orders (
  id,
  title,
  description,
  status,
  priority,
  owner,
  origin,
  category
)
values (
  'ISSUE43-SYNTHETIC-WO',
  'Synthetic authorization verification',
  'Synthetic record created before the hardening migration',
  'Backlog',
  'High',
  'Issue 43 test',
  'Manual',
  'engineering'
);

create schema if not exists issue43_test;

create table issue43_test.baseline_counts (
  resource text primary key,
  row_count bigint not null
);

insert into issue43_test.baseline_counts (resource, row_count)
values
  ('work_orders', (select count(*) from public.work_orders)),
  ('dispatcher_jobs', (select count(*) from public.dispatcher_jobs)),
  ('ai_agents', (select count(*) from public.ai_agents)),
  ('system_settings', (select count(*) from public.system_settings)),
  ('service_requests', (select count(*) from public.service_requests)),
  ('service_providers', (select count(*) from public.service_providers)),
  ('user_profiles', (select count(*) from public.user_profiles)),
  ('customer_vehicles', (select count(*) from public.customer_vehicles));
