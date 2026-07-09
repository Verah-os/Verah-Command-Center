create or replace function public.dispatcher_engine_start_next_job()
returns jsonb
language plpgsql
security definer
set search_path = public
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

  select * into selected_work_order
  from public.work_orders
  where id = selected_job.work_order_id;

  work_order_text := lower(concat_ws(
    ' ',
    selected_work_order.category,
    selected_work_order.title,
    selected_work_order.description
  ));

  if work_order_text ~ '(engineering|code|frontend|backend|bug|\mpr\M)' then
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
    select agent.*, coalesce(load.running_jobs, 0) into selected_agent, selected_load
    from public.ai_agents agent
    left join lateral (
      select count(*)::integer as running_jobs
      from public.dispatcher_jobs running_job
      where running_job.status = 'running'
        and running_job.assigned_agent = agent.id
    ) load on true
    where agent.status in ('online', 'idle')
      and agent.id = any(preferred_agents)
    order by
      case when agent.status = 'idle' then 0 else 1 end,
      coalesce(load.running_jobs, 0) asc,
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

  if not found then
    select agent.*, coalesce(load.running_jobs, 0) into selected_agent, selected_load
    from public.ai_agents agent
    left join lateral (
      select count(*)::integer as running_jobs
      from public.dispatcher_jobs running_job
      where running_job.status = 'running'
        and running_job.assigned_agent = agent.id
    ) load on true
    where agent.status in ('online', 'idle')
    order by
      coalesce(load.running_jobs, 0) asc,
      case when agent.status = 'idle' then 0 else 1 end,
      agent.last_seen_at asc nulls first,
      agent.name asc
    for update of agent skip locked
    limit 1;

    if found and rule_name <> 'fallback' then
      rule_reason := rule_reason || ' Agente preferencial indisponivel; fallback por menor carga usado.';
    end if;
  end if;

  if not found then
    update public.dispatcher_jobs
    set logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry('Nenhum agente disponivel')
    where id = selected_job.id;

    return jsonb_build_object('status', 'no_agent', 'jobId', selected_job.id);
  end if;

  if selected_agent.capabilities is not null then
    rule_reason := rule_reason || ' Capabilities consideradas: ' || selected_agent.capabilities::text || '.';
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
        || public.dispatcher_engine_log_entry('Motivo da escolha: ' || rule_reason || ' Carga atual: ' || selected_load::text || '.')
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

revoke all on function public.dispatcher_engine_start_next_job() from public;
revoke all on function public.dispatcher_engine_start_next_job() from anon;
grant execute on function public.dispatcher_engine_start_next_job() to authenticated;
