create or replace function public.confirm_customer_vehicle(
  p_plate text,
  p_brand text,
  p_model text,
  p_model_year integer,
  p_version text default null,
  p_engine_type text default null,
  p_transmission text default null,
  p_lookup_source text default 'manual',
  p_customer_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_plate text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  vehicle_id uuid;
begin
  if actor_id is null or (select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;

  if not p_customer_confirmed then
    raise exception using errcode = '22023', message = 'Customer confirmation required';
  end if;

  if normalized_plate !~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$' then
    raise exception using errcode = '22023', message = 'Invalid Brazilian plate';
  end if;

  if nullif(trim(p_brand), '') is null or nullif(trim(p_model), '') is null then
    raise exception using errcode = '22023', message = 'Brand and model are required';
  end if;

  if p_model_year < 1950 or p_model_year > extract(year from current_date)::integer + 1 then
    raise exception using errcode = '22023', message = 'Invalid model year';
  end if;

  select id into vehicle_id
  from public.customer_vehicles
  where owner_id = actor_id
    and active
    and lower(coalesce(plate, '')) = lower(normalized_plate)
  order by created_at asc
  limit 1;

  if vehicle_id is null then
    insert into public.customer_vehicles (owner_id, brand, model, year, plate, active)
    values (actor_id, trim(p_brand), trim(p_model), p_model_year, normalized_plate, true)
    returning id into vehicle_id;
  else
    update public.customer_vehicles
    set brand = trim(p_brand),
        model = trim(p_model),
        year = p_model_year,
        plate = normalized_plate,
        active = true,
        updated_at = now()
    where id = vehicle_id;
  end if;

  perform public.refresh_customer_onboarding();

  return jsonb_build_object(
    'vehicle_id', vehicle_id,
    'plate', normalized_plate,
    'lookup_source', coalesce(nullif(trim(p_lookup_source), ''), 'manual')
  );
end;
$$;

revoke all on function public.confirm_customer_vehicle(text,text,text,integer,text,text,text,text,boolean) from public;
grant execute on function public.confirm_customer_vehicle(text,text,text,integer,text,text,text,text,boolean) to authenticated;
