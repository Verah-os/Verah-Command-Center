create or replace function public.accept_service_request(p_service_request_id uuid)
returns table (
  service_request_id uuid,
  work_order_id text,
  service_stage text,
  concierge_id uuid,
  concierge_accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  selected_request public.service_requests%rowtype;
  generated_work_order_id text;
  work_order_priority text;
begin
  select role
  into actor_role
  from public.user_profiles
  where user_id = current_user_id;

  if current_user_id is null
    or actor_role is null
    or actor_role not in ('concierge', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Apenas Concierge ou Admin pode assumir atendimento.';
  end if;

  select *
  into selected_request
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Atendimento não encontrado.';
  end if;

  if selected_request.service_stage <> 'solicitado'
    or selected_request.concierge_id is not null
    or selected_request.work_order_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Este atendimento já foi assumido.';
  end if;

  generated_work_order_id := 'WO-' || selected_request.reference_code;

  work_order_priority :=
    case selected_request.perceived_urgency
      when 'critica' then 'Critical'
      when 'alta' then 'High'
      when 'media' then 'Medium'
      else 'Low'
    end;

  insert into public.work_orders (
    id,
    title,
    description,
    status,
    priority,
    owner,
    origin,
    category
  )
  values (
    generated_work_order_id,
    selected_request.reference_code
      || ' — '
      || selected_request.vehicle_brand
      || ' '
      || selected_request.vehicle_model,
    concat_ws(
      E'\n\n',
      'Relato da cliente: ' || selected_request.customer_report,
      'Resumo do Service Copilot: '
        || coalesce(selected_request.copilot_summary, 'Não informado.'),
      'Briefing do Concierge: '
        || coalesce(
          selected_request.copilot_concierge_brief,
          'Revisão humana necessária.'
        )
    ),
    'Backlog',
    work_order_priority,
    'Concierge VERAH',
    'Manual',
    coalesce(selected_request.probable_category, 'outro')
  );

  update public.service_requests
  set
    service_stage = 'concierge_aceitou',
    concierge_id = current_user_id,
    concierge_accepted_at = now(),
    work_order_id = generated_work_order_id,
    updated_at = now()
  where id = selected_request.id;

  return query
  select
    sr.id,
    sr.work_order_id,
    sr.service_stage,
    sr.concierge_id,
    sr.concierge_accepted_at
  from public.service_requests sr
  where sr.id = selected_request.id;
end;
$$;

create or replace function public.assign_provider_to_service_request(
  p_service_request_id uuid,
  p_provider_id uuid
)
returns table (
  service_request_id uuid,
  provider_id uuid,
  service_stage text,
  provider_assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  selected_request public.service_requests%rowtype;
  selected_provider public.service_providers%rowtype;
begin
  select role
  into actor_role
  from public.user_profiles
  where user_id = current_user_id;

  if current_user_id is null
    or actor_role is null
    or actor_role not in ('concierge', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Apenas Concierge ou Admin pode indicar prestador.';
  end if;

  select *
  into selected_request
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Atendimento não encontrado.';
  end if;

  if actor_role = 'concierge'
    and selected_request.concierge_id is distinct from current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Atendimento não pertence ao Concierge autenticado.';
  end if;

  if selected_request.service_stage <> 'concierge_aceitou'
    or selected_request.provider_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Este atendimento já possui um prestador indicado.';
  end if;

  select *
  into selected_provider
  from public.service_providers
  where id = p_provider_id
    and status = 'active';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Prestador ativo não encontrado.';
  end if;

  update public.service_requests
  set
    provider_id = selected_provider.id,
    provider_assigned_at = now(),
    provider_assigned_by = current_user_id,
    service_stage = 'prestador_indicado',
    updated_at = now()
  where id = selected_request.id;

  return query
  select
    sr.id,
    sr.provider_id,
    sr.service_stage,
    sr.provider_assigned_at
  from public.service_requests sr
  where sr.id = selected_request.id;
end;
$$;

create or replace function public.concierge_confirm_service_completion(
  p_service_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  actor_role text;
begin
  select role
  into actor_role
  from public.user_profiles
  where user_id = uid;

  if uid is null
    or actor_role is null
    or actor_role not in ('concierge', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Apenas Concierge ou Admin pode confirmar a conclusão.';
  end if;

  update public.service_requests
  set
    concierge_confirmed_at = now(),
    completed_at = now(),
    service_stage = 'concluido',
    updated_at = now()
  where id = p_service_request_id
    and service_stage = 'em_execucao'
    and provider_completed_at is not null
    and concierge_confirmed_at is null
    and (
      actor_role = 'admin'
      or concierge_id = uid
    );

  if not found then
    raise exception
      'Conclusão indisponível, não autorizada ou já confirmada.';
  end if;

  return p_service_request_id;
end;
$$;

revoke all on function public.accept_service_request(uuid)
  from public, anon, authenticated;
revoke all on function public.assign_provider_to_service_request(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.concierge_confirm_service_completion(uuid)
  from public, anon, authenticated;

grant execute on function public.accept_service_request(uuid)
  to authenticated;
grant execute on function public.assign_provider_to_service_request(uuid, uuid)
  to authenticated;
grant execute on function public.concierge_confirm_service_completion(uuid)
  to authenticated;
