-- Canonical per-vehicle mileage log. customer_vehicles remains the only canonical
-- vehicle record; this table appends odometer readings owned by the customer.

create table public.vehicle_mileage_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.customer_vehicles(id) on delete cascade,
  recorded_at timestamptz not null,
  mileage_value integer not null,
  note text,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vehicle_mileage_logs_mileage_check check (
    mileage_value between 0 and 2000000
  ),
  constraint vehicle_mileage_logs_recorded_at_check check (
    recorded_at <= now()
  ),
  constraint vehicle_mileage_logs_note_length_check check (
    note is null or(char_length(note) <= 200 and note !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})')
  ),
  constraint vehicle_mileage_logs_idempotency_key_check check (
    btrim(idempotency_key) <> '' and char_length(idempotency_key) <= 200
  ),
  constraint vehicle_mileage_logs_idempotency_key_uidx unique (idempotency_key)
);

comment on table public.vehicle_mileage_logs is
  'Odometer readings per vehicle. Readings are append-only; odometer values never regress.';
comment on column public.vehicle_mileage_logs.note is
  'Optional free-text note, no PII or credential content.';

create index vehicle_mileage_logs_vehicle_recorded_idx
  on public.vehicle_mileage_logs (vehicle_id, recorded_at desc, created_at desc);
create index vehicle_mileage_logs_created_by_idx
  on public.vehicle_mileage_logs (created_by, recorded_at desc);

alter table public.vehicle_mileage_logs enable row level security;

revoke all on table public.vehicle_mileage_logs from public, anon, authenticated, service_role;
grant select on table public.vehicle_mileage_logs to authenticated;

drop policy if exists "Customers read own vehicle mileage logs"
  on public.vehicle_mileage_logs;

create policy "Customers read own vehicle mileage logs"
  on public.vehicle_mileage_logs
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_mileage_logs.vehicle_id
        and vehicle.owner_id = (select auth.uid())
        and vehicle.active
    )
  );

drop policy if exists "Admins read vehicle mileage logs"
  on public.vehicle_mileage_logs;

create policy "Admins read vehicle mileage logs"
  on public.vehicle_mileage_logs
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

-- Append-only: odometer history must never be mutated or destroyed, not even by
-- privileged roles (grants already exclude authenticated; trigger guards the rest).
create or replace function private.reject_vehicle_mileage_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Vehicle mileage logs are append-only.';
end;
$$;

revoke execute on function private.reject_vehicle_mileage_log_mutation()
  from public, anon, authenticated, service_role;

create trigger vehicle_mileage_logs_immutable
before update or delete on public.vehicle_mileage_logs
for each row execute function private.reject_vehicle_mileage_log_mutation();

create or replace function public.register_vehicle_mileage(
  p_vehicle_id uuid,
  p_mileage integer,
  p_recorded_at timestamptz,
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
  existing_log public.vehicle_mileage_logs%rowtype;
  inserted_log public.vehicle_mileage_logs%rowtype;
  effective_key text;
  latest_log_mileage integer;
  reference_mileage integer;
begin
  if actor_id is null or(select public.current_verah_role()) <> 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required';
  end if;

  if p_vehicle_id is null or p_mileage is null or p_recorded_at is null then
    raise exception using errcode = '22023', message = 'Invalid mileage input.';
  end if;

  if p_mileage not between 0 and 2000000 then
    raise exception using errcode = '22023', message = 'Invalid mileage value.';
  end if;

  if p_recorded_at > pg_catalog.now() then
    raise exception using errcode = '22023', message = 'Mileage date cannot be in the future.';
  end if;

  if nullif(pg_catalog.btrim(p_note, ''), '') is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(p_note, '')) > 200
      or pg_catalog.btrim(p_note, '') ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,}})'
    ) then
    raise exception using errcode = '22023', message = 'Invalid mileage note.';
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
    'vehicle-mileage:' || p_vehicle_id::text || ':' || p_recorded_at::text || ':' || p_mileage::text
  );
  if pg_catalog.length(effective_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid mileage idempotency key.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-mileage:' || p_vehicle_id::text, 0)
  );

  select * into existing_log
  from public.vehicle_mileage_logs
  where idempotency_key = effective_key;

  if existing_log.id is not null then
    if existing_log.vehicle_id <> p_vehicle_id
      or existing_log.mileage_value <> p_mileage
      or existing_log.recorded_at <> p_recorded_at then
      raise exception using errcode = '23505', message = 'Mileage idempotency key collision.';
    end if;
    return pg_catalog.jsonb_build_object('log_id', existing_log.id, 'registered', false);
  end if;

  select coalesce(
    (select max(log.mileage_value) from public.vehicle_mileage_logs log where log.vehicle_id = p_vehicle_id),
    -1
  ) into latest_log_mileage;
  reference_mileage := greatest(latest_log_mileage, coalesce(vehicle_row.current_mileage, -1));

  if p_mileage < reference_mileage then
    raise exception using errcode = '23514', message = 'Mileage cannot regress below the latest logged reading.';
  end if;

  insert into public.vehicle_mileage_logs(
    vehicle_id, recorded_at, mileage_value, note, created_by, idempotency_key
  ) values (
    p_vehicle_id, p_recorded_at, p_mileage,
    nullif(pg_catalog.btrim(p_note, ''), ''),
    actor_id, effective_key
  ) returning * into inserted_log;

  if p_mileage > coalesce(vehicle_row.current_mileage, -1) then
    update public.customer_vehicles
    set current_mileage = p_mileage, updated_at = pg_catalog.now()
    where id = vehicle_row.id;
  end if;

  return pg_catalog.jsonb_build_object('log_id', inserted_log.id, 'registered', true);
end;
$$;

revoke execute on function public.register_vehicle_mileage(
  uuid, integer, timestamptz, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_vehicle_mileage(
  uuid, integer, timestamptz, text, text
) to authenticated;