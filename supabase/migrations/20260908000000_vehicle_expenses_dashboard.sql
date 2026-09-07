-- Vehicle expenses + cost-per-km dashboard (M2 #215).
-- Canonical manual expense records per customer/vehicle; no real payment,
-- no bank integration. Cost-per-km is derived only when a valid odometer base
-- exists in the recorded entries; otherwise the value is NULL(never invented.

create table public.vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.customer_vehicles(id) on delete cascade,
  category text not null
    check (category in ('combustivel', 'manutencao', 'outros')),
  description text
    check (description is null or char_length(description) <= 160),
  amount_cents integer not null
    check (amount_cents > 0),
  occurred_on date not null
    check (occurred_on <= (pg_catalog.date_trunc('day', pg_catalog.now()) + interval '1 day')::date),
  odometer_km integer
    check (odometer_km is null or odometer_km between 0 and 2000000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.vehicle_expenses is
  'Canonical manual vehicle expenses. Owner-based RLS; amounts in BRL cents.';
comment on column public.vehicle_expenses.odometer_km is
  'Odometer at the moment of the expense; valid mileage base for cost-per-km derivation.';
comment on column public.vehicle_expenses.amount_cents is
  'Expense total in Brazilian reais cents, without any real payment side effect.';

create index if not exists vehicle_expenses_vehicle_occurred_idx
  on public.vehicle_expenses (vehicle_id, occurred_on, created_at);

create index if not exists vehicle_expenses_owner_idx
  on public.vehicle_expenses(owner_id, occurred_on desc);

alter table public.vehicle_expenses enable row level security;

revoke all on table public.vehicle_expenses from anon, authenticated;
grant select, insert on table public.vehicle_expenses to authenticated;
grant update (category, description, amount_cents, occurred_on, odometer_km, updated_at)
  on table public.vehicle_expenses to authenticated;
grant delete on table public.vehicle_expenses to authenticated;

drop policy if exists "Customers read own vehicle expenses"
  on public.vehicle_expenses; create policy "Customers read own vehicle expenses"
  on public.vehicle_expenses
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Customers insert own vehicle expenses"
  on public.vehicle_expenses; create policy "Customers insert own vehicle expenses"
  on public.vehicle_expenses
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_id
        and vehicle.owner_id = (select auth.uid())
        and vehicle.active
        and vehicle.customer_id = customer_id
    )
  );

drop policy if exists "Customers update own vehicle expenses"
  on public.vehicle_expenses; create policy "Customers update own vehicle expenses"
  on public.vehicle_expenses
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_id
        and vehicle.owner_id = (select auth.uid())
        and vehicle.active
        and vehicle.customer_id = customer_id
    )
  );

drop policy if exists "Customers delete own vehicle expenses"
  on public.vehicle_expenses; create policy "Customers delete own vehicle expenses"
  on public.vehicle_expenses
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Canonical deterministic dashboard summary. Security invoker: RLS still
-- restricts the aggregate to the caller's own rows. Cost-per-km remains NULL
-- whenever there is no valid odometer base in the selected period (distance
-- is null or non-positive), so the client never invents a calculation.



create or replace function public.vehicle_expense_summary(
  p_vehicle_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with filtered as (
  select e.amount_cents, e.category, e.odometer_km
  from public.vehicle_expenses e
  where e.vehicle_id = p_vehicle_id
    and (p_period_start is null or e.occurred_on >= p_period_start)
   and (p_period_end is null or e.occurred_on <= p_period_end)
),
aggregate as (
  select
    count(*)as expense_count,
    coalesce(sum(filtered.amount_cents), 0) as total_cents,
    coalesce(sum(filtered.amount_cents) filter (where filtered.category = 'combustivel'), 0) as fuel_cents,
    coalesce(sum(filtered.amount_cents) filter (where filtered.category = 'manutencao'),  0) as maintenance_cents,
    coalesce(sum(filtered.amount_cents) filter (where filtered.category = 'outros'),  0) as other_cents,
    min(filtered.odometer_km) as first_km,
    max(filtered.odometer_km) as last_km
  from filtered
)
select jsonb_build_object(
  'vehicle_id', p_vehicle_id,
  'period_start', p_period_start,
  'period_end', p_period_end,
  'expense_count', aggregate.expense_count,
  'total_cents', aggregate.total_cents,
  'fuel_cents', aggregate.fuel_cents,
  'maintenance_cents', aggregate.maintenance_cents,
  'other_cents', aggregate.other_cents,
  'distance_km', case
      when aggregate.first_km is null or aggregate.last_km is null then null
      when aggregate.last_km >= aggregate.first_km then aggregate.last_km - aggregate.first_km
      else null
    end,
  'cost_per_km_cents', case
      when aggregate.first_km is null or aggregate.last_km is null then null
      when aggregate.last_km > aggregate.first_km
        then pg_catalog.round(
          (aggregate.total_cents::numeric / (aggregate.last_km - aggregate.first_km)), 2)
        else null
    end
)
from aggregate;
$$;

revoke execute on function public.vehicle_expense_summary(uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.vehicle_expense_summary(uuid, date, date)
  to authenticated;