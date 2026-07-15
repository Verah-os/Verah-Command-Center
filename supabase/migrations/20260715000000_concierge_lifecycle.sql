alter table public.service_requests
  add column if not exists origin text not null default 'customer',
  add column if not exists is_priority boolean not null default false,
  add column if not exists priority_reason text,
  add column if not exists priority_set_at timestamptz,
  add column if not exists priority_set_by uuid references auth.users(id),
  add column if not exists last_priority_set_at timestamptz,
  add column if not exists last_priority_set_by uuid references auth.users(id),
  add column if not exists last_priority_reason text,
  add column if not exists priority_removed_at timestamptz,
  add column if not exists priority_removed_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_notes text,
  add column if not exists previous_stage text,
  add column if not exists last_cancelled_at timestamptz,
  add column if not exists last_cancelled_by uuid references auth.users(id),
  add column if not exists last_cancellation_reason text,
  add column if not exists last_cancellation_notes text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id),
  add column if not exists reopen_reason text;

alter table public.service_requests
  drop constraint if exists service_requests_origin_check,
  add constraint service_requests_origin_check
    check (origin in ('customer', 'concierge')),
  drop constraint if exists service_requests_cancellation_reason_check,
  add constraint service_requests_cancellation_reason_check
    check (
      cancellation_reason is null or cancellation_reason in (
        'customer_withdrew', 'duplicate', 'no_response',
        'resolved_without_service', 'provider_unavailable',
        'invalid_request', 'operational_failure', 'other'
      )
    ),
  drop constraint if exists service_requests_last_cancellation_reason_check,
  add constraint service_requests_last_cancellation_reason_check
    check (
      last_cancellation_reason is null or last_cancellation_reason in (
        'customer_withdrew', 'duplicate', 'no_response',
        'resolved_without_service', 'provider_unavailable',
        'invalid_request', 'operational_failure', 'other'
      )
    ),
  drop constraint if exists service_requests_previous_stage_check,
  add constraint service_requests_previous_stage_check
    check (
      previous_stage is null or previous_stage in (
        'solicitado', 'concierge_aceitou', 'prestador_indicado',
        'aguardando_aprovacao', 'em_execucao'
      )
    );

grant select (origin, cancelled_at, reopened_at)
  on public.service_requests to authenticated;

create index if not exists service_requests_priority_queue_idx
  on public.service_requests (is_priority desc, created_at)
  where service_stage not in ('concluido', 'cancelado');

create or replace function public.set_service_request_priority(
  p_service_request_id uuid,
  p_is_priority boolean,
  p_reason text default null
) returns public.service_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor_role text;
  current_request public.service_requests;
begin
  select role into actor_role
  from public.user_profiles
  where user_id = uid;

  if uid is null or actor_role is null or actor_role not in ('concierge', 'admin') then
    raise exception 'Apenas Concierge ou Admin pode alterar a prioridade.';
  end if;
  if p_is_priority is null then raise exception 'Informe a prioridade desejada.'; end if;

  select * into current_request
  from public.service_requests
  where id = p_service_request_id
  for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if actor_role <> 'admin' and current_request.service_stage in ('concluido', 'cancelado') then
    raise exception 'A prioridade não pode ser alterada nesta etapa.';
  end if;
  if current_request.is_priority = p_is_priority then
    raise exception 'O atendimento já está com a prioridade solicitada.';
  end if;
  if p_is_priority and nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo da prioridade.';
  end if;

  update public.service_requests set
    is_priority = p_is_priority,
    priority_reason = case when p_is_priority then trim(p_reason) else null end,
    priority_set_at = case when p_is_priority then now() else null end,
    priority_set_by = case when p_is_priority then uid else null end,
    last_priority_set_at = case when p_is_priority then now() else current_request.last_priority_set_at end,
    last_priority_set_by = case when p_is_priority then uid else current_request.last_priority_set_by end,
    last_priority_reason = case when p_is_priority then trim(p_reason) else current_request.last_priority_reason end,
    priority_removed_at = case when p_is_priority then null else now() end,
    priority_removed_by = case when p_is_priority then null else uid end,
    updated_at = now()
  where id = p_service_request_id
  returning * into current_request;

  return current_request;
end; $$;

create or replace function public.cancel_service_request(
  p_service_request_id uuid,
  p_reason text,
  p_notes text default null
) returns public.service_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor_role text;
  current_request public.service_requests;
  valid_reasons constant text[] := array[
    'customer_withdrew', 'duplicate', 'no_response',
    'resolved_without_service', 'provider_unavailable',
    'invalid_request', 'operational_failure', 'other'
  ];
begin
  select role into actor_role
  from public.user_profiles
  where user_id = uid;

  if uid is null or actor_role is null or actor_role not in ('concierge', 'admin') then
    raise exception 'Apenas Concierge ou Admin pode cancelar o atendimento.';
  end if;
  if p_reason is null or not (p_reason = any(valid_reasons)) then
    raise exception 'Selecione um motivo de cancelamento válido.';
  end if;
  if p_reason = 'other' and nullif(trim(p_notes), '') is null then
    raise exception 'Descreva o motivo quando selecionar Outro.';
  end if;

  select * into current_request
  from public.service_requests
  where id = p_service_request_id
  for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if current_request.service_stage = 'concluido' then
    raise exception 'Atendimento concluído não pode ser cancelado.';
  end if;
  if current_request.service_stage = 'cancelado' then
    raise exception 'Este atendimento já está cancelado.';
  end if;
  if exists (
    select 1 from public.service_quotes
    where service_request_id = p_service_request_id
      and status in ('submitted', 'approved', 'clarification_requested')
  ) then
    raise exception 'Não é possível cancelar após o envio ou aprovação do orçamento.';
  end if;

  update public.service_quotes
  set status = 'cancelled', updated_at = now()
  where service_request_id = p_service_request_id
    and status = 'draft';

  update public.service_requests set
    previous_stage = current_request.service_stage,
    service_stage = 'cancelado',
    cancelled_at = now(),
    cancelled_by = uid,
    cancellation_reason = p_reason,
    cancellation_notes = nullif(trim(p_notes), ''),
    last_cancelled_at = now(),
    last_cancelled_by = uid,
    last_cancellation_reason = p_reason,
    last_cancellation_notes = nullif(trim(p_notes), ''),
    updated_at = now()
  where id = p_service_request_id
  returning * into current_request;

  return current_request;
end; $$;

create or replace function public.reopen_service_request(
  p_service_request_id uuid,
  p_reason text
) returns public.service_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor_role text;
  restored_stage text;
  current_request public.service_requests;
begin
  select role into actor_role
  from public.user_profiles
  where user_id = uid;

  if uid is null or actor_role is null or actor_role not in ('concierge', 'admin') then
    raise exception 'Apenas Concierge ou Admin pode reabrir o atendimento.';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  select * into current_request
  from public.service_requests
  where id = p_service_request_id
  for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if current_request.service_stage <> 'cancelado' then
    raise exception 'Somente atendimentos cancelados podem ser reabertos.';
  end if;

  restored_stage := case
    when current_request.previous_stage in (
      'solicitado', 'concierge_aceitou', 'prestador_indicado'
    ) then current_request.previous_stage
    else 'concierge_aceitou'
  end;

  update public.service_requests set
    service_stage = restored_stage,
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null,
    cancellation_notes = null,
    reopened_at = now(),
    reopened_by = uid,
    reopen_reason = trim(p_reason),
    updated_at = now()
  where id = p_service_request_id
  returning * into current_request;

  return current_request;
end; $$;

create or replace function public.get_concierge_service_request_lifecycle()
returns table(
  id uuid,
  origin text,
  is_priority boolean,
  priority_reason text,
  priority_set_at timestamptz,
  priority_set_by uuid,
  last_priority_set_at timestamptz,
  last_priority_set_by uuid,
  last_priority_reason text,
  priority_removed_at timestamptz,
  priority_removed_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  cancellation_notes text,
  previous_stage text,
  last_cancelled_at timestamptz,
  last_cancelled_by uuid,
  last_cancellation_reason text,
  last_cancellation_notes text,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_role text;
begin
  select role into actor_role
  from public.user_profiles
  where user_id = auth.uid();
  if actor_role is null or actor_role not in ('concierge', 'admin') then
    raise exception 'Acesso operacional obrigatório.';
  end if;

  return query
  select
    sr.id, sr.origin, sr.is_priority, sr.priority_reason,
    sr.priority_set_at, sr.priority_set_by,
    sr.last_priority_set_at, sr.last_priority_set_by,
    sr.last_priority_reason,
    sr.priority_removed_at, sr.priority_removed_by,
    sr.cancelled_at, sr.cancelled_by, sr.cancellation_reason,
    sr.cancellation_notes, sr.previous_stage,
    sr.last_cancelled_at, sr.last_cancelled_by,
    sr.last_cancellation_reason, sr.last_cancellation_notes, sr.reopened_at,
    sr.reopened_by, sr.reopen_reason
  from public.service_requests sr;
end; $$;

revoke all on function public.set_service_request_priority(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.cancel_service_request(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reopen_service_request(uuid, text) from public, anon, authenticated;
revoke all on function public.get_concierge_service_request_lifecycle() from public, anon, authenticated;

grant execute on function public.set_service_request_priority(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_service_request(uuid, text, text) to authenticated;
grant execute on function public.reopen_service_request(uuid, text) to authenticated;
grant execute on function public.get_concierge_service_request_lifecycle() to authenticated;
