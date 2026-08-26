\set ON_ERROR_STOP on

begin;

create schema pilot_alpha_test;

create function pilot_alpha_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', statement;
exception
  when others then
    if sqlerrm like 'Expected statement to fail:%' then raise; end if;
end;
$$;

grant usage on schema pilot_alpha_test to anon, authenticated, service_role;
grant execute on function pilot_alpha_test.expect_error(text) to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pilot_consent_receipts', 'vehicle_custody_events', 'service_incidents',
    'service_incident_events', 'pilot_concierge_time_entries'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then raise exception 'Expected RLS on public.%', table_name; end if;
    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe Pilot Alpha grants on public.%', table_name;
    end if;
  end loop;
  if pg_catalog.has_function_privilege('service_role', 'public.record_vehicle_custody_event(uuid,text,text,text,text,text,text,timestamptz,text,integer,text,text[],text,uuid[],boolean,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.record_service_incident_action(uuid,text,text,text,uuid[],boolean,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.record_vehicle_custody_event(uuid,text,text,text,text,text,text,timestamptz,text,integer,text,text[],text,uuid[],boolean,text)', 'execute') then
    raise exception 'Pilot Alpha function grants are unsafe';
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alpha.customer@example.invalid', '{}', '{}', now(), now()),
  ('f1111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'alpha.other@example.invalid', '{}', '{}', now(), now()),
  ('f2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'alpha.provider1@example.invalid', '{}', '{}', now(), now()),
  ('f2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'alpha.provider2@example.invalid', '{}', '{}', now(), now()),
  ('f3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'alpha.concierge@example.invalid', '{}', '{}', now(), now()),
  ('f4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'alpha.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.customers (id, auth_user_id, display_name)
values
  ('f0111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Alpha Customer'),
  ('f0111111-1111-4111-8111-111111111112', 'f1111111-1111-4111-8111-111111111112', 'Other Customer');

insert into public.customer_vehicles (id, customer_id, brand, model, year, plate, current_mileage)
values
  ('f0999999-9999-4999-8999-999999999991', 'f0111111-1111-4111-8111-111111111111', 'Volkswagen', 'Polo', 2022, 'TST1A31', 48320),
  ('f0999999-9999-4999-8999-999999999992', 'f0111111-1111-4111-8111-111111111112', 'Honda', 'Fit', 2018, 'TST2B32', 60000);

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating, is_synthetic)
values
  ('f0555555-5555-4555-8555-555555555551', 'Alpha Provider One', 'Alpha Provider One', 'Test City', '["maintenance"]', 'active', 5, true),
  ('f0555555-5555-4555-8555-555555555552', 'Alpha Provider Two', 'Alpha Provider Two', 'Test City', '["maintenance"]', 'active', 4.5, true)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('f1111111-1111-4111-8111-111111111111', 'customer', 'Alpha Customer', null),
  ('f1111111-1111-4111-8111-111111111112', 'customer', 'Other Customer', null),
  ('f2222222-2222-4222-8222-222222222221', 'provider', 'Alpha Provider One', 'f0555555-5555-4555-8555-555555555551'),
  ('f2222222-2222-4222-8222-222222222222', 'provider', 'Alpha Provider Two', 'f0555555-5555-4555-8555-555555555552'),
  ('f3333333-3333-4333-8333-333333333333', 'concierge', 'Alpha Concierge', null),
  ('f4444444-4444-4444-8444-444444444444', 'admin', 'Alpha Admin', null)
on conflict (user_id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, customer_id, vehicle_id, vehicle_brand,
  vehicle_model, vehicle_year, city, customer_report, perceived_urgency,
  service_stage, origin, created_by, provider_id, provider_completed_at,
  operation_context, service_category_code
)
values
  (
    'f0666666-6666-4666-8666-666666666661', 'VERAH-ALPHA-001', 'Alpha Customer',
    'f0111111-1111-4111-8111-111111111111', 'f0999999-9999-4999-8999-999999999991',
    'Volkswagen', 'Polo', 2022, 'Test City', 'Synthetic custody test.', 'media',
    'em_execucao', 'concierge', 'f1111111-1111-4111-8111-111111111111',
    'f0555555-5555-4555-8555-555555555551', now(), 'demo', 'maintenance'
  ),
  (
    'f0666666-6666-4666-8666-666666666662', 'VERAH-ALPHA-002', 'Other Customer',
    'f0111111-1111-4111-8111-111111111112', 'f0999999-9999-4999-8999-999999999992',
    'Honda', 'Fit', 2018, 'Test City', 'Other synthetic request.', 'baixa',
    'em_execucao', 'concierge', 'f1111111-1111-4111-8111-111111111112',
    'f0555555-5555-4555-8555-555555555552', now(), 'demo', 'maintenance'
  );

insert into public.service_attachments (
  id, service_request_id, storage_path, media_type, visibility, status, created_by
)
values
  (
    'f0888888-8888-4888-8888-888888888881', 'f0666666-6666-4666-8666-666666666661',
    'pilot-alpha/request-1/pickup.jpg', 'image', 'operations', 'available',
    'f3333333-3333-4333-8333-333333333333'
  ),
  (
    'f0888888-8888-4888-8888-888888888882', 'f0666666-6666-4666-8666-666666666661',
    'pilot-alpha/request-1/return.jpg', 'image', 'operations', 'available',
    'f3333333-3333-4333-8333-333333333333'
  ),
  (
    'f0888888-8888-4888-8888-888888888883', 'f0666666-6666-4666-8666-666666666661',
    'pilot-alpha/request-1/incident.jpg', 'image', 'operations', 'available',
    'f3333333-3333-4333-8333-333333333333'
  ),
  (
    'f0888888-8888-4888-8888-888888888884', 'f0666666-6666-4666-8666-666666666662',
    'pilot-alpha/request-2/other.jpg', 'image', 'operations', 'available',
    'f3333333-3333-4333-8333-333333333333'
  );

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'f3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f3333333-3333-4333-8333-333333333333"}', true);

select pilot_alpha_test.expect_error($sql$
  select public.record_vehicle_custody_event(
    'f0666666-6666-4666-8666-666666666661', 'pickup',
    'customer', 'customer:f0111111', 'verah_driver', 'driver:alpha-01', 'driver:alpha-01',
    '2026-08-26 10:00:00+00', 'Customer pickup zone', 48320, 'half', array['primary_key'],
    'Small existing mark on rear bumper.', array['f0888888-8888-4888-8888-888888888881']::uuid[],
    false, 'alpha-pickup-without-consent'
  )
$sql$);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f1111111-1111-4111-8111-111111111111"}', true);

select public.record_pilot_consent_receipt(
  'f0666666-6666-4666-8666-666666666661', 'pilot_alpha_participation', 'alpha.v1',
  repeat('a', 64), 'accepted', 'app', null, 'alpha-consent-participation'
);
select public.record_pilot_consent_receipt(
  'f0666666-6666-4666-8666-666666666661', 'vehicle_collection_return', 'transport.v1',
  repeat('b', 64), 'accepted', 'app', null, 'alpha-consent-transport'
) as transport_receipt_id \gset
select public.record_pilot_consent_receipt(
  'f0666666-6666-4666-8666-666666666661', 'custody_checkin_acknowledgement', 'checkin.v1',
  repeat('c', 64), 'accepted', 'app', null, 'alpha-consent-checkin'
);
select public.record_pilot_consent_receipt(
  'f0666666-6666-4666-8666-666666666661', 'route_destination_boundary', 'route.v1',
  repeat('d', 64), 'accepted', 'app', null, 'alpha-consent-route'
);
select public.record_pilot_consent_receipt(
  'f0666666-6666-4666-8666-666666666661', 'separate_service_price_approval', 'approval-boundary.v1',
  repeat('e', 64), 'accepted', 'app', null, 'alpha-consent-approval-boundary'
);

do $$
begin
  if (select count(*) from public.pilot_consent_receipts) <> 5
    or exists (select 1 from public.service_quotes) then
    raise exception 'Transport consent was inferred, overwritten or coupled to quote approval';
  end if;
end;
$$;

select pilot_alpha_test.expect_error(
  pg_catalog.format('update public.pilot_consent_receipts set consent_version = %L where id = %L', 'mutated', :'transport_receipt_id')
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'f3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f3333333-3333-4333-8333-333333333333"}', true);

select pilot_alpha_test.expect_error($sql$
  select public.record_vehicle_custody_event(
    'f0666666-6666-4666-8666-666666666661', 'pickup',
    'customer', 'customer:f0111111', 'verah_driver', 'driver:alpha-01', 'driver:alpha-01',
    '2026-08-26 10:00:00+00', 'Customer pickup zone', 48320, 'half', array['primary_key'],
    'Small existing mark on rear bumper.', array['f0888888-8888-4888-8888-888888888899']::uuid[],
    false, 'alpha-pickup-invented-evidence'
  )
$sql$);
select pilot_alpha_test.expect_error($sql$
  select public.record_vehicle_custody_event(
    'f0666666-6666-4666-8666-666666666661', 'pickup',
    'customer', 'customer:f0111111', 'verah_driver', 'driver:alpha-01', 'driver:alpha-01',
    '2026-08-26 10:00:00+00', 'Customer pickup zone', 48320, 'half', array['primary_key'],
    'Small existing mark on rear bumper.', array['f0888888-8888-4888-8888-888888888884']::uuid[],
    false, 'alpha-pickup-cross-request-evidence'
  )
$sql$);

select public.record_vehicle_custody_event(
  'f0666666-6666-4666-8666-666666666661', 'pickup',
  'customer', 'customer:f0111111', 'verah_driver', 'driver:alpha-01', 'driver:alpha-01',
  '2026-08-26 10:00:00+00', 'Customer pickup zone', 48320, 'half', array['primary_key'],
  'Small existing mark on rear bumper.', array['f0888888-8888-4888-8888-888888888881']::uuid[],
  false, 'alpha-pickup'
) as pickup_id \gset
select pilot_alpha_test.expect_error($sql$
  select public.record_vehicle_custody_event(
    'f0666666-6666-4666-8666-666666666661', 'provider_dropoff',
    'verah_driver', 'driver:unexplained', 'provider', 'provider:f0555555', 'driver:unexplained',
    '2026-08-26 10:30:00+00', 'Provider receiving zone', 48325, 'half', array['primary_key'],
    null, '{}'::uuid[], false, 'alpha-unexplained-party-switch'
  )
$sql$);
select public.record_vehicle_custody_event(
  'f0666666-6666-4666-8666-666666666661', 'provider_dropoff',
  'verah_driver', 'driver:alpha-01', 'provider', 'provider:f0555555', 'driver:alpha-01',
  '2026-08-26 10:30:00+00', 'Provider receiving zone', 48325, 'half', array['primary_key'],
  null, '{}'::uuid[], false, 'alpha-provider-dropoff'
);
select public.record_vehicle_custody_event(
  'f0666666-6666-4666-8666-666666666661', 'provider_pickup',
  'provider', 'provider:f0555555', 'verah_driver', 'driver:alpha-01', 'driver:alpha-01',
  '2026-08-26 14:00:00+00', 'Provider delivery zone', 48325, 'half', array['primary_key'],
  null, '{}'::uuid[], false, 'alpha-provider-pickup'
);
select public.record_vehicle_custody_event(
  'f0666666-6666-4666-8666-666666666661', 'return',
  'verah_driver', 'driver:alpha-01', 'customer', 'customer:f0111111', 'driver:alpha-01',
  '2026-08-26 14:30:00+00', 'Customer return zone', 48330, 'half', array['primary_key'],
  'No new visible damage.', array['f0888888-8888-4888-8888-888888888882']::uuid[],
  false, 'alpha-return'
);

do $$
begin
  if (select array_agg(event_type order by occurred_at) from public.vehicle_custody_events)
      <> array['pickup', 'provider_dropoff', 'provider_pickup', 'return']
    or exists (
      select 1 from public.vehicle_custody_events
      where recorded_by is null or authorized_driver_ref is null or odometer_km is null
        or array_to_string(evidence_attachment_ids, ',') ~* 'https?://'
    ) then raise exception 'Custody chain is not reconstructable, attributable or private'; end if;
end;
$$;

select pilot_alpha_test.expect_error($sql$
  select public.open_service_incident(
    'f0666666-6666-4666-8666-666666666661', null, 'S1', 'evidence_scope',
    'f3333333-3333-4333-8333-333333333333', 'not_required',
    'Cross-request evidence must be rejected.',
    array['f0888888-8888-4888-8888-888888888884']::uuid[], null, false,
    'alpha-incident-cross-request-evidence'
  )
$sql$);

select public.open_service_incident(
  'f0666666-6666-4666-8666-666666666661', :'pickup_id', 'S3', 'vehicle_damage',
  'f3333333-3333-4333-8333-333333333333', 'customer_notified',
  'Vehicle held and evidence preserved for human review.',
  array['f0888888-8888-4888-8888-888888888883']::uuid[], null, true, 'alpha-severe-incident'
) as incident_id \gset

do $$
declare
  original_id uuid;
  replay_id uuid;
begin
  select id into original_id
  from public.service_incidents
  where service_request_id = 'f0666666-6666-4666-8666-666666666661'
    and severity = 'S3'
    and category = 'vehicle_damage';
  replay_id := public.open_service_incident(
    'f0666666-6666-4666-8666-666666666661',
    (select id from public.vehicle_custody_events where idempotency_key = 'alpha-pickup'),
    'S3', 'vehicle_damage',
    'f3333333-3333-4333-8333-333333333333', 'customer_notified',
    'Vehicle held and evidence preserved for human review.',
    array['f0888888-8888-4888-8888-888888888883']::uuid[], null, true, 'alpha-severe-incident'
  );
  if replay_id <> original_id then
    raise exception 'Matching incident idempotency replay did not return the original incident';
  end if;
end;
$$;

select pilot_alpha_test.expect_error($sql$
  select public.open_service_incident(
    'f0666666-6666-4666-8666-666666666661',
    (select id from public.vehicle_custody_events where idempotency_key = 'alpha-pickup'),
    'S4', 'vehicle_damage',
    'f3333333-3333-4333-8333-333333333333', 'customer_notified',
    'Vehicle held and evidence preserved for human review.',
    array['f0888888-8888-4888-8888-888888888883']::uuid[], null, true, 'alpha-severe-incident'
  )
$sql$);

select pilot_alpha_test.expect_error(
  $$select public.concierge_confirm_service_completion('f0666666-6666-4666-8666-666666666661')$$
);
select pilot_alpha_test.expect_error(
  pg_catalog.format(
    'select public.record_service_incident_action(%L,%L,%L,%L,%L::uuid[],%L,%L)',
    :'incident_id', 'closed', 'all_notified', 'Attempted direct closure.', '{}', false, 'alpha-direct-close'
  )
);

select public.record_service_incident_action(
  :'incident_id', 'contained', 'all_notified', 'Vehicle secured and parties informed.', '{}'::uuid[], false,
  'alpha-incident-contained'
);
select public.record_service_incident_action(
  :'incident_id', 'resolved', 'all_notified', 'Human owner reviewed evidence and resolved response.', '{}'::uuid[], false,
  'alpha-incident-resolved'
);
select public.record_service_incident_action(
  :'incident_id', 'closed', 'all_notified', 'Human owner closed after resolution.', '{}'::uuid[], false,
  'alpha-incident-closed'
);

select pilot_alpha_test.expect_error(
  pg_catalog.format('delete from public.service_incident_events where incident_id = %L', :'incident_id')
);

select public.record_pilot_concierge_time(
  'f0666666-6666-4666-8666-666666666661', 'intake',
  '2026-08-26 09:00:00+00', '2026-08-26 09:20:00+00', false, 'alpha-time-intake'
);
select public.record_pilot_concierge_time(
  'f0666666-6666-4666-8666-666666666661', 'incident',
  '2026-08-26 14:30:00+00', '2026-08-26 15:10:00+00', true, 'alpha-time-incident'
);

do $$
declare metrics jsonb;
begin
  metrics := public.get_pilot_alpha_metrics('f0666666-6666-4666-8666-666666666661');
  if (metrics ->> 'concierge_minutes_total')::integer <> 60
    or (metrics -> 'concierge_minutes_by_phase' ->> 'intake')::integer <> 20
    or (metrics ->> 'pickup_return_duration_minutes')::integer <> 270
    or (metrics ->> 'km_during_custody')::integer <> 10
    or (metrics ->> 'incident_count')::integer <> 1
    or metrics ->> 'rework_occurred' <> 'true' then
    raise exception 'Pilot Alpha metrics are not derivable: %', metrics;
  end if;
end;
$$;

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pilot_alpha_test.expect_error(
  pg_catalog.format(
    'select public.record_service_incident_action(%L,%L,%L,%L,%L::uuid[],%L,%L)',
    :'incident_id', 'closed', 'all_notified', 'Agent attempted closure.', '{}', false, 'agent-close-attempt'
  )
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111112', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f1111111-1111-4111-8111-111111111112"}', true);
do $$
begin
  if exists (select 1 from public.pilot_consent_receipts)
    or exists (select 1 from public.vehicle_custody_events)
    or exists (select 1 from public.service_incidents)
    or exists (select 1 from public.service_incident_events) then
    raise exception 'Cross-customer Pilot Alpha data leaked';
  end if;
end;
$$;

select pg_catalog.set_config('request.jwt.claim.sub', 'f2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"f2222222-2222-4222-8222-222222222222"}', true);
do $$
begin
  if exists (select 1 from public.vehicle_custody_events)
    or exists (select 1 from public.service_incidents)
    or exists (select 1 from public.service_incident_events) then
    raise exception 'Cross-provider Pilot Alpha data leaked';
  end if;
end;
$$;

rollback;
