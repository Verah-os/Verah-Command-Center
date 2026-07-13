-- Preserve the existing financial implementations while adding role-bound authorization.
alter function public.save_service_quote_draft(uuid, uuid, jsonb, text, text, text, text, date)
  rename to save_service_quote_draft_authorized_impl;
alter function public.submit_service_quote(uuid)
  rename to submit_service_quote_authorized_impl;
alter function public.provider_mark_service_completed(uuid, text)
  rename to provider_mark_service_completed_authorized_impl;

revoke all on function public.save_service_quote_draft_authorized_impl(uuid, uuid, jsonb, text, text, text, text, date) from public, anon, authenticated;
revoke all on function public.submit_service_quote_authorized_impl(uuid) from public, anon, authenticated;
revoke all on function public.provider_mark_service_completed_authorized_impl(uuid, text) from public, anon, authenticated;

create function public.save_service_quote_draft(
  p_service_request_id uuid,
  p_provider_id uuid,
  p_items jsonb,
  p_estimated_duration text default null,
  p_technical_notes text default null,
  p_customer_summary text default null,
  p_warranty_text text default null,
  p_valid_until date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_role text;
  effective_provider_id uuid;
begin
  select role, provider_id into profile_role, effective_provider_id
  from public.user_profiles where user_id = uid;
  if profile_role = 'admin' then effective_provider_id := p_provider_id;
  elsif profile_role <> 'provider' or effective_provider_id is null then
    raise exception 'Perfil sem autorização para orçamento.';
  end if;
  return public.save_service_quote_draft_authorized_impl(p_service_request_id, effective_provider_id, p_items, p_estimated_duration, p_technical_notes, p_customer_summary, p_warranty_text, p_valid_until);
end; $$;

create function public.submit_service_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_role text;
  profile_provider_id uuid;
begin
  select role, provider_id into profile_role, profile_provider_id
  from public.user_profiles where user_id = uid;
  if profile_role is distinct from 'admin' and (profile_role is distinct from 'provider' or profile_provider_id is null or not exists (
    select 1 from public.service_quotes where id = p_quote_id and provider_id = profile_provider_id
  )) then raise exception 'Orçamento não pertence ao prestador autenticado.';
  end if;
  return public.submit_service_quote_authorized_impl(p_quote_id);
end; $$;

create function public.provider_mark_service_completed(p_service_request_id uuid, p_completion_notes text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_role text;
  profile_provider_id uuid;
begin
  select role, provider_id into profile_role, profile_provider_id
  from public.user_profiles where user_id = uid;
  if profile_role is distinct from 'admin' and (profile_role is distinct from 'provider' or profile_provider_id is null or not exists (
    select 1 from public.service_requests where id = p_service_request_id and provider_id = profile_provider_id
  )) then raise exception 'Atendimento não pertence ao prestador autenticado.';
  end if;
  return public.provider_mark_service_completed_authorized_impl(p_service_request_id, p_completion_notes);
end; $$;

revoke all on function public.save_service_quote_draft(uuid, uuid, jsonb, text, text, text, text, date), public.submit_service_quote(uuid), public.provider_mark_service_completed(uuid, text) from public, anon, authenticated;
grant execute on function public.save_service_quote_draft(uuid, uuid, jsonb, text, text, text, text, date), public.submit_service_quote(uuid), public.provider_mark_service_completed(uuid, text) to authenticated;
