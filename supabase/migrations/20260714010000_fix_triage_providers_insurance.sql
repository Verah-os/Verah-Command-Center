alter table public.service_requests
  add column if not exists has_insurance text not null default 'unknown',
  add column if not exists insurer_name text,
  add column if not exists has_roadside_assistance text not null default 'unknown';

alter table public.service_requests
  drop constraint if exists service_requests_has_insurance_check,
  add constraint service_requests_has_insurance_check
    check (has_insurance in ('yes', 'no', 'unknown')),
  drop constraint if exists service_requests_has_roadside_assistance_check,
  add constraint service_requests_has_roadside_assistance_check
    check (has_roadside_assistance in ('yes', 'no', 'unknown')),
  drop constraint if exists service_requests_insurer_name_check,
  add constraint service_requests_insurer_name_check
    check (insurer_name is null or length(trim(insurer_name)) between 1 and 120);

comment on column public.service_requests.has_insurance is
  'Customer-declared insurance status: yes, no, or unknown.';
comment on column public.service_requests.insurer_name is
  'Optional insurer name. Policy numbers and financial data are intentionally not collected.';
comment on column public.service_requests.has_roadside_assistance is
  'Customer-declared 24-hour roadside assistance status: yes, no, or unknown.';

-- Insurance data is intentionally excluded from the table-level API surface.
-- Customer and operational roles read it through the role-checked RPC below.
revoke select on public.service_requests from authenticated;
grant select (
  id, reference_code, customer_name, customer_phone, vehicle_brand,
  vehicle_model, vehicle_year, vehicle_plate, state, city, customer_report,
  perceived_urgency, service_stage, probable_category, copilot_summary,
  copilot_questions, copilot_answers, customer_answers_submitted_at,
  copilot_risk_signals, copilot_recommended_next_step,
  copilot_customer_message, copilot_concierge_brief, copilot_provider_brief,
  copilot_confidence, requires_human_review, created_by, created_at, updated_at,
  concierge_id, concierge_accepted_at, work_order_id, provider_id,
  provider_assigned_at, provider_assigned_by, provider_reassigned_at,
  provider_reassigned_by, provider_reassignment_reason, provider_completed_at,
  concierge_confirmed_at, completed_at, completion_notes, customer_rating,
  customer_feedback, customer_rated_at
) on public.service_requests to authenticated;

drop function if exists public.list_active_service_providers_with_portal();
create function public.list_active_service_providers_with_portal()
returns table(
  id uuid,
  name text,
  trade_name text,
  city text,
  specialties jsonb,
  status text,
  rating numeric,
  portal_active boolean
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
    sp.id,
    sp.name,
    sp.trade_name,
    sp.city,
    sp.specialties,
    sp.status,
    sp.rating,
    exists(
      select 1
      from public.user_profiles up
      where up.role = 'provider'
        and up.provider_id = sp.id
    ) as portal_active
  from public.service_providers sp
  where sp.status = 'active';
end; $$;

create or replace function public.get_service_request_insurance(p_service_request_id uuid)
returns table(has_insurance text, insurer_name text, has_roadside_assistance text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor_role text;
begin
  select role into actor_role
  from public.user_profiles
  where user_id = uid;

  if uid is null or actor_role is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  if actor_role in ('concierge', 'admin') then
    return query
    select sr.has_insurance, sr.insurer_name, sr.has_roadside_assistance
    from public.service_requests sr
    where sr.id = p_service_request_id;
    return;
  end if;

  if actor_role = 'customer' then
    return query
    select sr.has_insurance, sr.insurer_name, sr.has_roadside_assistance
    from public.service_requests sr
    where sr.id = p_service_request_id
      and sr.created_by = uid;
    return;
  end if;

  raise exception 'Dados de seguro indisponíveis para este perfil.';
end; $$;

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
  pending_summary text;
  answers_text text;
  new_risks jsonb := '[]'::jsonb;
  concierge_base text;
  provider_base text;
  enriched_concierge text;
  enriched_provider text;
begin
  if uid is null then raise exception 'Autenticação obrigatória.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'As respostas devem ser um objeto JSON.'; end if;
  if p_answers = '{}'::jsonb then raise exception 'Envie pelo menos uma resposta.'; end if;

  select * into current_request
  from public.service_requests
  where id = p_service_request_id and created_by = uid
  for update;
  if not found then raise exception 'Atendimento não encontrado ou sem acesso.'; end if;
  if current_request.service_stage in ('concluido', 'cancelado') then raise exception 'Este atendimento não aceita novas respostas.'; end if;

  for answer_entry in select key, value from jsonb_each_text(p_answers) loop
    if not (current_request.copilot_questions ? answer_entry.key) then raise exception 'Pergunta desconhecida: %', answer_entry.key; end if;
    if nullif(trim(answer_entry.value), '') is null then raise exception 'A resposta para "%" não pode estar vazia.', answer_entry.key; end if;
  end loop;

  merged_answers := current_request.copilot_answers || p_answers;

  select
    string_agg(format('- %s: %s', question, merged_answers ->> question), E'\n' order by ordinal)
      filter (where nullif(trim(merged_answers ->> question), '') is not null),
    string_agg(format('- %s', question), E'\n' order by ordinal)
      filter (where nullif(trim(merged_answers ->> question), '') is null),
    lower(string_agg(coalesce(merged_answers ->> question, ''), ' ' order by ordinal))
  into answers_summary, pending_summary, answers_text
  from jsonb_array_elements_text(current_request.copilot_questions)
    with ordinality as q(question, ordinal);

  if answers_text like '%fumaça%' or answers_text like '%fumaca%' then new_risks := new_risks || '["fumaça informada pela cliente"]'::jsonb; end if;
  if answers_text like '%cheiro de combustível%' or answers_text like '%cheiro de combustivel%' then new_risks := new_risks || '["cheiro de combustível informado pela cliente"]'::jsonb; end if;
  if answers_text like '%falha de freio%' or answers_text like '%freio falhou%' then new_risks := new_risks || '["possível falha de freio informada pela cliente"]'::jsonb; end if;
  if answers_text like '%fogo%' or answers_text like '%incêndio%' or answers_text like '%incendio%' then new_risks := new_risks || '["risco de incêndio informado pela cliente"]'::jsonb; end if;
  if answers_text like '%superaquec%' then new_risks := new_risks || '["superaquecimento informado pela cliente"]'::jsonb; end if;
  if answers_text like '%local inseguro%' or answers_text like '%não está seguro%' or answers_text like '%nao esta seguro%' then new_risks := new_risks || '["veículo em local inseguro"]'::jsonb; end if;
  if answers_text like '%pessoas em risco%' or answers_text like '%pessoa em risco%' then new_risks := new_risks || '["pessoas em risco"]'::jsonb; end if;

  concierge_base := split_part(coalesce(current_request.copilot_concierge_brief, ''), E'\n\nRespostas da cliente:', 1);
  concierge_base := split_part(concierge_base, E'\n\nInformações complementares da cliente:', 1);
  concierge_base := split_part(concierge_base, E'\n\nInformações ainda necessárias:', 1);
  provider_base := split_part(coalesce(current_request.copilot_provider_brief, ''), E'\n\nInformações complementares:', 1);
  provider_base := split_part(provider_base, E'\n\nInformações complementares da cliente:', 1);
  provider_base := split_part(provider_base, E'\n\nInformações ainda necessárias:', 1);

  enriched_concierge := concierge_base;
  enriched_provider := provider_base;
  if answers_summary is not null then
    enriched_concierge := enriched_concierge || E'\n\nInformações complementares da cliente:\n' || answers_summary;
    enriched_provider := enriched_provider || E'\n\nInformações complementares da cliente:\n' || answers_summary;
  end if;
  if pending_summary is not null then
    enriched_concierge := enriched_concierge || E'\n\nInformações ainda necessárias:\n' || pending_summary;
    enriched_provider := enriched_provider || E'\n\nInformações ainda necessárias:\n' || pending_summary;
  end if;

  update public.service_requests set
    copilot_answers = merged_answers,
    customer_answers_submitted_at = now(),
    copilot_concierge_brief = enriched_concierge,
    copilot_provider_brief = enriched_provider,
    copilot_risk_signals = (
      select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
      from jsonb_array_elements(coalesce(current_request.copilot_risk_signals, '[]'::jsonb) || new_risks) as risks(value)
    ),
    perceived_urgency = case when jsonb_array_length(new_risks) > 0 then 'critica' else current_request.perceived_urgency end,
    updated_at = now()
  where id = p_service_request_id
  returning * into current_request;

  return current_request;
end; $$;

revoke all on function public.list_active_service_providers_with_portal() from public, anon, authenticated;
revoke all on function public.get_service_request_insurance(uuid) from public, anon, authenticated;
revoke all on function public.submit_service_request_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.list_active_service_providers_with_portal() to authenticated;
grant execute on function public.get_service_request_insurance(uuid) to authenticated;
grant execute on function public.submit_service_request_answers(uuid, jsonb) to authenticated;
