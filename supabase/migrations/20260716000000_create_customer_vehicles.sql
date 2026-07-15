create table if not exists public.customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  brand text not null,
  model text not null,
  year integer,
  plate text,
  state text,
  city text,
  current_mileage integer,
  last_service_at timestamptz,
  next_service_date date,
  next_service_mileage integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_vehicles_current_mileage_check
    check (current_mileage is null or current_mileage >= 0),
  constraint customer_vehicles_next_service_mileage_check
    check (next_service_mileage is null or next_service_mileage >= 0),
  constraint customer_vehicles_year_check
    check (year is null or year between 1950 and 2100),
  constraint customer_vehicles_nickname_length_check
    check (nickname is null or char_length(nickname) <= 60)
);

comment on table public.customer_vehicles is
  'Vehicles owned by VERAH customers. License plates are PII and must not be logged.';

create index if not exists customer_vehicles_owner_active_idx
  on public.customer_vehicles (owner_id, active, created_at desc);

create unique index if not exists customer_vehicles_owner_plate_uidx
  on public.customer_vehicles (
    owner_id,
    upper(regexp_replace(plate, '[^[:alnum:]]', '', 'g'))
  )
  where plate is not null and trim(plate) <> '';

alter table public.service_requests
  add column if not exists vehicle_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_requests_vehicle_id_fkey'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_vehicle_id_fkey
      foreign key (vehicle_id)
      references public.customer_vehicles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists service_requests_vehicle_id_idx
  on public.service_requests (vehicle_id, created_at desc)
  where vehicle_id is not null;

alter table public.customer_vehicles enable row level security;

revoke all on public.customer_vehicles from anon, authenticated;
grant select, insert on public.customer_vehicles to authenticated;
grant update (nickname, state, city, current_mileage, updated_at)
  on public.customer_vehicles to authenticated;

drop policy if exists "Customers and admins read customer vehicles"
  on public.customer_vehicles;
create policy "Customers and admins read customer vehicles"
  on public.customer_vehicles
  for select
  to authenticated
  using (
    (
      (select public.current_verah_role()) = 'customer'
      and owner_id = (select auth.uid())
    )
    or (select public.current_verah_role()) = 'admin'
  );

drop policy if exists "Customers create own vehicles"
  on public.customer_vehicles;
create policy "Customers create own vehicles"
  on public.customer_vehicles
  for insert
  to authenticated
  with check (
    (select public.current_verah_role()) = 'customer'
    and owner_id = (select auth.uid())
  );

drop policy if exists "Customers update own vehicles"
  on public.customer_vehicles;
create policy "Customers update own vehicles"
  on public.customer_vehicles
  for update
  to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and owner_id = (select auth.uid())
  )
  with check (
    (select public.current_verah_role()) = 'customer'
    and owner_id = (select auth.uid())
  );

drop policy if exists "Customers can create their service requests"
  on public.service_requests;
create policy "Customers can create their service requests"
  on public.service_requests
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and service_stage = 'solicitado'
    and (
      (
        (select public.current_verah_role()) = 'customer'
        and origin = 'customer'
        and (
          vehicle_id is null
          or exists (
            select 1
            from public.customer_vehicles vehicle
            where vehicle.id = vehicle_id
              and vehicle.owner_id = (select auth.uid())
              and vehicle.active
          )
        )
      )
      or (
        (select public.current_verah_role()) in ('concierge', 'admin')
        and origin = 'concierge'
        and vehicle_id is null
      )
    )
  );

grant select (vehicle_id) on public.service_requests to authenticated;
