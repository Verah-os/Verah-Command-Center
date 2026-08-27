-- Canonical identity and resumable onboarding. Authentication accounts remain
-- login methods; operational entities keep their own stable identifiers.

create table public.verah_identities (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (pg_catalog.btrim(display_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column identity_id uuid references public.verah_identities(id) on delete restrict;

insert into public.verah_identities (id, display_name, created_at, updated_at)
select profile.user_id, profile.display_name, profile.created_at, profile.updated_at
from public.user_profiles profile
on conflict (id) do nothing;

update public.user_profiles profile
set identity_id = profile.user_id
where profile.identity_id is null;

alter table public.user_profiles alter column identity_id set not null;
create index user_profiles_identity_idx on public.user_profiles(identity_id);

create or replace function private.assign_user_profile_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.identity_id is null then
    insert into public.verah_identities(id, display_name)
    values (new.user_id, new.display_name)
    on conflict (id) do nothing;
    new.identity_id := new.user_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.assign_user_profile_identity()
  from public, anon, authenticated, service_role;
create trigger user_profiles_assign_identity
before insert on public.user_profiles
for each row execute function private.assign_user_profile_identity();

create table public.identity_relations (
  identity_id uuid not null references public.verah_identities(id) on delete restrict,
  relation_type text not null check (relation_type in ('customer', 'provider', 'concierge', 'admin')),
  customer_id uuid references public.customers(id) on delete restrict,
  provider_id uuid references public.service_providers(id) on delete restrict,
  relation_status text not null check (relation_status in ('candidate', 'active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (identity_id, relation_type),
  check (
    (relation_type = 'customer' and customer_id is not null and provider_id is null)
    or (relation_type = 'provider' and provider_id is not null and customer_id is null)
    or (relation_type in ('concierge', 'admin') and customer_id is null and provider_id is null)
  )
);

create unique index identity_relations_customer_uidx
  on public.identity_relations(customer_id) where customer_id is not null;
create unique index identity_relations_provider_uidx
  on public.identity_relations(provider_id) where provider_id is not null;

create table public.identity_onboarding (
  identity_id uuid not null references public.verah_identities(id) on delete restrict,
  journey_type text not null check (journey_type in ('customer', 'provider', 'concierge')),
  onboarding_status text not null default 'account_created'
    check (onboarding_status in ('account_created', 'in_progress', 'completed')),
  basic_profile_completed boolean not null default false,
  required_consents_completed boolean not null default false,
  onboarding_terms_version text,
  onboarding_terms_accepted_at timestamptz,
  vehicle_status text not null default 'pending'
    check (vehicle_status in ('pending', 'registered', 'not_applicable')),
  whatsapp_status text not null default 'optional'
    check (whatsapp_status in ('optional', 'linked', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (identity_id, journey_type),
  check (
    (required_consents_completed = false and onboarding_terms_version is null and onboarding_terms_accepted_at is null)
    or (required_consents_completed = true and onboarding_terms_version is not null and onboarding_terms_accepted_at is not null)
  ),
  check (onboarding_status <> 'completed' or completed_at is not null)
);

create table public.identity_access_events (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.verah_identities(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'customer_onboarding_started', 'provider_application_started',
    'concierge_provisioned', 'customer_onboarding_updated'
  )),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

insert into public.identity_relations (
  identity_id, relation_type, customer_id, provider_id, relation_status
)
select profile.identity_id, profile.role, customer.id, profile.provider_id,
  case when profile.role = 'provider' then 'candidate' else 'active' end
from public.user_profiles profile
left join public.customers customer on customer.auth_user_id = profile.user_id
where (profile.role = 'customer' and customer.id is not null)
   or profile.role in ('provider', 'concierge', 'admin')
on conflict (identity_id, relation_type) do nothing;

insert into public.identity_onboarding (
  identity_id, journey_type, onboarding_status, basic_profile_completed,
  required_consents_completed, onboarding_terms_version,
  onboarding_terms_accepted_at, vehicle_status, whatsapp_status, completed_at
)
select profile.identity_id,
  case when profile.role = 'admin' then 'concierge' else profile.role end,
  'completed', true, true, 'legacy-profile-v1', profile.created_at,
  case when profile.role = 'customer' then 'registered' else 'not_applicable' end,
  'optional', profile.created_at
from public.user_profiles profile
where profile.role in ('customer', 'provider', 'concierge', 'admin')
on conflict (identity_id, journey_type) do nothing;

alter table public.verah_identities enable row level security;
alter table public.identity_relations enable row level security;
alter table public.identity_onboarding enable row level security;
alter table public.identity_access_events enable row level security;

revoke all on table public.verah_identities from public, anon, authenticated, service_role;
revoke all on table public.identity_relations from public, anon, authenticated, service_role;
revoke all on table public.identity_onboarding from public, anon, authenticated, service_role;
revoke all on table public.identity_access_events from public, anon, authenticated, service_role;
grant select on table public.verah_identities, public.identity_relations,
  public.identity_onboarding, public.identity_access_events to authenticated;

create policy "Identity owners and admins read identities"
  on public.verah_identities for select to authenticated using (
    exists (
      select 1 from public.user_profiles profile
      where profile.identity_id = verah_identities.id and profile.user_id = (select auth.uid())
    ) or (select public.current_verah_role()) = 'admin'
  );
create policy "Identity owners and admins read relations"
  on public.identity_relations for select to authenticated using (
    exists (
      select 1 from public.user_profiles profile
      where profile.identity_id = identity_relations.identity_id and profile.user_id = (select auth.uid())
    ) or (select public.current_verah_role()) = 'admin'
  );
create policy "Identity owners and admins read onboarding"
  on public.identity_onboarding for select to authenticated using (
    exists (
      select 1 from public.user_profiles profile
      where profile.identity_id = identity_onboarding.identity_id and profile.user_id = (select auth.uid())
    ) or (select public.current_verah_role()) = 'admin'
  );
create policy "Admins read identity access audit"
  on public.identity_access_events for select to authenticated using (
    (select public.current_verah_role()) = 'admin'
  );

create or replace function private.reject_identity_access_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'Identity access history is append-only';
end;
$$;
revoke execute on function private.reject_identity_access_event_mutation()
  from public, anon, authenticated, service_role;
create trigger identity_access_events_immutable
before update or delete on public.identity_access_events
for each row execute function private.reject_identity_access_event_mutation();

create or replace function private.current_verah_identity_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select profile.identity_id from public.user_profiles profile
  where profile.user_id = (select auth.uid())
$$;
revoke execute on function private.current_verah_identity_id()
  from public, anon, authenticated, service_role;
grant execute on function private.current_verah_identity_id() to authenticated;

create or replace function public.start_customer_onboarding(p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := nullif(pg_catalog.btrim(p_display_name), '');
  profile public.user_profiles%rowtype;
  resolved_identity_id uuid;
  resolved_customer_id uuid;
  relation_created boolean := false;
begin
  if actor_id is null or normalized_name is null then
    raise exception using errcode = '22023', message = 'Authenticated user and display name are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity-onboarding:' || actor_id::text, 0));
  select * into profile from public.user_profiles where user_id = actor_id;
  if profile.user_id is not null and profile.role in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Privileged identities cannot self-enroll';
  end if;
  if profile.user_id is null then
    insert into public.verah_identities(display_name) values (normalized_name) returning id into resolved_identity_id;
    insert into public.user_profiles(user_id, identity_id, role, display_name)
    values (actor_id, resolved_identity_id, 'customer', normalized_name);
  else
    resolved_identity_id := profile.identity_id;
  end if;
  select relation.customer_id into resolved_customer_id from public.identity_relations relation
  where relation.identity_id = resolved_identity_id and relation.relation_type = 'customer';
  if resolved_customer_id is null then
    select customer.id into resolved_customer_id from public.customers customer where customer.auth_user_id = actor_id;
  end if;
  if resolved_customer_id is null then
    insert into public.customers(auth_user_id, display_name)
    values (actor_id, normalized_name) returning id into resolved_customer_id;
  elsif exists (
    select 1 from public.customers customer
    where customer.id = resolved_customer_id and customer.auth_user_id is not null and customer.auth_user_id <> actor_id
  ) then
    raise exception using errcode = '23505', message = 'Customer identity is bound to another authentication account';
  else
    update public.customers set auth_user_id = actor_id, updated_at = pg_catalog.now()
    where id = resolved_customer_id and auth_user_id is null;
  end if;
  insert into public.identity_relations(identity_id, relation_type, customer_id, relation_status)
  values (resolved_identity_id, 'customer', resolved_customer_id, 'active')
  on conflict (identity_id, relation_type) do nothing;
  relation_created := found;
  insert into public.identity_onboarding(identity_id, journey_type)
  values (resolved_identity_id, 'customer') on conflict (identity_id, journey_type) do nothing;
  if relation_created then
    insert into public.identity_access_events(
      identity_id, auth_user_id, event_type, actor_auth_user_id, metadata
    ) values (resolved_identity_id, actor_id, 'customer_onboarding_started', actor_id, pg_catalog.jsonb_build_object('schema_version', 1));
  end if;
  return pg_catalog.jsonb_build_object('identity_id', resolved_identity_id, 'customer_id', resolved_customer_id, 'onboarding_status',
    (select onboarding_status from public.identity_onboarding where identity_onboarding.identity_id = resolved_identity_id and journey_type = 'customer'));
end;
$$;

create or replace function public.start_provider_application(
  p_legal_name text, p_trade_name text, p_city text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  legal_name text := nullif(pg_catalog.btrim(p_legal_name), '');
  city_name text := nullif(pg_catalog.btrim(p_city), '');
  profile public.user_profiles%rowtype;
  resolved_identity_id uuid;
  resolved_provider_id uuid;
  relation_created boolean := false;
begin
  if actor_id is null or legal_name is null or city_name is null then
    raise exception using errcode = '22023', message = 'Authenticated user, legal name and city are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity-onboarding:' || actor_id::text, 0));
  select * into profile from public.user_profiles where user_id = actor_id;
  if profile.user_id is not null and profile.role in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Privileged identities cannot self-enroll';
  end if;
  if profile.user_id is null then
    insert into public.verah_identities(display_name) values (legal_name) returning id into resolved_identity_id;
  else resolved_identity_id := profile.identity_id;
  end if;
  select relation.provider_id into resolved_provider_id from public.identity_relations relation
  where relation.identity_id = resolved_identity_id and relation.relation_type = 'provider';
  if resolved_provider_id is null then
    insert into public.service_providers(name, trade_name, city, status, is_synthetic)
    values (legal_name, nullif(pg_catalog.btrim(p_trade_name), ''), city_name, 'inactive', false)
    returning id into resolved_provider_id;
  end if;
  if profile.user_id is null then
    insert into public.user_profiles(user_id, identity_id, role, display_name, provider_id)
    values (actor_id, resolved_identity_id, 'provider', legal_name, resolved_provider_id);
  end if;
  insert into public.provider_homologation_profiles(provider_id, legal_name, trade_name, homologation_status)
  values (resolved_provider_id, legal_name, nullif(pg_catalog.btrim(p_trade_name), ''), 'candidate')
  on conflict (provider_id) do nothing;
  insert into public.identity_relations(identity_id, relation_type, provider_id, relation_status)
  values (resolved_identity_id, 'provider', resolved_provider_id, 'candidate')
  on conflict (identity_id, relation_type) do nothing;
  relation_created := found;
  insert into public.identity_onboarding(
    identity_id, journey_type, onboarding_status, basic_profile_completed, vehicle_status
  ) values (resolved_identity_id, 'provider', 'in_progress', true, 'not_applicable')
  on conflict (identity_id, journey_type) do nothing;
  if relation_created then
    insert into public.identity_access_events(identity_id, auth_user_id, event_type, actor_auth_user_id, metadata)
    values (resolved_identity_id, actor_id, 'provider_application_started', actor_id,
      pg_catalog.jsonb_build_object('schema_version', 1, 'provider_id', resolved_provider_id));
  end if;
  return pg_catalog.jsonb_build_object('identity_id', resolved_identity_id, 'provider_id', resolved_provider_id,
    'homologation_status', 'candidate', 'onboarding_status', 'in_progress');
end;
$$;

create or replace function public.complete_customer_basic_onboarding(
  p_display_name text, p_terms_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  resolved_identity_id uuid := (select private.current_verah_identity_id());
  resolved_customer_id uuid;
  normalized_name text := nullif(pg_catalog.btrim(p_display_name), '');
begin
  if actor_id is null or resolved_identity_id is null or normalized_name is null
    or p_terms_version <> 'pilot-alpha-onboarding-v1' then
    raise exception using errcode = '22023', message = 'Explicit current onboarding terms acceptance is required';
  end if;
  select relation.customer_id into resolved_customer_id from public.identity_relations relation
  where relation.identity_id = resolved_identity_id and relation.relation_type = 'customer';
  if resolved_customer_id is null then
    raise exception using errcode = '42501', message = 'Customer relation required';
  end if;
  update public.verah_identities set display_name = normalized_name, updated_at = pg_catalog.now() where id = resolved_identity_id;
  update public.user_profiles set display_name = normalized_name, updated_at = pg_catalog.now() where user_id = actor_id;
  update public.customers set display_name = normalized_name, updated_at = pg_catalog.now() where id = resolved_customer_id;
  update public.identity_onboarding set onboarding_status = 'in_progress', basic_profile_completed = true,
    required_consents_completed = true, onboarding_terms_version = p_terms_version,
    onboarding_terms_accepted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where identity_onboarding.identity_id = resolved_identity_id and journey_type = 'customer';
  insert into public.identity_access_events(identity_id, auth_user_id, event_type, actor_auth_user_id, metadata)
  values (resolved_identity_id, actor_id, 'customer_onboarding_updated', actor_id,
    pg_catalog.jsonb_build_object('schema_version', 1, 'step', 'basic_profile'));
  return (
    select pg_catalog.to_jsonb(onboarding)
    from public.identity_onboarding onboarding
    where onboarding.identity_id = resolved_identity_id and onboarding.journey_type = 'customer'
  );
end;
$$;

create or replace function public.refresh_customer_onboarding()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  resolved_identity_id uuid := (select private.current_verah_identity_id());
  has_vehicle boolean;
  has_whatsapp boolean;
  result public.identity_onboarding%rowtype;
begin
  if actor_id is null or resolved_identity_id is null or (select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;
  select exists(select 1 from public.customer_vehicles vehicle where vehicle.owner_id = actor_id and vehicle.active) into has_vehicle;
  select exists(
    select 1 from public.identity_relations relation
    join public.customer_channels channel on channel.customer_id = relation.customer_id
    where relation.identity_id = resolved_identity_id and relation.relation_type = 'customer' and channel.channel_type = 'whatsapp'
  ) into has_whatsapp;
  update public.identity_onboarding set
    vehicle_status = case when has_vehicle then 'registered' else 'pending' end,
    whatsapp_status = case when has_whatsapp then 'linked' else 'optional' end,
    onboarding_status = case when basic_profile_completed and required_consents_completed and has_vehicle then 'completed' else 'in_progress' end,
    completed_at = case when basic_profile_completed and required_consents_completed and has_vehicle then coalesce(completed_at, pg_catalog.now()) else null end,
    updated_at = pg_catalog.now()
  where identity_onboarding.identity_id = resolved_identity_id and journey_type = 'customer'
  returning * into result;
  return pg_catalog.to_jsonb(result);
end;
$$;

create or replace function public.provision_concierge_identity(
  p_auth_user_id uuid, p_display_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := nullif(pg_catalog.btrim(p_display_name), '');
  resolved_identity_id uuid;
  existing_role text;
begin
  if actor_id is null or (select public.current_verah_role()) <> 'admin' then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;
  if normalized_name is null or not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Existing authentication identity and display name are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity-onboarding:' || p_auth_user_id::text, 0));
  select role, user_profiles.identity_id into existing_role, resolved_identity_id from public.user_profiles where user_id = p_auth_user_id;
  if existing_role is not null then
    if existing_role = 'concierge' then return resolved_identity_id; end if;
    raise exception using errcode = '23505', message = 'Existing identity cannot be promoted by provisioning';
  end if;
  insert into public.verah_identities(display_name) values (normalized_name) returning id into resolved_identity_id;
  insert into public.user_profiles(user_id, identity_id, role, display_name)
  values (p_auth_user_id, resolved_identity_id, 'concierge', normalized_name);
  insert into public.identity_relations(identity_id, relation_type, relation_status)
  values (resolved_identity_id, 'concierge', 'active');
  insert into public.identity_onboarding(
    identity_id, journey_type, onboarding_status, basic_profile_completed,
    required_consents_completed, onboarding_terms_version,
    onboarding_terms_accepted_at, vehicle_status, completed_at
  ) values (
    resolved_identity_id, 'concierge', 'completed', true, true, 'internal-access-v1',
    pg_catalog.now(), 'not_applicable', pg_catalog.now()
  );
  insert into public.identity_access_events(identity_id, auth_user_id, event_type, actor_auth_user_id, metadata)
  values (resolved_identity_id, p_auth_user_id, 'concierge_provisioned', actor_id,
    pg_catalog.jsonb_build_object('schema_version', 1));
  return resolved_identity_id;
end;
$$;

revoke execute on function public.start_customer_onboarding(text) from public, anon, authenticated, service_role;
revoke execute on function public.start_provider_application(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.complete_customer_basic_onboarding(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.refresh_customer_onboarding() from public, anon, authenticated, service_role;
revoke execute on function public.provision_concierge_identity(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.start_customer_onboarding(text) to authenticated;
grant execute on function public.start_provider_application(text, text, text) to authenticated;
grant execute on function public.complete_customer_basic_onboarding(text, text) to authenticated;
grant execute on function public.refresh_customer_onboarding() to authenticated;
grant execute on function public.provision_concierge_identity(uuid, text) to authenticated;
