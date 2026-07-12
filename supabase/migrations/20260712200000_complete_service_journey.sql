alter table public.service_requests
 add column if not exists provider_completed_at timestamptz,
 add column if not exists concierge_confirmed_at timestamptz,
 add column if not exists completed_at timestamptz,
 add column if not exists completion_notes text,
 add column if not exists customer_rating integer,
 add column if not exists customer_feedback text,
 add column if not exists customer_rated_at timestamptz;
alter table public.service_requests add constraint service_requests_rating_range check(customer_rating between 1 and 5) not valid;
alter table public.service_requests add constraint service_requests_completed_stage check(completed_at is null or service_stage='concluido') not valid;

create or replace function public.provider_mark_service_completed(p_service_request_id uuid,p_completion_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin if uid is null then raise exception 'Autenticação obrigatória.'; end if;
 update public.service_requests set provider_completed_at=now(),completion_notes=nullif(trim(p_completion_notes),'') ,updated_at=now()
 where id=p_service_request_id and service_stage='em_execucao' and provider_id is not null and provider_completed_at is null;
 if not found then raise exception 'Atendimento indisponível ou já finalizado pelo prestador.'; end if; return p_service_request_id; end; $$;
create or replace function public.concierge_confirm_service_completion(p_service_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin if uid is null then raise exception 'Autenticação obrigatória.'; end if;
 update public.service_requests set concierge_confirmed_at=now(),completed_at=now(),service_stage='concluido',updated_at=now()
 where id=p_service_request_id and service_stage='em_execucao' and provider_completed_at is not null and concierge_confirmed_at is null;
 if not found then raise exception 'Conclusão indisponível ou já confirmada.'; end if; return p_service_request_id; end; $$;
create or replace function public.submit_service_rating(p_service_request_id uuid,p_rating integer,p_feedback text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin if uid is null then raise exception 'Autenticação obrigatória.'; end if; if p_rating not between 1 and 5 then raise exception 'A nota deve estar entre 1 e 5.'; end if;
 update public.service_requests set customer_rating=p_rating,customer_feedback=nullif(trim(p_feedback),''),customer_rated_at=now(),updated_at=now()
 where id=p_service_request_id and created_by=uid and service_stage='concluido' and customer_rating is null;
 if not found then raise exception 'Avaliação indisponível ou já enviada.'; end if; return p_service_request_id; end; $$;
revoke all on function public.provider_mark_service_completed(uuid,text),public.concierge_confirm_service_completion(uuid),public.submit_service_rating(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.provider_mark_service_completed(uuid,text),public.concierge_confirm_service_completion(uuid),public.submit_service_rating(uuid,integer,text) to authenticated;
