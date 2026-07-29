-- Issue #43: administrative authorization in depth.
-- This migration is additive, preserves data, and keeps RLS enabled.

alter table public.work_orders enable row level security;
alter table public.dispatcher_jobs enable row level security;
alter table public.ai_agents enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "Authenticated users can read work orders" on public.work_orders;
drop policy if exists "Authenticated users can create work orders" on public.work_orders;
drop policy if exists "Admins can read work orders" on public.work_orders;
drop policy if exists "Admins can create work orders" on public.work_orders;

create policy "Admins can read work orders"
  on public.work_orders
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

create policy "Admins can create work orders"
  on public.work_orders
  for insert
  to authenticated
  with check (
    (select public.current_verah_role()) = 'admin'
    and status = 'Backlog'
    and priority in ('Low', 'Medium', 'High', 'Critical')
    and origin in ('Manual', 'GitHub', 'Dispatcher', 'AI')
    and title is not null
    and description is not null
  );

drop policy if exists "Authenticated users can read dispatcher jobs" on public.dispatcher_jobs;
drop policy if exists "Admins can read dispatcher jobs" on public.dispatcher_jobs;
create policy "Admins can read dispatcher jobs"
  on public.dispatcher_jobs
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

drop policy if exists "Authenticated users can read ai agents" on public.ai_agents;
drop policy if exists "Admins can read ai agents" on public.ai_agents;
create policy "Admins can read ai agents"
  on public.ai_agents
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

drop policy if exists "Authenticated users can read system settings" on public.system_settings;
drop policy if exists "Authenticated users can update editable system settings" on public.system_settings;
drop policy if exists "Admins can read system settings" on public.system_settings;
drop policy if exists "Admins can update editable system settings" on public.system_settings;

create policy "Admins can read system settings"
  on public.system_settings
  for select
  to authenticated
  using ((select public.current_verah_role()) = 'admin');

create policy "Admins can update editable system settings"
  on public.system_settings
  for update
  to authenticated
  using (
    (select public.current_verah_role()) = 'admin'
    and is_editable = true
  )
  with check (
    (select public.current_verah_role()) = 'admin'
    and is_editable = true
  );

revoke all on table public.work_orders from anon, authenticated;
grant select, insert on table public.work_orders to authenticated;

revoke all on table public.dispatcher_jobs from anon, authenticated;
grant select on table public.dispatcher_jobs to authenticated;

revoke all on table public.ai_agents from anon, authenticated;
grant select on table public.ai_agents to authenticated;

revoke all on table public.system_settings from anon, authenticated;
grant select on table public.system_settings to authenticated;
grant update (value) on table public.system_settings to authenticated;

create or replace function public.dispatcher_engine_start_next_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
  selected_agent public.ai_agents%rowtype;
  selected_work_order public.work_orders%rowtype;
  rule_name text := 'fallback';
  rule_reason text := 'Nenhuma regra especifica casou; agente disponivel com menor carga selecionado.';
  preferred_agents text[] := array[]::text[];
  work_order_text text := '';
  selected_load integer := 0;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
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

  select * into selected_work_order
  from public.work_orders
  where id = selected_job.work_order_id;

  work_order_text := lower(concat_ws(
    ' ',
    selected_work_order.category,
    selected_work_order.title,
    selected_work_order.description
  ));

  if work_order_text ~ '(engineering|code|frontend|backend|bug|(^|[^a-z0-9])pr([^a-z0-9]|$))' then
    rule_name := 'engineering';
    rule_reason := 'Categoria, titulo ou descricao indica engenharia, codigo, frontend, backend, bug ou PR.';
    preferred_agents := array['codex', 'ethan'];
  elsif work_order_text ~ '(documentation|docs|architecture|atlas|knowledge)' then
    rule_name := 'documentation';
    rule_reason := 'Categoria, titulo ou descricao indica documentacao, arquitetura, Atlas ou conhecimento.';
    preferred_agents := array['atlas'];
  elsif work_order_text ~ '(strategy|business|roadmap|product)' then
    rule_name := 'strategy';
    rule_reason := 'Categoria, titulo ou descricao indica estrategia, negocio, roadmap ou produto.';
    preferred_agents := array['gabhriel'];
  elsif work_order_text ~ '(automation|n8n|workflow|dispatcher)' then
    rule_name := 'automation';
    rule_reason := 'Categoria, titulo ou descricao indica automacao, n8n, workflow ou Dispatcher.';
    preferred_agents := array['dispatcher'];
  elsif work_order_text ~ '(research|benchmark|market|analysis)' then
    rule_name := 'research';
    rule_reason := 'Categoria, titulo ou descricao indica pesquisa, benchmark, mercado ou analise.';
    preferred_agents := array['gemini'];
  end if;

  if array_length(preferred_agents, 1) is not null then
    select agent.* into selected_agent
    from public.ai_agents agent
    where agent.status in ('online', 'idle')
      and agent.id = any(preferred_agents)
    order by
      case when agent.status = 'idle' then 0 else 1 end,
      (
        select count(*)
        from public.dispatcher_jobs running_job
        where running_job.status = 'running'
          and running_job.assigned_agent = agent.id
      ) asc,
      case agent.id
        when 'codex' then 0
        when 'ethan' then 1
        else 2
      end,
      agent.last_seen_at asc nulls first,
      agent.name asc
    for update of agent skip locked
    limit 1;
  end if;

  if selected_agent.id is null then
    select agent.* into selected_agent
    from public.ai_agents agent
    where agent.status in ('online', 'idle')
    order by
      (
        select count(*)
        from public.dispatcher_jobs running_job
        where running_job.status = 'running'
          and running_job.assigned_agent = agent.id
      ) asc,
      case when agent.status = 'idle' then 0 else 1 end,
      agent.last_seen_at asc nulls first,
      agent.name asc
    for update of agent skip locked
    limit 1;

    if selected_agent.id is not null and rule_name <> 'fallback' then
      rule_reason := rule_reason || ' Agente preferencial indisponivel; fallback por menor carga usado.';
    end if;
  end if;

  if selected_agent.id is null then
    update public.dispatcher_jobs
    set logs = coalesce(logs, '[]'::jsonb)
      || public.dispatcher_engine_log_entry('Nenhum agente disponivel')
    where id = selected_job.id;

    return jsonb_build_object('status', 'no_agent', 'jobId', selected_job.id);
  end if;

  select count(*)::integer into selected_load
  from public.dispatcher_jobs running_job
  where running_job.status = 'running'
    and running_job.assigned_agent = selected_agent.id;

  if selected_agent.capabilities is not null then
    rule_reason := rule_reason || ' Capabilities consideradas: '
      || selected_agent.capabilities::text || '.';
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
        || public.dispatcher_engine_log_entry('Regra usada: ' || rule_name)
        || public.dispatcher_engine_log_entry('Agente selecionado: ' || selected_agent.name)
        || public.dispatcher_engine_log_entry(
          'Motivo da escolha: ' || rule_reason
          || ' Carga atual: ' || selected_load::text || '.'
        )
        || public.dispatcher_engine_log_entry('Execucao iniciada')
  where id = selected_job.id
  returning * into selected_job;

  return jsonb_build_object(
    'status', 'running',
    'jobId', selected_job.id,
    'agentId', selected_agent.id,
    'agentName', selected_agent.name,
    'rule', rule_name,
    'reason', rule_reason
  );
end;
$$;

revoke all on function public.dispatcher_engine_start_next_job()
  from public, anon, authenticated;
grant execute on function public.dispatcher_engine_start_next_job()
  to authenticated, service_role;

create or replace function public.dispatcher_engine_finish_job(
  job_id uuid,
  agent_id text,
  succeeded boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
  log_message text;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
  end if;

  next_status := case when succeeded then 'completed' else 'failed' end;
  log_message := case
    when succeeded then 'Execucao concluida'
    else 'Execucao falhou'
  end;

  update public.dispatcher_jobs
  set status = next_status,
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry(log_message)
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

revoke all on function public.dispatcher_engine_finish_job(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.dispatcher_engine_finish_job(uuid, text, boolean)
  to authenticated, service_role;

create or replace function public.dispatcher_engine_retry_failed_job(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
  end if;

  update public.dispatcher_jobs
  set status = 'queued',
      assigned_agent = null,
      started_at = null,
      finished_at = null,
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry('Retry solicitado manualmente')
  where id = job_id
    and status = 'failed';

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object('status', 'queued', 'jobId', job_id);
end;
$$;

revoke all on function public.dispatcher_engine_retry_failed_job(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatcher_engine_retry_failed_job(uuid)
  to authenticated, service_role;

create or replace function public.dispatcher_engine_mark_job_completed(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
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
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry(
          'Job marcado como concluido manualmente'
        )
  where id = selected_job.id;

  if selected_job.assigned_agent is not null then
    update public.ai_agents
    set status = 'idle',
        last_seen_at = now()
    where id = selected_job.assigned_agent;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'jobId', selected_job.id
  );
end;
$$;

revoke all on function public.dispatcher_engine_mark_job_completed(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatcher_engine_mark_job_completed(uuid)
  to authenticated, service_role;

create or replace function public.dispatcher_engine_mark_job_failed(job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.dispatcher_jobs%rowtype;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
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
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry(
          'Job marcado como falho manualmente'
        )
  where id = selected_job.id;

  if selected_job.assigned_agent is not null then
    update public.ai_agents
    set status = 'idle',
        last_seen_at = now()
    where id = selected_job.assigned_agent;
  end if;

  return jsonb_build_object(
    'status', 'failed',
    'jobId', selected_job.id
  );
end;
$$;

revoke all on function public.dispatcher_engine_mark_job_failed(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatcher_engine_mark_job_failed(uuid)
  to authenticated, service_role;

create or replace function public.dispatcher_complete_ai_runtime_job(
  job_id uuid,
  execution_id text,
  succeeded boolean,
  duration_ms integer,
  result_message text default null,
  error_code text default null,
  error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text := case when succeeded then 'completed' else 'failed' end;
  log_message text;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role'
    and (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Administrative authorization required';
  end if;

  if execution_id is null or btrim(execution_id) = '' then
    raise exception 'Execution ID is required';
  end if;

  if succeeded then
    log_message := format(
      'AI Runtime executionId=%s status=success message=%s durationMs=%s',
      execution_id,
      coalesce(nullif(result_message, ''), '-'),
      greatest(duration_ms, 0)
    );
  else
    log_message := format(
      'AI Runtime executionId=%s status=error code=%s message=%s durationMs=%s',
      execution_id,
      coalesce(nullif(error_code, ''), 'ADAPTER_FAILURE'),
      coalesce(nullif(error_message, ''), '-'),
      greatest(duration_ms, 0)
    );
  end if;

  update public.dispatcher_jobs
  set status = next_status,
      assigned_agent = 'mock_agent',
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb)
        || public.dispatcher_engine_log_entry(log_message)
  where id = job_id
    and status in ('queued', 'failed');

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', next_status,
    'jobId', job_id,
    'executionId', execution_id
  );
end;
$$;

revoke all on function public.dispatcher_complete_ai_runtime_job(
  uuid,
  text,
  boolean,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.dispatcher_complete_ai_runtime_job(
  uuid,
  text,
  boolean,
  integer,
  text,
  text,
  text
) to authenticated, service_role;
