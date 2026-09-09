-- #216: repository-only. Apply remotely only after the human database gate.
create table public.vehicle_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.customer_vehicles(id),
  owner_id uuid not null references auth.users(id),
  customer_id uuid not null references public.customers(id),
  maintenance_type text not null check (length(btrim(maintenance_type)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 160),
  occurred_on date not null check (isfinite(occurred_on) and occurred_on <= current_date),
  odometer_km integer not null check (odometer_km between 0 and 2000000),
  amount_cents integer check (amount_cents >= 0),
  next_due_on date check (isfinite(next_due_on) and next_due_on >= occurred_on),
  next_due_km integer check (next_due_km between odometer_km and 2000000),
  create_expense boolean not null default false,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check (not create_expense or (amount_cents is not null and amount_cents > 0))
);
create index vehicle_maintenance_records_vehicle_idx
  on public.vehicle_maintenance_records(vehicle_id, occurred_on desc, odometer_km desc);
alter table public.vehicle_maintenance_records enable row level security;
revoke all on public.vehicle_maintenance_records from public, anon, authenticated, service_role;
grant select on public.vehicle_maintenance_records to authenticated;
create policy "Customers read own maintenance" on public.vehicle_maintenance_records
  for select to authenticated using (
    owner_id = (select auth.uid()) and (select public.current_verah_role()) = 'customer'
    and exists (select 1 from public.customer_vehicles v
      where v.id = vehicle_maintenance_records.vehicle_id and v.active
      and v.owner_id = (select auth.uid()) and v.customer_id = vehicle_maintenance_records.customer_id)
  );

alter table public.vehicle_expenses add column maintenance_record_id uuid
  unique references public.vehicle_maintenance_records(id);
-- Manual expenses keep their existing CRUD contract. Clients cannot forge links.
revoke insert on public.vehicle_expenses from authenticated;
grant insert (id, owner_id, customer_id, vehicle_id, category, description,
  amount_cents, occurred_on, odometer_km, created_at, updated_at)
  on public.vehicle_expenses to authenticated;

create function private.protect_maintenance_expense() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.maintenance_record_id is not null then
    raise exception using errcode = '42501', message = 'Maintenance expenses are immutable.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_maintenance_expense() from public, anon, authenticated, service_role;
create trigger protect_maintenance_expense before update or delete on public.vehicle_expenses
  for each row execute function private.protect_maintenance_expense();

-- Same append-only invariant as mileage. No new mileage/fuel history is invented.
create trigger vehicle_maintenance_records_immutable before update or delete
  on public.vehicle_maintenance_records for each row
  execute function private.reject_vehicle_mileage_log_mutation();

create function public.register_vehicle_maintenance(
  p_vehicle_id uuid, p_maintenance_type text, p_description text,
  p_occurred_on date, p_odometer_km integer, p_idempotency_key text,
  p_amount_cents integer default null, p_next_due_on date default null,
  p_next_due_km integer default null, p_create_expense boolean default false
) returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  vehicle public.customer_vehicles%rowtype;
  record public.vehicle_maintenance_records%rowtype;
  expense_id uuid;
begin
  if actor is null or public.current_verah_role() is distinct from 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required.';
  end if;
  select * into vehicle from public.customer_vehicles
    where id = p_vehicle_id and owner_id = actor and active for update;
  if not found then
    raise exception using errcode = '42501', message = 'Vehicle authorization required.';
  end if;
  -- Owner-scoped lock serializes retries even if the same key is used for two vehicles.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || p_idempotency_key, 0));
  select * into record from public.vehicle_maintenance_records
    where owner_id = actor and idempotency_key = p_idempotency_key;
  if found then
    if row(record.vehicle_id, record.maintenance_type, record.description, record.occurred_on,
      record.odometer_km, record.amount_cents, record.next_due_on, record.next_due_km, record.create_expense)
      is distinct from row(p_vehicle_id, lower(btrim(p_maintenance_type)), btrim(p_description), p_occurred_on,
      p_odometer_km, p_amount_cents, p_next_due_on, p_next_due_km, p_create_expense) then
      raise exception using errcode = '23505', message = 'Maintenance idempotency key collision.';
    end if;
  else
    insert into public.vehicle_maintenance_records(vehicle_id, owner_id, customer_id,
      maintenance_type, description, occurred_on, odometer_km, amount_cents,
      next_due_on, next_due_km, create_expense, idempotency_key)
    values (vehicle.id, actor, vehicle.customer_id, lower(btrim(p_maintenance_type)), btrim(p_description),
      p_occurred_on, p_odometer_km, p_amount_cents, p_next_due_on, p_next_due_km, p_create_expense, p_idempotency_key)
    returning * into record;
    if p_create_expense then
      insert into public.vehicle_expenses(owner_id, customer_id, vehicle_id, category,
        description, amount_cents, occurred_on, odometer_km, maintenance_record_id)
      values (actor, vehicle.customer_id, vehicle.id, 'manutencao', record.description,
        record.amount_cents, record.occurred_on, record.odometer_km, record.id);
    end if;
  end if;
  select id into expense_id from public.vehicle_expenses where maintenance_record_id = record.id;
  return jsonb_build_object('record_id', record.id, 'expense_id', expense_id);
end;
$$;
revoke all on function public.register_vehicle_maintenance(uuid,text,text,date,integer,text,integer,date,integer,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.register_vehicle_maintenance(uuid,text,text,date,integer,text,integer,date,integer,boolean)
  to authenticated;
comment on table public.vehicle_maintenance_records is
  'Canonical append-only maintenance. Opt-in cost creates one immutable expense atomically; summaries count vehicle_expenses only.';
