create table if not exists public.service_quotes (
 id uuid primary key default gen_random_uuid(), service_request_id uuid not null references public.service_requests(id), provider_id uuid not null references public.service_providers(id),
 status text not null default 'draft' check(status in ('draft','submitted','approved','clarification_requested','cancelled')),
 labor_total numeric(12,2) not null default 0, parts_total numeric(12,2) not null default 0, additional_total numeric(12,2) not null default 0, total_amount numeric(12,2) not null default 0,
 estimated_duration text, technical_notes text, customer_summary text, warranty_text text, valid_until date,
 submitted_at timestamptz, approved_at timestamptz, clarification_requested_at timestamptz, customer_decision_note text,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.service_quote_items (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.service_quotes(id) on delete cascade,
 item_type text not null check(item_type in ('labor','part','service','additional')), description text not null,
 quantity numeric(10,2) not null default 1 check(quantity > 0), unit_price numeric(12,2) not null check(unit_price >= 0), total_price numeric(12,2) not null check(total_price >= 0),
 is_optional boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists service_quotes_request_idx on public.service_quotes(service_request_id);
create index if not exists service_quotes_provider_idx on public.service_quotes(provider_id);
create index if not exists service_quotes_status_idx on public.service_quotes(status);
create index if not exists service_quote_items_quote_idx on public.service_quote_items(quote_id);
create unique index if not exists service_quotes_one_active_idx on public.service_quotes(service_request_id) where status <> 'cancelled';
alter table public.service_quotes enable row level security; alter table public.service_quote_items enable row level security;
revoke all on public.service_quotes, public.service_quote_items from anon, authenticated;
grant select on public.service_quotes, public.service_quote_items to authenticated;
create policy "Authenticated users read quotes" on public.service_quotes for select to authenticated using ((select auth.uid()) is not null);
create policy "Authenticated users read quote items" on public.service_quote_items for select to authenticated using ((select auth.uid()) is not null);

create or replace function public.save_service_quote_draft(p_service_request_id uuid,p_provider_id uuid,p_items jsonb,p_estimated_duration text default null,p_technical_notes text default null,p_customer_summary text default null,p_warranty_text text default null,p_valid_until date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); qid uuid; item jsonb; qty numeric; price numeric; kind text;
begin
 if uid is null then raise exception 'Autenticação obrigatória.'; end if;
 if not exists(select 1 from public.service_requests r where r.id=p_service_request_id and r.provider_id=p_provider_id and r.service_stage='prestador_indicado') then raise exception 'Atendimento indisponível para orçamento.'; end if;
 select id into qid from public.service_quotes where service_request_id=p_service_request_id and status='draft' for update;
 if qid is null then insert into public.service_quotes(service_request_id,provider_id,created_by) values(p_service_request_id,p_provider_id,uid) returning id into qid;
 else update public.service_quotes set estimated_duration=p_estimated_duration,technical_notes=p_technical_notes,customer_summary=p_customer_summary,warranty_text=p_warranty_text,valid_until=p_valid_until,updated_at=now() where id=qid; delete from public.service_quote_items where quote_id=qid; end if;
 update public.service_quotes set estimated_duration=p_estimated_duration,technical_notes=p_technical_notes,customer_summary=p_customer_summary,warranty_text=p_warranty_text,valid_until=p_valid_until where id=qid;
 for item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  kind:=item->>'item_type'; qty:=(item->>'quantity')::numeric; price:=(item->>'unit_price')::numeric;
  if kind not in ('labor','part','service','additional') or nullif(trim(item->>'description'),'') is null or qty<=0 or price<0 then raise exception 'Item de orçamento inválido.'; end if;
  insert into public.service_quote_items(quote_id,item_type,description,quantity,unit_price,total_price,is_optional) values(qid,kind,trim(item->>'description'),qty,price,round(qty*price,2),coalesce((item->>'is_optional')::boolean,false));
 end loop;
 update public.service_quotes q set labor_total=coalesce((select sum(total_price) from public.service_quote_items where quote_id=qid and item_type='labor'),0),parts_total=coalesce((select sum(total_price) from public.service_quote_items where quote_id=qid and item_type='part'),0),additional_total=coalesce((select sum(total_price) from public.service_quote_items where quote_id=qid and item_type in ('service','additional')),0),total_amount=coalesce((select sum(total_price) from public.service_quote_items where quote_id=qid),0),updated_at=now() where q.id=qid;
 return qid;
end; $$;

create or replace function public.submit_service_quote(p_quote_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; begin if uid is null then raise exception 'Autenticação obrigatória.'; end if; select service_request_id into rid from public.service_quotes where id=p_quote_id and status='draft' for update; if rid is null or not exists(select 1 from public.service_quote_items where quote_id=p_quote_id) then raise exception 'Orçamento vazio, inválido ou já enviado.'; end if; update public.service_quotes set status='submitted',submitted_at=now(),updated_at=now() where id=p_quote_id; update public.service_requests set service_stage='aguardando_aprovacao',updated_at=now() where id=rid and service_stage='prestador_indicado'; return p_quote_id; end; $$;
create or replace function public.approve_service_quote(p_quote_id uuid,p_customer_decision_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; begin if uid is null then raise exception 'Autenticação obrigatória.'; end if; select q.service_request_id into rid from public.service_quotes q join public.service_requests r on r.id=q.service_request_id where q.id=p_quote_id and q.status='submitted' and r.created_by=uid for update of q; if rid is null then raise exception 'Orçamento indisponível para aprovação.'; end if; update public.service_quotes set status='approved',approved_at=now(),customer_decision_note=p_customer_decision_note,updated_at=now() where id=p_quote_id; update public.service_requests set service_stage='em_execucao',updated_at=now() where id=rid; return p_quote_id; end; $$;
create or replace function public.request_quote_clarification(p_quote_id uuid,p_customer_decision_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; begin if uid is null or nullif(trim(p_customer_decision_note),'') is null then raise exception 'Mensagem de esclarecimento obrigatória.'; end if; select q.service_request_id into rid from public.service_quotes q join public.service_requests r on r.id=q.service_request_id where q.id=p_quote_id and q.status='submitted' and r.created_by=uid for update of q; if rid is null then raise exception 'Orçamento indisponível para esclarecimento.'; end if; update public.service_quotes set status='clarification_requested',clarification_requested_at=now(),customer_decision_note=trim(p_customer_decision_note),updated_at=now() where id=p_quote_id; return p_quote_id; end; $$;
revoke all on function public.save_service_quote_draft(uuid,uuid,jsonb,text,text,text,text,date),public.submit_service_quote(uuid),public.approve_service_quote(uuid,text),public.request_quote_clarification(uuid,text) from public,anon,authenticated;
grant execute on function public.save_service_quote_draft(uuid,uuid,jsonb,text,text,text,text,date),public.submit_service_quote(uuid),public.approve_service_quote(uuid,text),public.request_quote_clarification(uuid,text) to authenticated;
