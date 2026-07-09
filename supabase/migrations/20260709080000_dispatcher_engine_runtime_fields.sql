alter table public.dispatcher_jobs
  add column if not exists assigned_agent text,
  add column if not exists logs jsonb not null default '[]'::jsonb;

create index if not exists dispatcher_jobs_assigned_agent_idx on public.dispatcher_jobs (assigned_agent);

create or replace function public.dispatcher_engine_log_entry(message text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'message', message,
    'createdAt', now()
  );
$$;

revoke all on function public.dispatcher_engine_log_entry(text) from public;
revoke all on function public.dispatcher_engine_log_entry(text) from anon;
revoke all on function public.dispatcher_engine_log_entry(text) from authenticated;

create or replace function public.dispatcher_engine_start_next_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
  selected_agent public.ai_agents%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into selected_job
  from public.dispatcher_jobs
  where status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('status', 'empty_queue');
  end if;

  select * into selected_agent
  from public.ai_agents
  where status in ('online', 'idle')
  order by case when status = 'idle' then 0 else 1 end, last_seen_at asc nulls first, name asc
  for update skip locked
  limit 1;

  if not found then
    update public.dispatcher_jobs
    set logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry('Nenhum agente disponivel')
    where id = selected_job.id;

    return jsonb_build_object('status', 'no_agent', 'jobId', selected_job.id);
  end if;

  update public.ai_agents
  set status = 'running',
      last_seen_at = now()
  where id = selected_agent.id;

  update public.dispatcher_jobs
  set status = 'running',
      assigned_agent = selected_agent.id,
      started_at = now(),
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry('Job criado')
        || public.dispatcher_engine_log_entry('Agente selecionado: ' || selected_agent.name)
        || public.dispatcher_engine_log_entry('Execucao iniciada')
  where id = selected_job.id
  returning * into selected_job;

  return jsonb_build_object(
    'status', 'running',
    'jobId', selected_job.id,
    'agentId', selected_agent.id,
    'agentName', selected_agent.name
  );
end;
$$;

revoke all on function public.dispatcher_engine_start_next_job() from public;
revoke all on function public.dispatcher_engine_start_next_job() from anon;
grant execute on function public.dispatcher_engine_start_next_job() to authenticated;

create or replace function public.dispatcher_engine_finish_job(
  job_id uuid,
  agent_id text,
  succeeded boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
  log_message text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  next_status := case when succeeded then 'completed' else 'failed' end;
  log_message := case when succeeded then 'Execucao concluida' else 'Execucao falhou' end;

  update public.dispatcher_jobs
  set status = next_status,
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry(log_message)
  where id = job_id
    and status = 'running'
    and assigned_agent = agent_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.ai_agents
  set status = 'idle',
      last_seen_at = now()
  where id = agent_id;

  return jsonb_build_object(
    'status', next_status,
    'jobId', job_id,
    'agentId', agent_id
  );
end;
$$;

revoke all on function public.dispatcher_engine_finish_job(uuid, text, boolean) from public;
revoke all on function public.dispatcher_engine_finish_job(uuid, text, boolean) from anon;
grant execute on function public.dispatcher_engine_finish_job(uuid, text, boolean) to authenticated;
