create or replace function public.dispatcher_engine_retry_failed_job(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.dispatcher_jobs
  set status = 'queued',
      assigned_agent = null,
      started_at = null,
      finished_at = null,
      logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry('Retry solicitado manualmente')
  where id = job_id
    and status = 'failed';

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object('status', 'queued', 'jobId', job_id);
end;
$$;

revoke all on function public.dispatcher_engine_retry_failed_job(uuid) from public;
revoke all on function public.dispatcher_engine_retry_failed_job(uuid) from anon;
grant execute on function public.dispatcher_engine_retry_failed_job(uuid) to authenticated;

create or replace function public.dispatcher_engine_mark_job_completed(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into selected_job
  from public.dispatcher_jobs
  where id = job_id
    and status in ('queued', 'running', 'failed')
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.dispatcher_jobs
  set status = 'completed',
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry('Job marcado como concluido manualmente')
  where id = selected_job.id;

  if selected_job.assigned_agent is not null then
    update public.ai_agents
    set status = 'idle',
        last_seen_at = now()
    where id = selected_job.assigned_agent;
  end if;

  return jsonb_build_object('status', 'completed', 'jobId', selected_job.id);
end;
$$;

revoke all on function public.dispatcher_engine_mark_job_completed(uuid) from public;
revoke all on function public.dispatcher_engine_mark_job_completed(uuid) from anon;
grant execute on function public.dispatcher_engine_mark_job_completed(uuid) to authenticated;

create or replace function public.dispatcher_engine_mark_job_failed(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into selected_job
  from public.dispatcher_jobs
  where id = job_id
    and status in ('queued', 'running')
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.dispatcher_jobs
  set status = 'failed',
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry('Job marcado como falho manualmente')
  where id = selected_job.id;

  if selected_job.assigned_agent is not null then
    update public.ai_agents
    set status = 'idle',
        last_seen_at = now()
    where id = selected_job.assigned_agent;
  end if;

  return jsonb_build_object('status', 'failed', 'jobId', selected_job.id);
end;
$$;

revoke all on function public.dispatcher_engine_mark_job_failed(uuid) from public;
revoke all on function public.dispatcher_engine_mark_job_failed(uuid) from anon;
grant execute on function public.dispatcher_engine_mark_job_failed(uuid) to authenticated;
