-- Issue #213 / M2: canonical per-vehicle mileage logs.
-- The single source of truth for odometer history; customer_vehicles.current_mileage
-- remains a convenience projection and must only be updated through these logs.

create table public.vehicle_mileage_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.customer_vehicles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  odometer_km integer not null,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vehicle_mileage_logs_odometer_check
    check (odometer_km between 0 and 2000000),
  constraint vehicle_mileage_logs_note_check
    check (note is null or (btrim(note) <> '' and length(note) <= 500))
);

comment on table public.vehicle_mileage_logs is
  'Canonical odometer history per vehicle. Append-only; history is never destroyed.';

create index vehicle_mileage_logs_vehicle_recorded_idx
  on public.vehicle_mileage_logs (vehicle_id, recorded_at desc, created_at desc);

-- Non-regressive odometer invariant: a new log must not silently lower the
-- latest observed mileage for a vehicle. See #213 acceptance criteria.
create or replace function public.prevent_vehicle_mileage_regression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_known integer;
begin
  select max(log.odometer_km)
  into latest_known
  from public.vehicle_mileage_logs as log
  where log.vehicle_id = new.vehicle_id;

  if latest_known is not null and new.odometer_km < latest_known then
    raise exception using
      errcode = '23514',
      message = 'Mileage must not be lower than the latest recorded value for this vehicle';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_vehicle_mileage_regression() from public;

create trigger vehicle_mileage_logs_prevent_regression
before insert on public.vehicle_mileage_logs
for each row execute function public.prevent_vehicle_mileage_regression();

-- History can never be edited or removed, even by privileged roles.
create or replace function private.reject_vehicle_mileage_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Vehicle mileage history is append-only';
end;
$$;

revoke execute on function private.reject_vehicle_mileage_mutation() from public;

create trigger vehicle_mileage_logs_immutable
before update or delete on public.vehicle_mileage_logs
for each row execute function private.reject_vehicle_mileage_mutation();

alter table public.vehicle_mileage_logs enable row level security;

revoke all on table public.vehicle_mileage_logs from anon, authenticated, service_role;
grant select, insert on table public.vehicle_mileage_logs to authenticated;

-- Owner-based RLS: customers see only their own vehicles' mileage history. Concierge/
-- admin operations access is deliberately not granted here; #83 production gate staysathome.
drop policy if exists "Customers read own vehicle mileage logs" on public.vehicle_mileage_logs;
drop policy if exists "Customers insert own vehicle mileage logs" on public.vehicle_mileage_logs;

create policy "Customers read own vehicle mileage logs"
  on public.vehicle_mileage_logs
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.customer_vehicles as vehicle
      where vehicle.id = vehicle_mileage_logs.vehicle_id
        and (
          vehicle.owner_id = (select auth.uid())
          or vehicle.customer_id = (select private.current_customer_id())
        )
    )
  );

create policy "Customers insert own vehicle mileage logs"
  on public.vehicle_mileage_logs
  for insert
  to authenticated
  with check (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1
      from public.customer_vehicles as vehicle
      where vehicle.id = vehicle_mileage_logs.vehicle_id
        and (
          vehicle.owner_id = (select auth.uid())
          or vehicle.customer_id = (select private.current_customer_id())
        )
    )
  );