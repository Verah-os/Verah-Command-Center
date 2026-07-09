alter table public.work_orders enable row level security;

drop policy if exists "Authenticated users can create work orders" on public.work_orders;
create policy "Authenticated users can create work orders"
  on public.work_orders
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and status = 'Backlog'
    and priority in ('Low', 'Medium', 'High', 'Critical')
    and origin in ('Manual', 'GitHub', 'Dispatcher', 'AI')
    and title is not null
    and description is not null
  );

grant insert on public.work_orders to authenticated;
