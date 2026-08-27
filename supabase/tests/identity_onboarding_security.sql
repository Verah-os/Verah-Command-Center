\set ON_ERROR_STOP on

begin;

create schema identity_onboarding_test;
create function identity_onboarding_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema identity_onboarding_test to authenticated;
grant execute on function identity_onboarding_test.expect_error(text) to authenticated;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'identity.customer.one@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'identity.customer.two@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'identity.provider.one@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'identity.provider.two@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'identity.admin@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'identity.concierge.target@example.invalid', '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'identity.concierge.self@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles(user_id, role, display_name)
values ('a1000000-0000-4000-8000-000000000005', 'admin', 'Identity Admin');

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'verah_identities', 'identity_relations', 'identity_onboarding', 'identity_access_events'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then raise exception 'RLS disabled for public.%', table_name; end if;
    if pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Authenticated direct writes remain on public.%', table_name;
    end if;
  end loop;
end;
$$;

-- Customer self-signup provisions one canonical identity/customer and retries safely.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
create temporary table customer_signup_results as
select public.start_customer_onboarding('Cliente Alpha') as result;
insert into customer_signup_results select public.start_customer_onboarding('Cliente Alpha retry');
do $$ begin
  if (select count(distinct result ->> 'identity_id') from customer_signup_results) <> 1
    or (select count(distinct result ->> 'customer_id') from customer_signup_results) <> 1 then
    raise exception 'Customer signup retry duplicated canonical identity';
  end if;
end $$;

-- Basic onboarding is explicit and resumable; vehicle state is derived canonically.
select public.complete_customer_basic_onboarding('Cliente Alpha', 'pilot-alpha-onboarding-v1');
do $$ begin
  if (public.refresh_customer_onboarding() ->> 'onboarding_status') <> 'in_progress'
    or (public.refresh_customer_onboarding() ->> 'vehicle_status') <> 'pending' then
    raise exception 'Incomplete onboarding did not remain resumable';
  end if;
end $$;
insert into public.customer_vehicles(owner_id, brand, model, year)
values ('a1000000-0000-4000-8000-000000000001', 'Volkswagen', 'Polo', 2022);
do $$ begin
  if (public.refresh_customer_onboarding() ->> 'onboarding_status') <> 'completed'
    or (public.refresh_customer_onboarding() ->> 'vehicle_status') <> 'registered' then
    raise exception 'Canonical vehicle did not complete customer onboarding';
  end if;
end $$;

-- A customer can apply as provider without replacing the active customer access role.
select public.start_provider_application('Oficina da Cliente Alpha', 'Oficina Alpha', 'Franca');
do $$ begin
  if (select count(*) from public.identity_relations relation
      where relation.identity_id = private.current_verah_identity_id()) <> 2
    or (select public.current_verah_role()) <> 'customer' then
    raise exception 'Multi-relation identity replaced the active access profile';
  end if;
end $$;

-- Customer cannot self-provision privileged access.
select identity_onboarding_test.expect_error(
  $$select public.provision_concierge_identity('a1000000-0000-4000-8000-000000000007', 'Unauthorized Concierge')$$
);
select identity_onboarding_test.expect_error(
  $$insert into public.user_profiles(user_id, role, display_name) values ('a1000000-0000-4000-8000-000000000007','admin','Unauthorized Admin')$$
);

-- Second customer cannot read the first customer's identity or history.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.start_customer_onboarding('Cliente Beta');
do $$ begin
  if exists (
    select 1 from public.customers customer
    where customer.auth_user_id = 'a1000000-0000-4000-8000-000000000001'
  ) then raise exception 'Cross-customer identity leaked'; end if;
end $$;

-- Provider applications are inactive/candidate and isolated from each other.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
create temporary table provider_one_result as
select public.start_provider_application('Provider One Ltda', 'Provider One', 'Franca') as result;
insert into provider_one_result select public.start_provider_application('Provider One Ltda', 'Provider One', 'Franca');
do $$ begin
  if (select count(distinct result ->> 'provider_id') from provider_one_result) <> 1
    or public.get_own_provider_homologation() ->> 'homologation_status' <> 'candidate'
    or exists (
      select 1 from public.service_providers provider
      where provider.id = ((select result ->> 'provider_id' from provider_one_result limit 1))::uuid
        and provider.status <> 'inactive'
    ) then raise exception 'Provider application was duplicated or auto-approved'; end if;
end $$;
select identity_onboarding_test.expect_error(
  $$select public.set_provider_homologation_status(
    ((select result ->> 'provider_id' from provider_one_result limit 1))::uuid,
    'approved', 'self approval', null)$$
);
select identity_onboarding_test.expect_error(
  $$update public.user_profiles set role = 'admin', provider_id = null
    where user_id = 'a1000000-0000-4000-8000-000000000003'$$
);

select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select public.start_provider_application('Provider Two Ltda', 'Provider Two', 'Franca');
do $$ begin
  if (select count(*) from public.service_providers) <> 1 then
    raise exception 'Cross-provider directory leaked';
  end if;
end $$;

-- Public signup paths cannot select Concierge or Admin.
select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000005', true);
select identity_onboarding_test.expect_error($$select public.start_customer_onboarding('Admin self signup')$$);
select identity_onboarding_test.expect_error($$select public.start_provider_application('Admin Provider','Admin Provider','Franca')$$);

-- An existing Admin can provision a Concierge identity; retry is idempotent.
select public.provision_concierge_identity(
  'a1000000-0000-4000-8000-000000000006', 'Concierge Provisioned'
);
select public.provision_concierge_identity(
  'a1000000-0000-4000-8000-000000000006', 'Concierge Provisioned'
);
reset role;
do $$ begin
  if (select count(*) from public.user_profiles
      where user_id = 'a1000000-0000-4000-8000-000000000006' and role = 'concierge') <> 1
    or (select count(*) from public.identity_access_events
        where auth_user_id = 'a1000000-0000-4000-8000-000000000006'
          and event_type = 'concierge_provisioned') <> 1 then
    raise exception 'Admin Concierge provisioning is not idempotent or auditable';
  end if;
end $$;

-- WhatsApp remains a private channel/pending identity, never a customer key.
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select public.persist_whatsapp_inbound_message_safe(
  '+5516999998877', 'wamid.identity.pending.1', 'text', 'Mensagem sintética pendente', now(), '{}'::jsonb
);
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$ begin
  if exists (select 1 from public.whatsapp_unbound_contacts)
    or exists (select 1 from public.whatsapp_unbound_messages) then
    raise exception 'Pending WhatsApp identity leaked history';
  end if;
  if exists (select 1 from public.customers customer where customer.display_name = '+5516999998877') then
    raise exception 'Phone became a canonical customer identity';
  end if;
end $$;

rollback;
