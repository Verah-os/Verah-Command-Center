create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  key text not null,
  value text not null,
  description text not null default '',
  is_secret boolean not null default false,
  is_editable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_category_key_unique unique (category, key)
);

create index if not exists system_settings_category_idx on public.system_settings (category);
create index if not exists system_settings_key_idx on public.system_settings (key);

alter table public.system_settings enable row level security;

drop policy if exists "Authenticated users can read system settings" on public.system_settings;
create policy "Authenticated users can read system settings"
  on public.system_settings
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can update editable system settings" on public.system_settings;
create policy "Authenticated users can update editable system settings"
  on public.system_settings
  for update
  to authenticated
  using ((select auth.uid()) is not null and is_editable = true)
  with check ((select auth.uid()) is not null and is_editable = true);

grant select on public.system_settings to authenticated;
grant update (value) on public.system_settings to authenticated;

create or replace function public.set_system_setting_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_system_setting_updated_at on public.system_settings;
create trigger set_system_setting_updated_at
  before update on public.system_settings
  for each row
  execute function public.set_system_setting_updated_at();

insert into public.system_settings (
  category,
  key,
  value,
  description,
  is_secret,
  is_editable
)
values
  ('github', 'owner', 'Verah-os', 'GitHub organization owner used by platform integrations.', false, true),
  ('github', 'default_branch', 'main', 'Default branch used for repository operations.', false, true),
  ('dispatcher', 'max_parallel_jobs', '3', 'Maximum number of Dispatcher jobs that may run in parallel.', false, true),
  ('dispatcher', 'retry_limit', '3', 'Maximum retry attempts for Dispatcher jobs.', false, true),
  ('ai', 'default_provider', 'openai', 'Default AI provider for future AI executions.', false, true),
  ('ai', 'default_model', 'gpt-5', 'Default AI model for future AI executions.', false, true),
  ('runtime', 'environment', 'production', 'Runtime environment for the VERAH OS platform.', false, true),
  ('runtime', 'timezone', 'America/Sao_Paulo', 'Default platform timezone.', false, true),
  ('command_center', 'app_name', 'VERAH Command Center', 'Application name displayed by the Command Center.', false, true),
  ('command_center', 'version', '0.1.0', 'Command Center application version.', false, true)
on conflict (category, key) do update set
  value = excluded.value,
  description = excluded.description,
  is_secret = excluded.is_secret,
  is_editable = excluded.is_editable;
