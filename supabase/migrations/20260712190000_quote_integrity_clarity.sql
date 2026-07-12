alter table public.service_quote_items
  drop constraint if exists service_quote_items_unit_price_check,
  drop constraint if exists service_quote_items_quantity_check;

alter table public.service_quote_items
  add constraint service_quote_items_unit_price_positive check (unit_price > 0) not valid,
  add constraint service_quote_items_quantity_by_type check (
    (item_type = 'labor' and quantity >= 0.1)
    or
    (item_type <> 'labor' and quantity >= 1 and quantity = trunc(quantity))
  ) not valid;

create or replace function public.submit_service_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  persisted_total numeric;
begin
  if uid is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select service_request_id, total_amount
  into rid, persisted_total
  from public.service_quotes
  where id = p_quote_id and status = 'draft'
  for update;

  if rid is null
    or persisted_total <= 0
    or not exists (select 1 from public.service_quote_items where quote_id = p_quote_id) then
    raise exception 'Orçamento vazio, inválido ou já enviado.';
  end if;

  update public.service_quotes
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_quote_id;

  update public.service_requests
  set service_stage = 'aguardando_aprovacao', updated_at = now()
  where id = rid and service_stage = 'prestador_indicado';

  return p_quote_id;
end;
$$;

revoke all on function public.submit_service_quote(uuid) from public, anon, authenticated;
grant execute on function public.submit_service_quote(uuid) to authenticated;
