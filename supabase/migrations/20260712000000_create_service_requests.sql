create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique not null,
  customer_name text not null,
  customer_phone text,
  vehicle_brand text not null,
  vehicle_model text not null,
  vehicle_year integer,
  vehicle_plate text,
  city text not null,
  customer_report text not null,
  perceived_urgency text not null check (perceived_urgency in ('baixa', 'media', 'alta', 'critica')),
  service_stage text not null default 'solicitado' check (service_stage in ('solicitado', 'concierge_aceitou', 'prestador_indicado', 'aguardando_aprovacao', 'em_execucao', 'concluido', 'cancelado')),
  probable_category text,
  copilot_summary text,
  copilot_questions jsonb not null default '[]'::jsonb,
  copilot_risk_signals jsonb not null default '[]'::jsonb,
  copilot_recommended_next_step text,
  copilot_customer_message text,
  copilot_concierge_brief text,
  copilot_provider_brief text,
  copilot_confidence numeric,
  requires_human_review boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_created_at_idx on public.service_requests (created_at desc);
create index if not exists service_requests_service_stage_idx on public.service_requests (service_stage);
create index if not exists service_requests_reference_code_idx on public.service_requests (reference_code);

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon;
revoke all on public.service_requests from authenticated;
grant select, insert on public.service_requests to authenticated;

drop policy if exists "Customers can read their service requests" on public.service_requests;
create policy "Customers can read their service requests"
  on public.service_requests for select to authenticated
  using ((select auth.uid()) = created_by);

drop policy if exists "Customers can create their service requests" on public.service_requests;
create policy "Customers can create their service requests"
  on public.service_requests for insert to authenticated
  with check ((select auth.uid()) = created_by and service_stage = 'solicitado');
