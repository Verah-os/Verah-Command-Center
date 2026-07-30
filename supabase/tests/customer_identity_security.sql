\set ON_ERROR_STOP on

begin;

create schema issue52_test;

create function issue52_test.expect_denied(statement text)
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

create table issue52_test.results (
  key text primary key,
  value uuid not null
);

grant usage on schema issue52_test to authenticated;
grant execute on function issue52_test.expect_denied(text) to authenticated;
grant usage on schema issue52_test to service_role;
grant insert, select on table issue52_test.results to service_role;

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
    'customer.issue52@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'concierge.issue52@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'provider.issue52@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'admin.issue52@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'second-customer.issue52@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
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
  'Synthetic Provider Issue 52',
  'Synthetic Provider Issue 52',
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
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'customer',
    'Second Synthetic Customer',
    null
  )
on conflict (user_id) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers', 'customer_channels']
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
    ) or pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', table_name),
      'insert'
    ) or pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', table_name),
      'update'
    ) or pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', table_name),
      'delete'
    ) then
      raise exception 'anon retains table privileges on public.%', table_name;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege(
    'authenticated',
    'public.customers',
    'select'
  ) or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.customer_channels',
    'select'
  ) then
    raise exception 'authenticated is missing a required read grant';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.customers',
    'insert'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.customers',
    'update'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.customers',
    'delete'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.customer_channels',
    'insert'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.customer_channels',
    'update'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.customer_channels',
    'delete'
  ) then
    raise exception 'authenticated retains a direct write grant';
  end if;
end;
$$;

do $$
declare
  function_signature text;
  has_empty_search_path boolean;
  is_security_definer boolean;
begin
  foreach function_signature in array array[
    'private.current_customer_id()',
    'public.ensure_current_customer(text)',
    'public.resolve_or_create_whatsapp_customer(text,text)',
    'public.set_whatsapp_consent(uuid,text)'
  ]
  loop
    if pg_catalog.has_function_privilege(
      'anon',
      function_signature,
      'execute'
    ) then
      raise exception 'anon can execute %', function_signature;
    end if;

    select
      function_definition.prosecdef,
      function_definition.proconfig @> array['search_path=""']
    into is_security_definer, has_empty_search_path
    from pg_catalog.pg_proc as function_definition
    where function_definition.oid =
      function_signature::pg_catalog.regprocedure;

    if not is_security_definer or not has_empty_search_path then
      raise exception
        '% must be SECURITY DEFINER with an empty search_path',
        function_signature;
    end if;
  end loop;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'private.current_customer_id()',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.ensure_current_customer(text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.set_whatsapp_consent(uuid,text)',
    'execute'
  ) then
    raise exception 'authenticated is missing a required function grant';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.resolve_or_create_whatsapp_customer(text,text)',
    'execute'
  ) then
    raise exception 'authenticated can execute the server-side resolver';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.resolve_or_create_whatsapp_customer(text,text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.set_whatsapp_consent(uuid,text)',
    'execute'
  ) then
    raise exception 'service_role is missing a required function grant';
  end if;

  if pg_catalog.has_function_privilege(
    'service_role',
    'public.ensure_current_customer(text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'private.current_customer_id()',
    'execute'
  ) then
    raise exception 'service_role retains an unnecessary function grant';
  end if;
end;
$$;

do $$
declare
  policy_count integer;
begin
  select pg_catalog.count(*)
  into policy_count
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation
    on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in ('customers', 'customer_channels')
    and policy.polname in (
      'Customers read own identity',
      'Operations read customer identities',
      'Customers read own channels',
      'Operations read customer channels'
    );

  if policy_count <> 4 then
    raise exception
      'Expected 4 customer identity policies, found %',
      policy_count;
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

do $$
declare
  first_customer_id uuid;
  second_customer_id uuid;
begin
  first_customer_id := public.ensure_current_customer(
    'Synthetic Customer'
  );
  second_customer_id := public.ensure_current_customer(
    'A later display name must not duplicate the customer'
  );

  if first_customer_id is distinct from second_customer_id then
    raise exception 'ensure_current_customer is not idempotent';
  end if;

  if private.current_customer_id() is distinct from first_customer_id then
    raise exception 'current_customer_id did not resolve the current customer';
  end if;

  begin
    perform public.ensure_current_customer('   ');
    raise exception 'Blank display name was accepted';
  exception
    when invalid_parameter_value then
      null;
  end;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);

select public.ensure_current_customer('Second Synthetic Customer');

reset role;

do $$
declare
  first_customer_id uuid;
begin
  select customer.id
  into first_customer_id
  from public.customers as customer
  where customer.auth_user_id =
    '11111111-1111-4111-8111-111111111111';

  if (
    select pg_catalog.count(*)
    from public.customers as customer
    where customer.auth_user_id =
      '11111111-1111-4111-8111-111111111111'
  ) <> 1 then
    raise exception 'ensure_current_customer created a duplicate identity';
  end if;

  begin
    insert into public.customers (auth_user_id, display_name)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Duplicate auth identity'
    );
    raise exception 'Duplicate auth_user_id was accepted';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.customer_channels (
      customer_id,
      channel_type,
      channel_address,
      is_primary
    )
    values (
      first_customer_id,
      'whatsapp',
      '5516999990000',
      true
    );
    raise exception 'Invalid E.164 phone was accepted';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into public.customer_channels (
  customer_id,
  channel_type,
  channel_address,
  is_primary
)
select
  customer.id,
  'whatsapp',
  '+5516999990000',
  true
from public.customers as customer
where customer.auth_user_id =
  '11111111-1111-4111-8111-111111111111';

do $$
declare
  second_customer_id uuid;
begin
  select customer.id
  into second_customer_id
  from public.customers as customer
  where customer.auth_user_id =
    '66666666-6666-4666-8666-666666666666';

  begin
    insert into public.customer_channels (
      customer_id,
      channel_type,
      channel_address,
      is_primary
    )
    values (
      second_customer_id,
      'whatsapp',
      '+5516999990000',
      true
    );
    raise exception 'Duplicate normalized WhatsApp address was accepted';
  exception
    when unique_violation then
      null;
  end;

  insert into public.customer_channels (
    customer_id,
    channel_type,
    channel_address,
    is_primary
  )
  values (
    second_customer_id,
    'whatsapp',
    '+5516999990002',
    true
  );
end;
$$;

set local role service_role;
select pg_catalog.set_config(
  'request.jwt.claim.role',
  'service_role',
  true
);

do $$
declare
  formatted_result uuid;
  canonical_result uuid;
begin
  formatted_result := public.resolve_or_create_whatsapp_customer(
    '+55 (16) 99999-0001',
    'Synthetic WhatsApp Customer'
  );
  canonical_result := public.resolve_or_create_whatsapp_customer(
    '+5516999990001',
    'A repeated delivery must not create another customer'
  );

  if formatted_result is distinct from canonical_result then
    raise exception 'WhatsApp resolution is not idempotent';
  end if;

  begin
    perform public.resolve_or_create_whatsapp_customer(
      '5516999990001',
      'Invalid phone'
    );
    raise exception 'Resolver accepted a non-E.164 phone';
  exception
    when invalid_parameter_value then
      null;
  end;

  begin
    perform public.set_whatsapp_consent(
      formatted_result,
      'unknown'
    );
    raise exception 'Invalid consent transition was accepted';
  exception
    when invalid_parameter_value then
      null;
  end;

  perform public.set_whatsapp_consent(
    formatted_result,
    'granted'
  );

  insert into issue52_test.results (key, value)
  values ('whatsapp_customer_id', formatted_result);
end;
$$;

reset role;

do $$
declare
  whatsapp_customer_id uuid;
begin
  select result.value
  into whatsapp_customer_id
  from issue52_test.results as result
  where result.key = 'whatsapp_customer_id';

  if (
    select pg_catalog.count(*)
    from public.customer_channels as channel
    where channel.customer_id = whatsapp_customer_id
      and channel.channel_type = 'whatsapp'
      and channel.channel_address = '+5516999990001'
      and channel.consent_status = 'granted'
      and channel.consent_updated_at is not null
  ) <> 1 then
    raise exception
      'WhatsApp normalization or service-role consent did not persist';
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

do $$
declare
  own_customer_id uuid := private.current_customer_id();
begin
  if (select pg_catalog.count(*) from public.customers) <> 1 then
    raise exception 'Customer can read another customer identity';
  end if;

  if (select pg_catalog.count(*) from public.customer_channels) <> 1 then
    raise exception 'Customer can read another customer channel';
  end if;

  perform public.set_whatsapp_consent(own_customer_id, 'granted');
  perform public.set_whatsapp_consent(own_customer_id, 'revoked');

  if not exists (
    select 1
    from public.customer_channels as channel
    where channel.customer_id = own_customer_id
      and channel.consent_status = 'revoked'
      and channel.consent_updated_at is not null
  ) then
    raise exception 'Customer opt-out was not recorded';
  end if;

  perform issue52_test.expect_denied(
    pg_catalog.format(
      'select public.set_whatsapp_consent(%L::uuid, %L)',
      '00000000-0000-4000-8000-000000000052',
      'revoked'
    )
  );
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

do $$
begin
  if (select pg_catalog.count(*) from public.customers) <> 0
    or (select pg_catalog.count(*) from public.customer_channels) <> 0 then
    raise exception 'Provider can read customer identity data';
  end if;

  perform issue52_test.expect_denied(
    'select public.ensure_current_customer(''Provider'')'
  );
  perform issue52_test.expect_denied(
    'select public.resolve_or_create_whatsapp_customer(''+5516999999999'', ''Provider'')'
  );
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

do $$
begin
  if (select pg_catalog.count(*) from public.customers) < 3
    or (select pg_catalog.count(*) from public.customer_channels) < 3 then
    raise exception 'Concierge cannot read customer identity data';
  end if;

  perform issue52_test.expect_denied(
    'select public.ensure_current_customer(''Concierge'')'
  );
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);

do $$
begin
  if (select pg_catalog.count(*) from public.customers) < 3
    or (select pg_catalog.count(*) from public.customer_channels) < 3 then
    raise exception 'Admin cannot read customer identity data';
  end if;

  perform issue52_test.expect_denied(
    'select public.ensure_current_customer(''Admin'')'
  );
end;
$$;

reset role;

rollback;
