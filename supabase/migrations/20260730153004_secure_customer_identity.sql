create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create or replace function private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select customer.id
  from public.customers as customer
  where customer.auth_user_id = (select auth.uid())
    and (select public.current_verah_role()) = 'customer'
$$;

revoke execute on function private.current_customer_id()
  from public, anon, authenticated, service_role;
grant execute on function private.current_customer_id()
  to authenticated;

alter table public.customers enable row level security;
alter table public.customer_channels enable row level security;

revoke all on table public.customers from anon, authenticated;
revoke all on table public.customer_channels from anon, authenticated;

grant select on table public.customers to authenticated;
grant select on table public.customer_channels to authenticated;

drop policy if exists "Customers read own identity"
  on public.customers;
create policy "Customers read own identity"
  on public.customers
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and id = (select private.current_customer_id())
  );

drop policy if exists "Operations read customer identities"
  on public.customers;
create policy "Operations read customer identities"
  on public.customers
  for select
  to authenticated
  using (
    (select public.current_verah_role()) in ('concierge', 'admin')
  );

drop policy if exists "Customers read own channels"
  on public.customer_channels;
create policy "Customers read own channels"
  on public.customer_channels
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and customer_id = (select private.current_customer_id())
  );

drop policy if exists "Operations read customer channels"
  on public.customer_channels;
create policy "Operations read customer channels"
  on public.customer_channels
  for select
  to authenticated
  using (
    (select public.current_verah_role()) in ('concierge', 'admin')
  );

create or replace function public.ensure_current_customer(display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_display_name text := pg_catalog.btrim(display_name);
  resolved_customer_id uuid;
begin
  if current_user_id is null
    or (select public.current_verah_role()) is distinct from 'customer' then
    raise exception using
      errcode = '42501',
      message = 'Customer authorization required';
  end if;

  if normalized_display_name is null or normalized_display_name = '' then
    raise exception using
      errcode = '22023',
      message = 'Display name is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('customer-auth:', current_user_id::text),
      0
    )
  );

  select customer.id
  into resolved_customer_id
  from public.customers as customer
  where customer.auth_user_id = current_user_id;

  if resolved_customer_id is not null then
    return resolved_customer_id;
  end if;

  insert into public.customers (auth_user_id, display_name)
  values (current_user_id, normalized_display_name)
  on conflict (auth_user_id)
    where auth_user_id is not null
    do nothing
  returning id into resolved_customer_id;

  if resolved_customer_id is null then
    select customer.id
    into resolved_customer_id
    from public.customers as customer
    where customer.auth_user_id = current_user_id;
  end if;

  return resolved_customer_id;
end;
$$;

revoke execute on function public.ensure_current_customer(text)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_current_customer(text)
  to authenticated;

create or replace function public.resolve_or_create_whatsapp_customer(
  p_phone text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    ),
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::jsonb ->> 'role',
    ''
  );
  normalized_phone text;
  normalized_display_name text;
  created_customer_id uuid;
  resolved_customer_id uuid;
begin
  if request_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Server-side authorization required';
  end if;

  normalized_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_phone),
    '[[:space:]().-]',
    '',
    'g'
  );

  if normalized_phone is null
    or normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using
      errcode = '22023',
      message = 'A valid E.164 phone number is required';
  end if;

  normalized_display_name := coalesce(
    nullif(pg_catalog.btrim(p_display_name), ''),
    'Cliente WhatsApp'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat('customer-whatsapp:', normalized_phone),
      0
    )
  );

  select channel.customer_id
  into resolved_customer_id
  from public.customer_channels as channel
  where channel.channel_type = 'whatsapp'
    and channel.channel_address = normalized_phone;

  if resolved_customer_id is not null then
    return resolved_customer_id;
  end if;

  insert into public.customers (display_name)
  values (normalized_display_name)
  returning id into created_customer_id;

  insert into public.customer_channels (
    customer_id,
    channel_type,
    channel_address,
    is_primary
  )
  values (
    created_customer_id,
    'whatsapp',
    normalized_phone,
    true
  )
  on conflict (channel_type, channel_address)
    do nothing
  returning customer_id into resolved_customer_id;

  if resolved_customer_id is null then
    delete from public.customers
    where id = created_customer_id;

    select channel.customer_id
    into resolved_customer_id
    from public.customer_channels as channel
    where channel.channel_type = 'whatsapp'
      and channel.channel_address = normalized_phone;
  end if;

  if resolved_customer_id is null then
    raise exception using
      errcode = '40001',
      message = 'Customer identity could not be resolved';
  end if;

  return resolved_customer_id;
end;
$$;

revoke execute on function public.resolve_or_create_whatsapp_customer(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_or_create_whatsapp_customer(text, text)
  to service_role;

create or replace function public.set_whatsapp_consent(
  p_customer_id uuid,
  p_consent_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    ),
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::jsonb ->> 'role',
    ''
  );
  resolved_channel_id uuid;
begin
  if p_customer_id is null then
    raise exception using
      errcode = '22023',
      message = 'Customer id is required';
  end if;

  if p_consent_status is null
    or p_consent_status not in ('granted', 'revoked') then
    raise exception using
      errcode = '22023',
      message = 'Consent status must be granted or revoked';
  end if;

  if request_role <> 'service_role'
    and (
      (select auth.uid()) is null
      or (select public.current_verah_role()) is distinct from 'customer'
      or (select private.current_customer_id()) is distinct from p_customer_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Customer authorization required';
  end if;

  update public.customer_channels
  set consent_status = p_consent_status,
      consent_updated_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where customer_id = p_customer_id
    and channel_type = 'whatsapp'
    and is_primary
  returning id into resolved_channel_id;

  if resolved_channel_id is null then
    raise exception using
      errcode = '22023',
      message = 'Primary WhatsApp channel not found';
  end if;

  return resolved_channel_id;
end;
$$;

revoke execute on function public.set_whatsapp_consent(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_whatsapp_consent(uuid, text)
  to authenticated, service_role;
