create table if not exists public.dispatcher_jobs (
  id uuid primary key default gen_random_uuid(),
  work_order_id text not null references public.work_orders (id) on delete cascade,
  target_agent text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists dispatcher_jobs_status_idx on public.dispatcher_jobs (status);
create index if not exists dispatcher_jobs_work_order_id_idx on public.dispatcher_jobs (work_order_id);

alter table public.dispatcher_jobs enable row level security;

drop policy if exists "Authenticated users can read dispatcher jobs" on public.dispatcher_jobs;
create policy "Authenticated users can read dispatcher jobs"
  on public.dispatcher_jobs
  for select
  to authenticated
  using (true);

grant select on public.dispatcher_jobs to authenticated;
