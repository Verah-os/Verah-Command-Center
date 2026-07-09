alter table public.dispatcher_jobs
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists dispatcher_jobs_created_at_idx on public.dispatcher_jobs (created_at desc);
create index if not exists dispatcher_jobs_updated_at_idx on public.dispatcher_jobs (updated_at desc);

create or replace function public.set_dispatcher_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_dispatcher_job_updated_at on public.dispatcher_jobs;
create trigger set_dispatcher_job_updated_at
  before update on public.dispatcher_jobs
  for each row
  execute function public.set_dispatcher_job_updated_at();

create or replace function public.enqueue_dispatcher_job_for_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dispatcher_jobs (
    work_order_id,
    target_agent,
    status,
    payload
  )
  values (
    new.id,
    coalesce(nullif(new.owner, ''), 'dispatcher'),
    'queued',
    jsonb_build_object(
      'workOrderId', new.id,
      'title', new.title,
      'category', new.category,
      'origin', new.origin
    )
  );

  return new;
end;
$$;

revoke all on function public.enqueue_dispatcher_job_for_work_order() from public;
revoke all on function public.enqueue_dispatcher_job_for_work_order() from anon;
revoke all on function public.enqueue_dispatcher_job_for_work_order() from authenticated;

drop trigger if exists enqueue_dispatcher_job_after_work_order_insert on public.work_orders;
create trigger enqueue_dispatcher_job_after_work_order_insert
  after insert on public.work_orders
  for each row
  execute function public.enqueue_dispatcher_job_for_work_order();
