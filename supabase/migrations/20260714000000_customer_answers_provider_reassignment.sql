alter table public.service_requests
  add column if not exists copilot_answers jsonb not null default '{}'::jsonb,
  add column if not exists customer_answers_submitted_at timestamptz,
  add column if not exists provider_reassigned_at timestamptz,
  add column if not exists provider_reassigned_by uuid references auth.users(id),
  add column if not exists provider_reassignment_reason text;

create or replace function public.submit_service_request_answers(
  p_service_request_id uuid,
  p_answers jsonb
) returns public.service_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_request public.service_requests;
  answer_entry record;
  merged_answers jsonb;
  answers_summary text;
  answers_text text;
  new_risks jsonb := '[]'::jsonb;
  enriched_concierge text;
  enriched_provider text;
begin
  if uid is null then raise exception 'Autenticação obrigatória.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'As respostas devem ser um objeto JSON.'; end if;
  if p_answers = '{}'::jsonb then raise exception 'Envie pelo menos uma resposta.'; end if;

  select * into current_request from public.service_requests
  where id = p_service_request_id and created_by = uid for update;
  if not found then raise exception 'Atendimento não encontrado ou sem acesso.'; end if;
  if current_request.service_stage in ('concluido', 'cancelado') then raise exception 'Este atendimento não aceita novas respostas.'; end if;

  for answer_entry in select key, value from jsonb_each_text(p_answers) loop
    if not (current_request.copilot_questions ? answer_entry.key) then raise exception 'Pergunta desconhecida: %', answer_entry.key; end if;
    if nullif(trim(answer_entry.value), '') is null then raise exception 'A resposta para "%" não pode estar vazia.', answer_entry.key; end if;
  end loop;

  merged_answers := current_request.copilot_answers || p_answers;
  select string_agg(format('%s: %s', question, merged_answers ->> question), E'\n' order by ordinal),
         lower(string_agg(coalesce(merged_answers ->> question, ''), ' ' order by ordinal))
  into answers_summary, answers_text
  from jsonb_array_elements_text(current_request.copilot_questions) with ordinality as q(question, ordinal)
  where merged_answers ? question;

  if answers_text like '%fumaça%' or answers_text like '%fumaca%' then new_risks := new_risks || '["fumaça informada pela cliente"]'::jsonb; end if;
  if answers_text like '%cheiro de combustível%' or answers_text like '%cheiro de combustivel%' then new_risks := new_risks || '["cheiro de combustível informado pela cliente"]'::jsonb; end if;
  if answers_text like '%falha de freio%' or answers_text like '%freio falhou%' then new_risks := new_risks || '["possível falha de freio informada pela cliente"]'::jsonb; end if;
  if answers_text like '%fogo%' or answers_text like '%incêndio%' or answers_text like '%incendio%' then new_risks := new_risks || '["risco de incêndio informado pela cliente"]'::jsonb; end if;
  if answers_text like '%superaquec%' then new_risks := new_risks || '["superaquecimento informado pela cliente"]'::jsonb; end if;
  if answers_text like '%local inseguro%' or answers_text like '%não está seguro%' or answers_text like '%nao esta seguro%' then new_risks := new_risks || '["veículo em local inseguro"]'::jsonb; end if;
  if answers_text like '%pessoas em risco%' or answers_text like '%pessoa em risco%' then new_risks := new_risks || '["pessoas em risco"]'::jsonb; end if;

  enriched_concierge := split_part(coalesce(current_request.copilot_concierge_brief, ''), E'\n\nRespostas da cliente:', 1) || E'\n\nRespostas da cliente:\n' || coalesce(answers_summary, 'Nenhuma resposta.');
  enriched_provider := split_part(coalesce(current_request.copilot_provider_brief, ''), E'\n\nInformações complementares:', 1) || E'\n\nInformações complementares:\n' || coalesce(answers_summary, 'Nenhuma resposta.');

  update public.service_requests set
    copilot_answers = merged_answers,
    customer_answers_submitted_at = now(),
    copilot_concierge_brief = enriched_concierge,
    copilot_provider_brief = enriched_provider,
    copilot_risk_signals = (select coalesce(jsonb_agg(distinct value), '[]'::jsonb) from jsonb_array_elements(coalesce(current_request.copilot_risk_signals, '[]'::jsonb) || new_risks) as risks(value)),
    perceived_urgency = case when jsonb_array_length(new_risks) > 0 then 'critica' else current_request.perceived_urgency end,
    updated_at = now()
  where id = p_service_request_id returning * into current_request;
  return current_request;
end; $$;

create or replace function public.reassign_provider_to_service_request(
  p_service_request_id uuid,
  p_provider_id uuid,
  p_reason text
) returns public.service_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor_role text;
  current_request public.service_requests;
begin
  select role into actor_role from public.user_profiles where user_id = uid;
  if uid is null or actor_role is null or actor_role not in ('concierge', 'admin') then raise exception 'Apenas Concierge ou Admin pode alterar o prestador.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'O motivo da alteração é obrigatório.'; end if;
  if not exists (select 1 from public.service_providers where id = p_provider_id and status = 'active') then raise exception 'O novo prestador não está ativo.'; end if;

  select * into current_request from public.service_requests where id = p_service_request_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if current_request.provider_id = p_provider_id then raise exception 'Selecione um prestador diferente do atual.'; end if;
  if current_request.service_stage not in ('prestador_indicado', 'aguardando_aprovacao') then raise exception 'A alteração não está disponível nesta etapa.'; end if;
  if exists (select 1 from public.service_quotes where service_request_id = p_service_request_id and status in ('submitted', 'approved', 'clarification_requested')) then raise exception 'A alteração fica indisponível após o envio do orçamento.'; end if;

  update public.service_quotes set status = 'cancelled', updated_at = now()
  where service_request_id = p_service_request_id and status = 'draft';

  update public.service_requests set
    provider_id = p_provider_id,
    provider_assigned_at = now(),
    provider_assigned_by = uid,
    provider_reassigned_at = now(),
    provider_reassigned_by = uid,
    provider_reassignment_reason = trim(p_reason),
    service_stage = 'prestador_indicado',
    updated_at = now()
  where id = p_service_request_id returning * into current_request;
  return current_request;
end; $$;

create or replace function public.list_active_service_providers_with_portal()
returns table(id uuid, name text, trade_name text, city text, specialties text[], status text, rating numeric, portal_active boolean)
language plpgsql stable security definer set search_path = '' as $$
declare actor_role text;
begin
  select role into actor_role from public.user_profiles where user_id = auth.uid();
  if actor_role is null or actor_role not in ('concierge', 'admin') then raise exception 'Acesso operacional obrigatório.'; end if;
  return query select sp.id, sp.name, sp.trade_name, sp.city, sp.specialties, sp.status, sp.rating,
    exists(select 1 from public.user_profiles up where up.role = 'provider' and up.provider_id = sp.id) as portal_active
  from public.service_providers sp where sp.status = 'active';
end; $$;

revoke all on function public.submit_service_request_answers(uuid, jsonb), public.reassign_provider_to_service_request(uuid, uuid, text), public.list_active_service_providers_with_portal() from public, anon, authenticated;
grant execute on function public.submit_service_request_answers(uuid, jsonb), public.reassign_provider_to_service_request(uuid, uuid, text), public.list_active_service_providers_with_portal() to authenticated;
