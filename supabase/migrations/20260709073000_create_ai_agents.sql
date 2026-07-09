create table if not exists public.ai_agents (
  id text primary key,
  name text not null,
  role text not null,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'codex', 'human', 'external')),
  status text not null default 'offline' check (status in ('online', 'offline', 'idle', 'running', 'error')),
  capabilities jsonb not null default '[]'::jsonb,
  endpoint_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agents_status_idx on public.ai_agents (status);
create index if not exists ai_agents_provider_idx on public.ai_agents (provider);
create index if not exists ai_agents_last_seen_at_idx on public.ai_agents (last_seen_at desc);

alter table public.ai_agents enable row level security;

drop policy if exists "Authenticated users can read ai agents" on public.ai_agents;
create policy "Authenticated users can read ai agents"
  on public.ai_agents
  for select
  to authenticated
  using ((select auth.uid()) is not null);

grant select on public.ai_agents to authenticated;

create or replace function public.set_ai_agent_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_agent_updated_at on public.ai_agents;
create trigger set_ai_agent_updated_at
  before update on public.ai_agents
  for each row
  execute function public.set_ai_agent_updated_at();

insert into public.ai_agents (
  id,
  name,
  role,
  provider,
  status,
  capabilities,
  endpoint_url,
  last_seen_at
)
values
  (
    'ethan',
    'Ethan',
    'Architecture / QA',
    'human',
    'idle',
    '["architecture_review", "quality_assurance", "risk_analysis"]'::jsonb,
    null,
    now()
  ),
  (
    'atlas',
    'Atlas',
    'Single Source of Truth',
    'external',
    'online',
    '["knowledge_base", "documentation", "operational_memory"]'::jsonb,
    null,
    now()
  ),
  (
    'dispatcher',
    'Dispatcher',
    'Task Routing',
    'external',
    'online',
    '["classification", "routing", "work_order_queue"]'::jsonb,
    null,
    now()
  ),
  (
    'codex',
    'Codex',
    'Engineering',
    'codex',
    'idle',
    '["software_engineering", "pull_requests", "code_review"]'::jsonb,
    null,
    now()
  ),
  (
    'gemini',
    'Gemini',
    'Research',
    'google',
    'offline',
    '["market_research", "technical_research", "analysis"]'::jsonb,
    null,
    null
  ),
  (
    'gabhriel',
    'Gabhriel',
    'CEO',
    'human',
    'online',
    '["decision_approval", "strategy", "company_direction"]'::jsonb,
    null,
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  provider = excluded.provider,
  status = excluded.status,
  capabilities = excluded.capabilities,
  endpoint_url = excluded.endpoint_url,
  last_seen_at = excluded.last_seen_at;
