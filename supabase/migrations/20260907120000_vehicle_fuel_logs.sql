-- Canonical per-vehicle fuel log. Mirrors vehicle_mileage_logs (#213) semantics:
-- odometer readings never regress; logs are append-only. Consumption (km/L) is
-- derived deterministically only when a valid odometer interval exists between the
-- previous fuel log and this one.

create table public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.customer_vehicles(id) on delete cascade,
  recorded_at timestamptz not null,
  odometer_value integer not null,
  liters numeric(10,3) not null,
  total_amount numeric(12,2) not null,
  fuel_type text not null,
  consumption_kmpl numeric(8,2),
  note text,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vehicle_fuel_logs_odometer_check check (
    odometer_value between 0 and 2000000
  ),
  constraint vehicle_fuel_logs_liters_check check (
    liters > 0 and liters <= 10000
  ),
  constraint vehicle_fuel_logs_total_amount_check check (
    total_amount >= 0
  ),
  constraint vehicle_fuel_logs_fuel_type_check check (
    fuel_type in ('gasolina', 'etanol', 'diesel', 'gnv')
  ),
  constraint vehicle_fuel_logs_recorded_at_check check (
    recorded_at <= now()
  ),
  constraint vehicle_fuel_logs_note_length_check check (
    note is null or(char_length(note) <= 200and note !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})')
  ),
  constraint vehicle_fuel_logs_idempotency_key_check check (
    btrim(idempotency_key) <> '' and char_length(idempotency_key) <= 200
  ),
  constraint vehicle_fuel_logs_idempotency_key_uidx unique (idempotency_key)
);

comment on table public.vehicle_fuel_logs is
  'Fuel receipts per vehicle. Logs are append-only; odometer values never regress.';
comment on column public.vehicle_fuel_logs.consumption_kmpl is
  'Km per liter between consecutive fuel logs, only when the odometer interval is valid.';
comment on column public.vehicle_fuel_logs.note is
  'Optional free-text note, no PII or credential content.';

create index vehicle_fuel_logs_vehicle_recorded_idx
  on public.vehicle_fuel_logs (vehicle_id, recorded_at desc, created_at desc);
create index vehicle_fuel_logs_created_by_idx
  on public.vehicle_fuel_logs (created_by, recorded_at desc);

alter table public.vehicle_fuel_logs enable row level security;

revoke all on table public.vehicle_fuel_logs from public, anon, authenticated, service_role;
grant select on table public.vehicle_fuel_logs to authenticated;

drop policy if exists "Customers read own vehicle fuel logs"
  on public.vehicle_fuel_logs;

create policy "Customers read own vehicle fuel logs"
  on public.vehicle_fuel_logs
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_fuel_logs.vehicle_id
        and vehicle.owner_id = (select auth.uid())
        and vehicle.active
    )
  );

drop policy if exists "Admins read vehicle fuel logs"
  on public.vehicle_fuel_logs;

create policy "Admins read vehicle fuel logs"
  on public.vehicle_fuel_logs
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

-- Append-only: fuel history must never be mutated or destroyed, not even by
-- privileged roles (grants already exclude authenticated; trigger guards the rest).
create or replace function private.reject_vehicle_fuel_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Vehicle fuel logs are append-only.';
end;
$$;

revoke execute on function private.reject_vehicle_fuel_log_mutation()
  from public, anon, authenticated, service_role;

create trigger vehicle_fuel_logs_immutable
before update or delete on public.vehicle_fuel_logs
for each row execute function private.reject_vehicle_fuel_log_mutation();

create or replace function public.register_vehicle_fuel(
  p_vehicle_id uuid,
  p_recorded_at timestamptz,
  p_odometer_value integer,
  p_liters numeric,
  p_total_amount numeric,
  p_fuel_type text,
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
  existing_log public.vehicle_fuel_logs%rowtype;
  previous_log public.vehicle_fuel_logs%rowtype;
  latest_odometer integer;
  inserted_log public.vehicle_fuel_logs%rowtype;
  effective_key text;
  computed_consumption numeric(8,2);
begin
  if actor_id is null or(select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;

  if p_vehicle_id is null or p_recorded_at is null or p_odometer_value is null
    or p_liters is null or p_total_amount is null or p_fuel_type is null then
    raise exception using errcode = '22023', message = 'Invalid fuel input.';
  end if;

  if p_odometer_value not between 0 and 2000000 then
    raise exception using errcode = '22023', message = 'Invalid fuel odometer value.';
  end if;

  if p_liters <= 0 or p_liters > 10000 then
    raise exception using errcode = '22023', message = 'Invalid fuel liters.';
  end if;

  if p_total_amount < 0 then
    raise exception using errcode = '22023', message = 'Invalid fuel total amount.';
  end if;

  if p_fuel_type not in ('gasolina', 'etanol', 'diesel', 'gnv') then
    raise exception using errcode = '22023', message = 'Invalid fuel type.';
  end if;

  if p_recorded_at > pg_catalog.now() then
    raise exception using errcode = '22023', message = 'Fuel date cannot be in the future.';
  end if;

  if nullif(pg_catalog.btrim(p_note, ''), '') is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(p_note, '')) > 200
      or pg_catalog.btrim(p_note, '') ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})'
    ) then
    raise exception using errcode = '22023', message = 'Invalid fuel note.';
  end if;

  select * into vehicle_row
  from public.customer_vehicles
  where id = p_vehicle_id;

  if vehicle_row.id is null
    or vehicle_row.owner_id <> actor_id
    or vehicle_row.active is not true then
    raise exception using errcode = '42501', message = 'Vehicle authorization required.';
  end if;

  effective_key := coalesce(
    nullif(pg_catalog.btrim(p_idempotency_key, ''), ''),
    'vehicle-fuel:' || p_vehicle_id::text || ':' || p_recorded_at::text || ':' || p_odometer_value::text || ':' || p_liters::text || ':' || p_fuel_type::text
  );
  if pg_catalog.length(effective_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid fuel idempotency key.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-fuel:' || p_vehicle_id::text, 0)
  );

  select * into existing_log
  from public.vehicle_fuel_logs
  where idempotency_key = effective_key;

  if existing_log.id is not null then
    if existing_log.vehicle_id <> p_vehicle_id
      or existing_log.odometer_value <> p_odometer_value
      or existing_log.recorded_at <> p_recorded_at
      or existing_log.liters <> p_liters
      or existing_log.total_amount <> p_total_amount
      or existing_log.fuel_type <> p_fuel_type then
      raise exception using errcode = '23505', message = 'Fuel idempotency key collision.';
    end if;
    return pg_catalog.jsonb_build_object('log_id', existing_log.id, 'registered', false,
      'consumption_kmpl', existing_log.consumption_kmpl);
  end if;

  select coalesce(
    (select max(log.odometer_value) from public.vehicle_fuel_logs log where log.vehicle_id = p_vehicle_id),
    -1
  ) into latest_odometer;

  if p_odometer_value < latest_odometer then
    raise exception using errcode = '23514', message = 'Fuel odometer cannot regress below the latest logged reading.';
  end if;

-- Deterministic consumption interval: previous refuel strictly earlier by record
select * into previous_log
from public.vehicle_fuel_logs
where vehicle_id = p_vehicle_id
  and recorded_at < p_recorded_at
order by recorded_at desc, created_at desc, id desc
limit 1;

  if previous_log.id is not null and p_odometer_value > previous_log.odometer_value then
    computed_consumption := pg_catalog.round(
      (p_odometer_value - previous_log.odometer_value)::numeric / p_liters,
      2
    );
  else
    computed_consumption := null;
  end if;

  insert into public.vehicle_fuel_logs(
    vehicle_id, recorded_at, odometer_value, liters, total_amount, fuel_type, consumption_kmpl, note, created_by, idempotency_key
  ) values (
    p_vehicle_id, p_recorded_at, p_odometer_value, p_liters, p_total_amount, p_fuel_type,
    computed_consumption,
    nullif(pg_catalog.btrim(p_note, ''), ''),
    actor_id, effective_key
  ) returning * into inserted_log;

  return pg_catalog.jsonb_build_object('log_id', inserted_log.id, 'registered', true,
    'consumption_kmpl', inserted_log.consumption_kmpl,
    'previous_odometer', previous_log.odometer_value);
end;
$$;

revoke execute on function public.register_vehicle_fuel(
  uuid, timestamptz, integer, numeric, numeric, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_vehicle_fuel(
  uuid, timestamptz, integer, numeric, numeric, text, text, text
) to authenticated;