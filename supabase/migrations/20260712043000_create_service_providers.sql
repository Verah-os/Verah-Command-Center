create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  document text,
  city text not null,
  specialties jsonb not null default '[]'::jsonb,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  rating numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_providers_city_idx on public.service_providers (city);
create index if not exists service_providers_status_idx on public.service_providers (status);
alter table public.service_providers enable row level security;
revoke all on public.service_providers from anon, authenticated;
grant select on public.service_providers to authenticated;

drop policy if exists "Authenticated users can read active providers" on public.service_providers;
create policy "Authenticated users can read active providers" on public.service_providers
  for select to authenticated using (status = 'active' and (select auth.uid()) is not null);

insert into public.service_providers (name, trade_name, city, specialties, status, rating)
select seed.name, seed.trade_name, seed.city, seed.specialties, 'active', seed.rating
from (values
  ('Oficina Confiança', 'Oficina Confiança', 'Franca', '["motor","manutencao_preventiva","freios"]'::jsonb, 4.8::numeric),
  ('Auto Elétrica Central', 'Auto Elétrica Central', 'Franca', '["eletrica","bateria","ar_condicionado"]'::jsonb, 4.7::numeric),
  ('Centro Automotivo Segura', 'Centro Automotivo Segura', 'Franca', '["suspensao","pneus","alinhamento"]'::jsonb, 4.6::numeric)
) as seed(name, trade_name, city, specialties, rating)
where not exists (select 1 from public.service_providers existing where lower(existing.name) = lower(seed.name) and lower(existing.city) = lower(seed.city));

alter table public.service_requests
  add column if not exists provider_id uuid references public.service_providers(id),
  add column if not exists provider_assigned_at timestamptz,
  add column if not exists provider_assigned_by uuid references auth.users(id);

create index if not exists service_requests_provider_id_idx on public.service_requests (provider_id);

create or replace function public.assign_provider_to_service_request(p_service_request_id uuid, p_provider_id uuid)
returns table (service_request_id uuid, provider_id uuid, service_stage text, provider_assigned_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  selected_request public.service_requests%rowtype;
  selected_provider public.service_providers%rowtype;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'Autenticação obrigatória.'; end if;
  select * into selected_request from public.service_requests where id = p_service_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Atendimento não encontrado.'; end if;
  if selected_request.service_stage <> 'concierge_aceitou' or selected_request.provider_id is not null then
    raise exception using errcode = 'P0001', message = 'Este atendimento já possui um prestador indicado.';
  end if;
  select * into selected_provider from public.service_providers where id = p_provider_id and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'Prestador ativo não encontrado.'; end if;
  update public.service_requests set provider_id = selected_provider.id, provider_assigned_at = now(),
    provider_assigned_by = current_user_id, service_stage = 'prestador_indicado', updated_at = now()
  where id = selected_request.id;
  return query select sr.id, sr.provider_id, sr.service_stage, sr.provider_assigned_at
    from public.service_requests sr where sr.id = selected_request.id;
end;
$$;

revoke all on function public.assign_provider_to_service_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_provider_to_service_request(uuid, uuid) to authenticated;
