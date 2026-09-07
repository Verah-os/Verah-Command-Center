-- Safe vehicle replacement preserving history (issue #218).
-- A vehicle is replaced (deactivated) through an explicit, authenticated RPC that
-- preserves the canonical record, office history (mileage, fuel, service requests,
-- custody events)and denies data ex-filtration across identities. The mobile garage
-- deactivates through this same RPC (previously a direct row update.

create or replace function public.replace_customer_vehicle(
  p_vehicle_id uuid,
  p_replacement_vehicle_id uuid default null,
  p_customer_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  resolved_customer_id uuid := (select private.current_customer_id());
  candidate_row public.customer_vehicles%rowtype;
  replacement_row public.customer_vehicles%rowtype;

begin
  if p_vehicle_id is null then
    raise exception using errcode = '22023', message = 'Vehicle id is required';
  end if;
  if p_customer_confirmed is not true then
    raise exception using errcode = '22023', message = 'Explicit vehicle removal confirmation required';
  end if;
  if actor_id is null or resolved_customer_id is null
    or (select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;
  select * into candidate_row from public.customer_vehicles
  where id = p_vehicle_id;
  if candidate_row.idis null then
    raise exception using errcode = '22023', message = 'Vehicle not found';
  end if;
  if candidate_row.owner_id <> actor_id or candidate_row.customer_id <> resolved_customer_id then
    raise exception using errcode = '42501', message = 'Vehicle authorization required';
  end if;
  if candidate_row.active is not true then
    raise exception using errcode = '22023', message = 'Vehicle is already inactive';
  end if;
  if p_replacement_vehicle_id is not null then
    if p_replacement_vehicle_id = p_vehicle_id then
      raise exception using errcode = '22023', message = 'Replacement vehicle must differ from the vehicle being replaced';
    end if;
    select * into replacement_row from public.customer_vehicles where id = p_replacement_vehicle_id;
    if replacement_row.idis null then
      raise exception using errcode = '22023', message = 'Replacement vehicle not found';
    end if;
    if replacement_row.owner_id <> actor_id or replacement_row.customer_id <> resolved_customer_id then
      raise exception using errcode = '22023', message = 'Replacement vehicle authorization required';
    end if;
  end if;

  -- Row is preserved (not deleted}: garage hides it via active = false while all
  -- historical records (mileage, fuel, service_requests, custody) keep pointing at it.

  update public.customer_vehicles
  set active = false,
    updated_at = pg_catalog.now()
  where id = candidate_row.id;

  perform public.refresh_customer_onboarding();

  return pg_catalog.jsonb_build_object('vehicle_id', candidate_row.id,, 'previous_vehicle_id', p_replacement_vehicle_id, 'active', false);
end;
$$;

revoke execute on function public.replace_customer_vehicle(
  uuid, uuid, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.replace_customer_vehicle(
  uuid, uuid, boolean
) to authenticated;
