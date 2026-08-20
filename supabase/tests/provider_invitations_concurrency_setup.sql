\set ON_ERROR_STOP on

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'invite.concurrent.source@example.invalid', '{}', '{}', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'invite.concurrent.response@example.invalid', '{}', '{}', now(), now()),
  ('e2222222-2222-4222-8222-222222222223', 'authenticated', 'authenticated', 'invite.concurrent.selection@example.invalid', '{}', '{}', now(), now()),
  ('e3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'invite.concurrent.concierge@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values
  ('e5555555-5555-4555-8555-555555555551', 'Invite Concurrent Source', 'Invite Concurrent Source', 'Test City', '["maintenance"]', 'active', 5),
  ('e5555555-5555-4555-8555-555555555552', 'Invite Concurrent Target', 'Invite Concurrent Target', 'Test City', '["maintenance"]', 'active', 5),
  ('e5555555-5555-4555-8555-555555555553', 'Response Concurrent Target', 'Response Concurrent Target', 'Test City', '["maintenance"]', 'active', 5),
  ('e5555555-5555-4555-8555-555555555554', 'Revocation Concurrent Target', 'Revocation Concurrent Target', 'Test City', '["maintenance"]', 'active', 5),
  ('e5555555-5555-4555-8555-555555555555', 'Selection Concurrent Target', 'Selection Concurrent Target', 'Test City', '["maintenance"]', 'active', 5)
on conflict (id) do nothing;
insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('e2222222-2222-4222-8222-222222222221', 'provider', 'Invite Concurrent Source', 'e5555555-5555-4555-8555-555555555551'),
  ('e2222222-2222-4222-8222-222222222222', 'provider', 'Response Concurrent Target', 'e5555555-5555-4555-8555-555555555553'),
  ('e2222222-2222-4222-8222-222222222223', 'provider', 'Selection Concurrent Target', 'e5555555-5555-4555-8555-555555555555'),
  ('e3333333-3333-4333-8333-333333333333', 'concierge', 'Invite Concurrent Concierge', null)
on conflict (user_id) do nothing;
insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, city,
  customer_report, perceived_urgency, service_stage, origin, created_by
) values (
  'e6666666-6666-4666-8666-666666666661', 'VERAH-INVITE-CONCURRENT', 'Synthetic Customer',
  'Honda', 'Fit', 'Test City', 'Synthetic concurrent invitation.', 'media',
  'aguardando_aprovacao', 'concierge', 'e3333333-3333-4333-8333-333333333333'
) on conflict (id) do nothing;

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total, additional_total,
  total_amount, estimated_duration, customer_summary, warranty_text, valid_until, submitted_at, created_by
) values (
  'e7777777-7777-4777-8777-777777777771', 'e6666666-6666-4666-8666-666666666661',
  'e5555555-5555-4555-8555-555555555551', 'submitted', 100, 0, 0, 100,
  '1 hora', 'Escopo sintético', '30 dias', current_date + 7, now(),
  'e2222222-2222-4222-8222-222222222221'
) on conflict (id) do nothing;

insert into public.service_quote_revisions (
  id, quote_id, service_request_id, provider_id, revision_number, commercial_scope,
  snapshot, content_hash, idempotency_key, author_user_id, submitted_at
) values (
  'e8888888-8888-4888-8888-888888888881', 'e7777777-7777-4777-8777-777777777771',
  'e6666666-6666-4666-8666-666666666661', 'e5555555-5555-4555-8555-555555555551',
  1, 'service_only', '{"items":[],"totals":{"total":100}}', repeat('c', 64),
  'provider-invitation-concurrency-revision', 'e2222222-2222-4222-8222-222222222221', now()
) on conflict (id) do nothing;

set role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', false);
select pg_catalog.set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', false);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e3333333-3333-4333-8333-333333333333"}', false);
select public.invite_service_provider(
  'e6666666-6666-4666-8666-666666666661', 'e8888888-8888-4888-8888-888888888881',
  'e5555555-5555-4555-8555-555555555553', '{"summary":"Concurrent response"}',
  pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '7 days',
  'provider-response-concurrency-setup'
);
select public.invite_service_provider(
  'e6666666-6666-4666-8666-666666666661', 'e8888888-8888-4888-8888-888888888881',
  'e5555555-5555-4555-8555-555555555554', '{"summary":"Concurrent revocation"}',
  pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '7 days',
  'provider-revocation-concurrency-setup'
);
select public.invite_service_provider(
  'e6666666-6666-4666-8666-666666666661', 'e8888888-8888-4888-8888-888888888881',
  'e5555555-5555-4555-8555-555555555555', '{"summary":"Concurrent selection"}',
  pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()) + interval '7 days',
  'provider-selection-concurrency-setup'
);
select pg_catalog.set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222223', false);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"e2222222-2222-4222-8222-222222222223"}', false);
select public.respond_to_provider_invitation(
  (select id from public.provider_invitations where idempotency_key = 'provider-selection-concurrency-setup'),
  'accepted', null, 'provider-selection-concurrency-accept-setup'
);
reset role;
