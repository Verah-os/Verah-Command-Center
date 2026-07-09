create table if not exists public.work_orders (
  id text primary key,
  title text not null,
  description text not null default '',
  status text not null check (status in ('Backlog', 'In Progress', 'Review', 'Done', 'Blocked')),
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  owner text not null,
  origin text not null check (origin in ('Manual', 'GitHub', 'Dispatcher', 'AI')),
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_orders_status_idx on public.work_orders (status);
create index if not exists work_orders_created_at_idx on public.work_orders (created_at desc);

alter table public.work_orders enable row level security;

drop policy if exists "Authenticated users can read work orders" on public.work_orders;
create policy "Authenticated users can read work orders"
  on public.work_orders
  for select
  to authenticated
  using (true);

grant select on public.work_orders to authenticated;
