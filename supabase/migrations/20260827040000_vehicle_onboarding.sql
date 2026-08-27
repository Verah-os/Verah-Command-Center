-- Plate-first vehicle onboarding. customer_vehicles remains the only canonical
-- vehicle record; lookup data is only a suggestion until the customer confirms it.

alter table public.customer_vehicles
  add column data_source text not null default 'legacy'
    check (data_source in ('legacy', 'customer_confirmed')),
  add column lookup_source text not null default 'manual'
    check (lookup_source in ('manual', 'local_fixture', 'external_provider')),
  add column lookup_provider text,
  add column source_observed_at timestamptz,
  add column source_synthetic boolean not null default false,
  add column customer_confirmed_at timestamptz;

comment on column public.customer_vehicles.data_source is
  'Canonical data authority. Customer onboarding writes customer_confirmed only.';
comment on column public.customer_vehicles.lookup_source is
  'How the pre-confirmation suggestion was obtained; never an ownership identity.';
comment on column public.customer_vehicles.source_synthetic is
  'True only when the suggestion came from an explicitly synthetic fixture.';

-- Preserve access for historical canonical vehicles without claiming a provider
-- provenance that did not exist at creation time.
update public.customer_vehicles
set customer_confirmed_at = coalesce(customer_confirmed_at, updated_at, created_at)
where customer_confirmed_at is null;

revoke insert on table public.customer_vehicles from authenticated;

create or replace function public.refresh_customer_onboarding()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  resolved_identity_id uuid := (select private.current_verah_identity_id());
  resolved_customer_id uuid := (select private.current_customer_id());
  has_vehicle boolean;
  has_whatsapp boolean;
  result public.identity_onboarding%rowtype;
begin
  if actor_id is null or resolved_identity_id is null or (select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;
  select exists(
    select 1 from public.customer_vehicles vehicle
    where (vehicle.owner_id = actor_id or vehicle.customer_id = resolved_customer_id)
      and vehicle.active and vehicle.customer_confirmed_at is not null
  ) into has_vehicle;
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

create or replace function public.confirm_customer_vehicle(
  p_plate text,
  p_brand text,
  p_model text,
  p_model_year integer,
  p_version text default null,
  p_engine_type text default null,
  p_transmission text default null,
  p_lookup_source text default 'manual',
  p_lookup_provider text default null,
  p_source_observed_at timestamptz default null,
  p_source_synthetic boolean default false,
  p_customer_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  resolved_customer_id uuid := (select private.current_customer_id());
  normalized_plate text := pg_catalog.upper(
    pg_catalog.regexp_replace(pg_catalog.coalesce(p_plate, ''), '[[:space:]-]', '', 'g')
  );
  normalized_brand text := nullif(pg_catalog.btrim(p_brand), '');
  normalized_model text := nullif(pg_catalog.btrim(p_model), '');
  normalized_version text := nullif(pg_catalog.btrim(p_version), '');
  normalized_engine text := nullif(pg_catalog.btrim(p_engine_type), '');
  normalized_transmission text := nullif(pg_catalog.btrim(p_transmission), '');
  normalized_provider text := nullif(pg_catalog.btrim(p_lookup_provider), '');
  existing_vehicle public.customer_vehicles%rowtype;
  created_vehicle public.customer_vehicles%rowtype;
begin
  if actor_id is null or resolved_customer_id is null
    or (select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;
  if p_customer_confirmed is not true then
    raise exception using errcode = '22023', message = 'Explicit vehicle confirmation required';
  end if;
  if normalized_plate !~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$' then
    raise exception using errcode = '22023', message = 'Invalid Brazilian license plate';
  end if;
  if normalized_brand is null or normalized_model is null or p_model_year is null
    or pg_catalog.char_length(normalized_brand) > 80
    or pg_catalog.char_length(normalized_model) > 80
    or p_model_year not between 1950 and (pg_catalog.date_part('year', pg_catalog.now())::integer + 1) then
    raise exception using errcode = '22023', message = 'Invalid vehicle details';
  end if;
  if p_lookup_source not in ('manual', 'local_fixture')
    or (p_lookup_source = 'manual' and (normalized_provider is not null or p_source_synthetic))
    or (p_lookup_source = 'local_fixture' and (normalized_provider is null or p_source_synthetic is not true)) then
    raise exception using errcode = '22023', message = 'Invalid or unavailable lookup provenance';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-onboarding:' || actor_id::text || ':' || normalized_plate, 0)
  );

  select vehicle.* into existing_vehicle
  from public.customer_vehicles vehicle
  where vehicle.active
    and (vehicle.owner_id = actor_id or vehicle.customer_id = resolved_customer_id)
    and pg_catalog.upper(pg_catalog.regexp_replace(vehicle.plate, '[^[:alnum:]]', '', 'g')) = normalized_plate
  order by vehicle.created_at
  limit 1;

  if existing_vehicle.id is not null then
    if existing_vehicle.brand is distinct from normalized_brand
      or existing_vehicle.model is distinct from normalized_model
      or existing_vehicle.year is distinct from p_model_year
      or existing_vehicle.version is distinct from normalized_version
      or existing_vehicle.engine_type is distinct from normalized_engine
      or existing_vehicle.transmission is distinct from normalized_transmission
      or existing_vehicle.lookup_source is distinct from p_lookup_source
      or existing_vehicle.lookup_provider is distinct from normalized_provider
      or existing_vehicle.source_synthetic is distinct from p_source_synthetic then
      raise exception using errcode = '23505', message = 'Confirmed vehicle already exists with different data';
    end if;
    return pg_catalog.jsonb_build_object('vehicle_id', existing_vehicle.id, 'created', false);
  end if;

  insert into public.customer_vehicles(
    owner_id, customer_id, brand, model, year, plate, version, engine_type, transmission,
    data_source, lookup_source, lookup_provider, source_observed_at,
    source_synthetic, customer_confirmed_at
  ) values (
    actor_id, resolved_customer_id, normalized_brand, normalized_model, p_model_year,
    normalized_plate, normalized_version, normalized_engine, normalized_transmission,
    'customer_confirmed', p_lookup_source, normalized_provider,
    case when p_lookup_source = 'manual' then null else p_source_observed_at end,
    p_source_synthetic, pg_catalog.now()
  ) returning * into created_vehicle;

  perform public.refresh_customer_onboarding();
  return pg_catalog.jsonb_build_object('vehicle_id', created_vehicle.id, 'created', true);
end;
$$;

revoke execute on function public.confirm_customer_vehicle(
  text, text, text, integer, text, text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_customer_vehicle(
  text, text, text, integer, text, text, text, text, text, timestamptz, boolean, boolean
) to authenticated;
