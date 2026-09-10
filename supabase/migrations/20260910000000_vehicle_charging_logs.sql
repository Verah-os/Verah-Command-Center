-- #230: repository-only. Apply remotely only after the human database gate.

-- Canonical per-vehicle EV charging log. Mirrors vehicle_fuel_logs/vehicle_mileage_logs
-- semantics: odometer readings never regress against fuel, charging or mileage logs; logs
-- are append-only. Consumption (km/kWh) is derived deterministically only when a valid
-- odometer interval exists between the previous charging log and this one. No fake conversion
-- between kWh and liters: combustion and electric energy remain separate unit domains.

create table public.vehicle_charging_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.customer_vehicles(id) on delete cascade,
  recorded_at timestamptz not null,
  odometer_value integer not null,
  kwh numeric(10,3) not null,
  total_amount numeric(12,2) not null,
  battery_percent integer,
  charging_type text,
  consumption_km_kwh numeric(8,3),
  note text,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vehicle_charging_logs_odometer_check check (
    odometer_value between 0 and 2000000
  ),
  constraint vehicle_charging_logs_kwh_check check (
    kwh > 0 and kwh <=  10000
  ),
  constraint vehicle_charging_logs_total_amount_check check (
    total_amount >=  0
  ),
  constraint vehicle_charging_logs_battery_percent_check check (
    battery_percent is null or battery_percent between  0 and  100
  ),
  constraint vehicle_charging_logs_charging_type_check check (
    charging_type is null or charging_type in ('recarga_domestica', 'recarga_publica', 'recarga_rapida', 'outro')
  ),
  constraint vehicle_charging_logs_recorded_at_check check (
    recorded_at <= now()
  ),
  constraint vehicle_charging_logs_note_length_check check (
    note is null or(char_length(note) <=  200 and note !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})')
  ),
  constraint vehicle_charging_logs_idempotency_key_check check (
    btrim(idempotency_key) <> ''  and char_length(idempotency_key) <=  200
  ),
  constraint vehicle_charging_logs_idempotency_key_uidx unique (idempotency_key)
);

comment on table public.vehicle_charging_logs is
  'EV charging records per vehicle. Logs are append-only; odometer values never regress across fuel, charging or mileage history.';
comment on column public.vehicle_charging_logs.consumption_km_kwh is
  'Km per kWh between consecutive charging logs, only when the odometer interval is valid.';
comment on column public.vehicle_charging_logs.note is
  'Optional free-text note, no PII or credential content.';

create index vehicle_charging_logs_vehicle_recorded_idx
  on public.vehicle_charging_logs (vehicle_id, recorded_at desc, created_at desc);
create index vehicle_charging_logs_created_by_idx
  on public.vehicle_charging_logs (created_by, recorded_at desc);

alter table public.vehicle_charging_logs enable row level security;

revoke all on table public.vehicle_charging_logs from public, anon, authenticated, service_role;
grant select on table public.vehicle_charging_logs to authenticated;

drop policy if exists "Customers read own vehicle charging logs"
  on public.vehicle_charging_logs;

create policy "Customers read own vehicle charging logs"
  on public.vehicle_charging_logs
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_charging_logs.vehicle_id
        and vehicle.owner_id = (select auth.uid())
        and vehicle.active
    )
  );

drop policy if exists "Admins read vehicle charging logs"
  on public.vehicle_charging_logs;

create policy "Admins read vehicle charging logs"
  on public.vehicle_charging_logs
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

-- Append-only: charging history must never be mutated or destroyed, not even by
-- privileged roles (grants already exclude authenticated; trigger guards the rest).
create trigger vehicle_charging_logs_immutable
  before update or delete on public.vehicle_charging_logs
  for each row execute function private.reject_vehicle_mileage_log_mutation();

create or replace function public.register_vehicle_charging(
  p_vehicle_id uuid,
  p_recorded_at timestamptz,
  p_odometer_value integer,
  p_kwh numeric,
   p_total_amount numeric,
   p_battery_percent integer default null,
  p_charging_type text default null,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_id uuid := auth.uid();
  vehicle_row public.customer_vehicles%rowtype;
  existing_log public.vehicle_charging_logs%rowtype;
  previous_log public.vehicle_charging_logs%rowtype;
  latest_odometer integer;
  inserted_log public.vehicle_charging_logs%rowtype;
  effective_key text;
  computed_consumption numeric(8,3);
begin
  if actor_id is null or(select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
   end if;

  if p_vehicle_id is null or p_recorded_at is null or p_odometer_value is null
    or p_kwh is null or p_total_amount is null then
    raise exception using errcode = '22023', message = 'Invalid charging input.';
   end if;

  if p_odometer_value not between  0 and  2000000 then
    raise exception using errcode = '22023', message = 'Invalid charging odometer value.';
   end if;

  if p_kwh <=  0 or p_kwh >  10000 then
    raise exception using errcode = '22023', message = 'Invalid charging kwh.';
   end if;

 if p_total_amount <  0 then
    raise exception using errcode = '22023', message = 'Invalid charging total amount.';
   end if;

 if p_battery_percent is not null and (p_battery_percent <  0 or p_battery_percent >  100) then
    raise exception using errcode = '22023', message = 'Invalid charging battery percent.';
   end if;

 if p_charging_type is not null
    and p_charging_type notin ('recarga_domestica', 'recarga_publica', 'recarga_rapida', 'outro') then
    raise exception using errcode = '22023', message = 'Invalid charging type.';
   end if;

 if p_recorded_at > pg_catalog.now() then
    raise exception using errcode = '22023', message = 'Charging date cannot be in the future.';
  end if;

 if nullif(pg_catalog.btrim(p_note, ''), '') is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(p_note, '')) >  200
       or pg_catalog.btrim(p_note, '') ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})'
    ) then
    raise exception using errcode = '22023', message = 'Invalid charging note.';
   end if;

 select * into vehicle_row
  from public.customer_vehicles
  where id = p_vehicle_id;

 if vehicle_row.idis null
    or vehicle_row.owner_id <> actor_id
    or vehicle_row.active is not true then
    raise exception using errcode = '42501', message = 'Vehicle authorization required.';
   end if;

 effective_key := coalesce(
    nullif(pg_catalog.btrim(p_idempotency_key, ''), ''),
    'vehicle-charging:' || p_vehicle_id::text || ':' || p_recorded_at::text || ':' || p_odometer_value::text || ':' || p_kwh::text || ':' || coalesce(p_charging_type, 'null')
  );
 if pg_catalog.length(effective_key) >  200 then
    raise exception using errcode = '22023', message = 'Invalid charging idempotency key.';
   end if;

 perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-charging:' || p_vehicle_id::text, 0)
  );

 select * into existing_log
  from public.vehicle_charging_logs
  where idempotency_key = effective_key;

 if existing_log.id is not null then
    if existing_log.vehicle_id <> p_vehicle_id
      or existing_log.odometer_value <> p_odometer_value
      or existing_log.recorded_at <> p_recorded_at
      or existing_log.kwh <> p_kwh
      or existing_log.total_amount <> p_total_amount
      or existing_log.battery_percent is distinct from p_battery_percent
      or existing_log.charging_type is distinct from p_charging_type then
      raise exception using errcode = '23505', message = 'Charging idempotency key collision.';
    end if;
    return pg_catalog.jsonb_build_object('log_id', existing_log.id, 'registered', false,
      'consumption_km_kwh', existing_log.consumption_km_kwh);
   end if;

 select greatest(
    coalesce((select max(log.odometer_value) from public.vehicle_charging_logs log where log.vehicle_id = p_vehicle_id),
    -1),
    coalesce((select max(log.odometer_value) from public.vehicle_fuel_logs log where log.vehicle_id = p_vehicle_id,
    -1),
    coalesce((select max(log.mileage_value) from public.vehicle_mileage_logs log where log.vehicle_id = p_vehicle_id,
    -1),
    coalesce(vehicle_row.current_mileage, -1)
  ) into latest_odometer;

 if p_odometer_value < latest_odometer then
    raise exception using errcode = '23514', message = 'Charging odometer cannot regress below the latest logged reading.';
   end if;

-- Deterministic consumption interval: previous charging record strictly earlier by record.
 select * into previous_log
from public.vehicle_charging_logs
where vehicle_id = p_vehicle_id
  and recorded_at < p_recorded_at
order by recorded_at desc, created_at desc, id desc
limit 1;

 if previous_log.id is not null and p_odometer_value > previous_log.odometer_value then
    computed_consumption := pg_catalog.round(
      (p_odometer_value - previous_log.odometer_value)::numeric / p_kwh,
      3
    );
  else
    computed_consumption := null;
  end if;

 insert into public.vehicle_charging_logs(
    vehicle_id, recorded_at, odometer_value, kwh, total_amount, battery_percent,
     charging_type, consumption_km_kwh, note, created_by, idempotency_key
  ) values (
    p_vehicle_id, p_recorded_at, p_odometer_value, p_kwh, p_total_amount,
    p_battery_percent, p_charging_type, computed_consumption,
    nullif(pg_catalog.btrim(p_note, ''), ''),
    actor_id, effective_key
  ) returning * into inserted_log;

 return pg_catalog.jsonb_build_object('log_id', inserted_log.id, 'registered', true,
    'consumption_km_kwh', inserted_log.consumption_km_kwh,
    'previous_odometer', previous_log.odometer_value);
 end;
$$;

revoke execute on function public.register_vehicle_charging(
  uuid, timestamptz, integer, numeric, numeric, integer, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_vehicle_charging(
  uuid, timestamptz, integer, numeric, numeric, integer, text, text, text
) to authenticated;
