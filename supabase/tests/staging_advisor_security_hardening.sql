\set ON_ERROR_STOP on

begin;

-- The trigger-only binder must not be directly executable by browser roles,
-- including privileges inherited through PUBLIC or role membership.
do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.bind_service_request_customer_identity()',
    'execute'
  ) then
    raise exception 'anon can execute bind_service_request_customer_identity()';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.bind_service_request_customer_identity()',
    'execute'
  ) then
    raise exception 'authenticated can execute bind_service_request_customer_identity()';
  end if;
end;
$$;

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
values (
  '25900000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'customer.issue259@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

insert into public.user_profiles (user_id, role, display_name, provider_id)
values (
  '25900000-0000-4000-8000-000000000001',
  'customer',
  'Issue 259 Customer',
  null
);

insert into public.customers (auth_user_id, display_name)
values (
  '25900000-0000-4000-8000-000000000001',
  'Issue 259 Customer'
);

-- This insert fires the canonical trigger with customer_id omitted. The
-- hardening REVOKE must not interfere with trigger execution, and the trigger
-- must still derive the canonical customer identity from created_by.
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
  operation_context,
  created_by
)
values (
  '25900000-0000-4000-8000-000000000101',
  'ISSUE259-TRIGGER-BINDING',
  'Issue 259 Customer',
  'Test Brand',
  'Test Model',
  'Test City',
  'Repository-only trigger hardening verification',
  'media',
  'solicitado',
  'demo',
  '25900000-0000-4000-8000-000000000001'
);

do $$
declare
  expected_customer_id uuid;
  bound_customer_id uuid;
begin
  select customer.id
  into expected_customer_id
  from public.customers as customer
  where customer.auth_user_id = '25900000-0000-4000-8000-000000000001';

  select request.customer_id
  into bound_customer_id
  from public.service_requests as request
  where request.id = '25900000-0000-4000-8000-000000000101';

  if expected_customer_id is null then
    raise exception 'Issue 259 fixture customer was not created';
  end if;

  if bound_customer_id is distinct from expected_customer_id then
    raise exception
      'service_request customer_id binding regressed: expected %, found %',
      expected_customer_id,
      bound_customer_id;
  end if;
end;
$$;

rollback;
