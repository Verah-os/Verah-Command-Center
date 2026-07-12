alter table public.service_requests
  add column if not exists concierge_id uuid references auth.users(id),
  add column if not exists concierge_accepted_at timestamptz,
  add column if not exists work_order_id text references public.work_orders(id);

create index if not exists service_requests_created_by_idx
  on public.service_requests (created_by);

create unique index if not exists service_requests_work_order_id_unique_idx
  on public.service_requests (work_order_id)
  where work_order_id is not null;

drop policy if exists "Command Center can read service requests" on public.service_requests;
create policy "Command Center can read service requests"
  on public.service_requests
  for select
  to authenticated
  using ((select auth.uid()) is not null);

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
  selected_request public.service_requests%rowtype;
  generated_work_order_id text;
  work_order_priority text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;

  select * into selected_request
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Atendimento não encontrado.';
  end if;

  if selected_request.service_stage <> 'solicitado'
    or selected_request.concierge_id is not null
    or selected_request.work_order_id is not null then
    raise exception using errcode = 'P0001', message = 'Este atendimento já foi assumido.';
  end if;

  generated_work_order_id := 'WO-' || selected_request.reference_code;
  work_order_priority := case selected_request.perceived_urgency
    when 'critica' then 'Critical'
    when 'alta' then 'High'
    when 'media' then 'Medium'
    else 'Low'
  end;

  insert into public.work_orders (
    id, title, description, status, priority, owner, origin, category
  ) values (
    generated_work_order_id,
    selected_request.reference_code || ' — ' || selected_request.vehicle_brand || ' ' || selected_request.vehicle_model,
    concat_ws(E'\n\n',
      'Relato da cliente: ' || selected_request.customer_report,
      'Resumo do Service Copilot: ' || coalesce(selected_request.copilot_summary, 'Não informado.'),
      'Briefing do Concierge: ' || coalesce(selected_request.copilot_concierge_brief, 'Revisão humana necessária.')
    ),
    'Backlog',
    work_order_priority,
    'Concierge VERAH',
    'Manual',
    coalesce(selected_request.probable_category, 'outro')
  );

  update public.service_requests
  set service_stage = 'concierge_aceitou',
      concierge_id = current_user_id,
      concierge_accepted_at = now(),
      work_order_id = generated_work_order_id,
      updated_at = now()
  where id = selected_request.id;

  return query
  select sr.id, sr.work_order_id, sr.service_stage, sr.concierge_id, sr.concierge_accepted_at
  from public.service_requests sr
  where sr.id = selected_request.id;
end;
$$;

revoke all on function public.accept_service_request(uuid) from public;
revoke all on function public.accept_service_request(uuid) from anon;
revoke all on function public.accept_service_request(uuid) from authenticated;
grant execute on function public.accept_service_request(uuid) to authenticated;
