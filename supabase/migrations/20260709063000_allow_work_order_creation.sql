drop policy if exists "Authenticated users can create work orders" on public.work_orders;
create policy "Authenticated users can create work orders"
  on public.work_orders
  for insert
  to authenticated
  with check (
    status = 'Backlog'
    and origin in ('Manual', 'GitHub', 'Dispatcher', 'AI')
    and priority in ('Low', 'Medium', 'High', 'Critical')
    and length(trim(title)) > 0
    and length(trim(description)) > 0
  );

grant insert on public.work_orders to authenticated;
