\set ON_ERROR_STOP on

begin;

create schema alpha_test;

create function alpha_test.expect_denied(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise exception 'Expected authorization failure: %', statement;
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

create table alpha_test.inbound_results (
  attempt integer primary key,
  conversation_id uuid not null,
  message_id uuid not null,
  created boolean not null
);

create table alpha_test.outbound_results (
  attempt integer primary key,
  message_id uuid not null,
  outbox_id uuid not null,
  created boolean not null
);

grant usage on schema alpha_test to authenticated, service_role;
grant execute on function alpha_test.expect_denied(text) to authenticated;
grant insert, select on table alpha_test.inbound_results to service_role;
grant select on table alpha_test.inbound_results to authenticated;
grant insert, select on table alpha_test.outbound_results to authenticated;

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
    'customer.alpha@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'concierge.alpha@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'provider.alpha@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'admin.alpha@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'other-customer.alpha@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

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
  'Synthetic Alpha Provider',
  'Synthetic Alpha Provider',
  'Test City',
  '["maintenance"]'::jsonb,
  'active',
  5
)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'customer',
    'Synthetic Alpha Customer',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'concierge',
    'Synthetic Alpha Concierge',
    null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'provider',
    'Synthetic Alpha Provider',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'admin',
    'Synthetic Alpha Admin',
    null
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'customer',
    'Other Synthetic Alpha Customer',
    null
  )
on conflict (user_id) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_conversations',
    'service_messages',
    'service_request_events',
    'integration_outbox',
    'service_attachments'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is disabled for public.%', table_name;
    end if;

    if pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', table_name),
      'select'
    ) then
      raise exception 'anon can read public.%', table_name;
    end if;
  end loop;

  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.integration_outbox',
    'select'
  ) then
    raise exception 'authenticated can read the integration outbox';
  end if;

  foreach table_name in array array[
    'service_conversations',
    'service_messages',
    'service_request_events',
    'integration_outbox',
    'service_attachments'
  ]
  loop
    if pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', table_name),
      'insert'
    ) or pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', table_name),
      'update'
    ) or pg_catalog.has_table_privilege(
      'authenticated',
      pg_catalog.format('public.%I', table_name),
      'delete'
    ) then
      raise exception 'authenticated has direct write access to public.%', table_name;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.persist_whatsapp_inbound_message(text,text,text,text,timestamptz,jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.persist_whatsapp_inbound_message(text,text,text,text,timestamptz,jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.persist_whatsapp_inbound_message(text,text,text,text,timestamptz,jsonb)',
    'execute'
  ) then
    raise exception 'Inbound RPC grants are unsafe';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.queue_whatsapp_outbound_message(uuid,text,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.queue_whatsapp_outbound_message(uuid,text,text)',
    'execute'
  ) then
    raise exception 'Outbound RPC grants are unsafe';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'service-attachments'
      and public = false
      and file_size_limit = 26214400
  ) then
    raise exception 'Private service attachment bucket is not configured';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authorized users read service attachment objects'
  ) then
    raise exception 'Storage object read policy is missing';
  end if;
end;
$$;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

insert into alpha_test.inbound_results
select 1, result.conversation_id, result.message_id, result.created
from public.persist_whatsapp_inbound_message(
  '+55 (11) 99999-0001',
  'wamid.synthetic.alpha.1',
  'text',
  'Synthetic inbound message',
  '2026-07-30T12:00:00Z'::timestamptz,
  '{"source":"synthetic"}'::jsonb
) as result;

insert into alpha_test.inbound_results
select 2, result.conversation_id, result.message_id, result.created
from public.persist_whatsapp_inbound_message(
  '+5511999990001',
  'wamid.synthetic.alpha.1',
  'text',
  'Duplicate synthetic inbound message',
  '2026-07-30T12:00:00Z'::timestamptz,
  '{}'::jsonb
) as result;

select public.resolve_or_create_whatsapp_customer(
  '+5511999990002',
  'Other Synthetic Customer'
);

reset role;

do $$
declare
  first_customer_id uuid;
  second_customer_id uuid;
  first_conversation_id uuid;
begin
  if (
    select count(distinct message_id)
    from alpha_test.inbound_results
  ) <> 1 or (
    select count(*)
    from alpha_test.inbound_results
    where created
  ) <> 1 then
    raise exception 'Inbound message persistence is not idempotent';
  end if;

  select channel.customer_id
  into first_customer_id
  from public.customer_channels as channel
  where channel.channel_type = 'whatsapp'
    and channel.channel_address = '+5511999990001';

  select channel.customer_id
  into second_customer_id
  from public.customer_channels as channel
  where channel.channel_type = 'whatsapp'
    and channel.channel_address = '+5511999990002';

  update public.customers
  set auth_user_id = '11111111-1111-4111-8111-111111111111'
  where id = first_customer_id;

  update public.customers
  set auth_user_id = '66666666-6666-4666-8666-666666666666'
  where id = second_customer_id;

  select result.conversation_id
  into first_conversation_id
  from alpha_test.inbound_results as result
  where result.attempt = 1;

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
    provider_id
  )
  values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
    'ALPHA-SYNTHETIC-45',
    'Synthetic Alpha Customer',
    'Test Brand',
    'Test Model',
    'Test City',
    'Synthetic report',
    'media',
    'prestador_indicado',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  update public.service_conversations
  set service_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc45'
  where id = first_conversation_id;

  insert into public.service_request_events (
    service_request_id,
    event_type,
    actor_role,
    channel,
    audience,
    idempotency_key,
    payload
  )
  values
    (
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'message.received',
      'customer',
      'whatsapp',
      'customer',
      'alpha:event:customer',
      '{}'::jsonb
    ),
    (
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'provider.assigned',
      'concierge',
      'app',
      'provider',
      'alpha:event:provider',
      '{}'::jsonb
    ),
    (
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'request.updated',
      'system',
      'system',
      'all',
      'alpha:event:all',
      '{}'::jsonb
    ),
    (
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'internal.review',
      'concierge',
      'app',
      'operations',
      'alpha:event:operations',
      '{}'::jsonb
    );

  insert into public.service_attachments (
    conversation_id,
    service_request_id,
    storage_path,
    media_type,
    declared_mime_type,
    size_bytes,
    checksum_sha256,
    visibility,
    status
  )
  values
    (
      first_conversation_id,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'synthetic/customer.jpg',
      'image',
      'image/jpeg',
      1024,
      repeat('a', 64),
      'customer',
      'available'
    ),
    (
      first_conversation_id,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'synthetic/provider.pdf',
      'document',
      'application/pdf',
      2048,
      repeat('b', 64),
      'provider',
      'available'
    ),
    (
      first_conversation_id,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'synthetic/all.jpg',
      'image',
      'image/jpeg',
      512,
      repeat('c', 64),
      'all',
      'available'
    ),
    (
      first_conversation_id,
      'cccccccc-cccc-4ccc-8ccc-cccccccccc45',
      'synthetic/operations.pdf',
      'document',
      'application/pdf',
      256,
      repeat('d', 64),
      'operations',
      'available'
    );

  perform alpha_test.expect_denied(
    'update public.service_request_events set event_type = ''changed'' where idempotency_key = ''alpha:event:all'''
  );
end;
$$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}',
  true
);

do $$
begin
  if (select auth.uid()) is distinct from
      '22222222-2222-4222-8222-222222222222'::uuid
    or (select public.current_verah_role()) is distinct from 'concierge' then
    raise exception
      'Concierge JWT fixture did not resolve: uid=%, role=%',
      (select auth.uid()),
      (select public.current_verah_role());
  end if;
end;
$$;

insert into alpha_test.outbound_results
select 1, result.message_id, result.outbox_id, result.created
from public.queue_whatsapp_outbound_message(
  (select conversation_id from alpha_test.inbound_results where attempt = 1),
  'Synthetic outbound message',
  'alpha-outbound-1'
) as result;

insert into alpha_test.outbound_results
select 2, result.message_id, result.outbox_id, result.created
from public.queue_whatsapp_outbound_message(
  (select conversation_id from alpha_test.inbound_results where attempt = 1),
  'Duplicate synthetic outbound message',
  'alpha-outbound-1'
) as result;

do $$
begin
  if (select count(*) from public.service_conversations) <> 1
    or (select count(*) from public.service_messages) <> 2
    or (select count(*) from public.service_request_events) <> 5
    or (select count(*) from public.service_attachments) <> 4 then
    raise exception 'Concierge cannot read the complete operational fixture';
  end if;

  if (
    select count(distinct message_id)
    from alpha_test.outbound_results
  ) <> 1 or (
    select count(*)
    from alpha_test.outbound_results
    where created
  ) <> 1 then
    raise exception 'Outbound queue is not idempotent';
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

do $$
begin
  if (select count(*) from public.service_conversations) <> 1
    or (select count(*) from public.service_messages) <> 2
    or (select count(*) from public.service_request_events) <> 3
    or (select count(*) from public.service_attachments) <> 2 then
    raise exception 'Customer RLS does not expose exactly the customer audience';
  end if;

  perform alpha_test.expect_denied(
    'select public.queue_whatsapp_outbound_message(''00000000-0000-4000-8000-000000000045'', ''Denied'', ''denied'')'
  );
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"66666666-6666-4666-8666-666666666666"}',
  true
);

do $$
begin
  if (select count(*) from public.service_conversations) <> 0
    or (select count(*) from public.service_messages) <> 0
    or (select count(*) from public.service_request_events) <> 0
    or (select count(*) from public.service_attachments) <> 0 then
    raise exception 'Customer can read another customer communication data';
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"33333333-3333-4333-8333-333333333333"}',
  true
);

do $$
begin
  if (select count(*) from public.service_conversations) <> 0
    or (select count(*) from public.service_messages) <> 0
    or (select count(*) from public.service_request_events) <> 2
    or (select count(*) from public.service_attachments) <> 2 then
    raise exception 'Provider RLS exposes an incorrect communication surface';
  end if;

  perform alpha_test.expect_denied(
    'select public.queue_whatsapp_outbound_message(''00000000-0000-4000-8000-000000000045'', ''Denied'', ''denied'')'
  );
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"44444444-4444-4444-8444-444444444444"}',
  true
);

do $$
begin
  if (select count(*) from public.service_conversations) <> 1
    or (select count(*) from public.service_messages) <> 2
    or (select count(*) from public.service_request_events) <> 5
    or (select count(*) from public.service_attachments) <> 4 then
    raise exception 'Admin cannot read the complete operational fixture';
  end if;
end;
$$;

reset role;

rollback;
