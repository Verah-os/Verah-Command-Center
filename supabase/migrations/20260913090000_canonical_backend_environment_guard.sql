-- #266 — Canonical single-backend guard for Cliente App/Web + Concierge + Prestador.
--
-- Repository-only, non-production fail-closed reinforcement. Scope:
--   1. The browser-facing `authenticated` channel may only write `service_requests`
--      with the canonical origin that matches its VERAH role and only create rows
--      at `service_stage = 'solicitado'`. This prevents an app/web client from
--      mislabelling a row as `concierge`/`whatsapp` origin and from bypassing the
--      queue contract on the single canonical table.
--   2. Server-side channels (`service_role`) and trusted operator/seed writes remain
--      untouched, so WhatsApp intake, lifecycle RPCs and test fixtures keep working.
--   3. A non-secret, health-diagnosable environment probe is exposed so smoke tests
--      can verify that web and mobile read the same canonical environment.
--
-- No new tables, no new secrets, no production migrations, no migration repair.

-- ---------------------------------------------------------------------------
-- 1) Fail-closed canonical origin/stage guard for the `authenticated` channel.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_canonical_service_request_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  verah_role text;
begin
  -- Only the browser-facing PostgREST channel (`authenticated` database role)
  -- is constrained. `service_role` (WhatsApp/intake worker) and trusted
  -- operator roles (postgres in CI/seed) own their own canonical flows.
  if current_user <> 'authenticated' then
    return new;
  end if;

  verah_role := public.current_verah_role();

  if verah_role = 'customer' then
    if new.origin is distinct from 'customer' then
      raise exception using
        errcode = '23514',
        message = 'App customer channel can only create origin=customer service_requests';
    end if;
    if TG_OP = 'INSERT' and new.service_stage is distinct from 'solicitado' then
      raise exception using
        errcode = '23514',
        message = 'App customer channel can only create service_stage=solicitado service_requests';
    end if;
    return new;
  end if;

  if verah_role in ('concierge', 'admin') then
    -- Mirrors the RLS insert policy: concierge/admin create the canonical
    -- request on behalf of a customer with origin='concierge' (web path).
    if new.origin is distinct from 'concierge' then
      raise exception using
        errcode = '23514',
        message = 'Concierge/Admin channel can only create origin=concierge service_requests';
    end if;
    if TG_OP = 'INSERT' and new.service_stage is distinct from 'solicitado' then
      raise exception using
        errcode = '23514',
        message = 'Concierge/Admin channel can only create service_stage=solicitado service_requests';
    end if;
    return new;
  end if;

  -- Providers receive assignments; they never create the canonical request.
  -- Unprofiled authenticated sessions also fail closed (no silent bypass).
  raise exception using
    errcode = '42501',
    message = 'Authenticated session without customer/concierge role cannot create service_requests';
end;
$$;

revoke all on function private.enforce_canonical_service_request_origin() from public;

drop trigger if exists service_requests_enforce_canonical_origin on public.service_requests;
create trigger service_requests_enforce_canonical_origin
before insert or update of origin on public.service_requests
for each row
execute function private.enforce_canonical_service_request_origin();

comment on function private.enforce_canonical_service_request_origin() is
  '#266 canonical single-backend guard: authenticated app/web channels must label origin by VERAH role.';

-- ---------------------------------------------------------------------------
-- 2) Non-secret environment probe for cross-channel smoke tests.
-- ---------------------------------------------------------------------------
-- Reads only the admin-visible `runtime.environment` label (already seeded in
-- `system_settings`, non-secret). It never exposes keys. Both channels hitting
-- the same canonical database observe the identical label; the smoke runbook
-- uses it together with the URL-derived project ref from web/mobile builds.
create or replace function public.verah_canonical_environment()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'environment', coalesce(nullif(
      (select setting.value
         from public.system_settings as setting
        where setting.category = 'runtime'
          and setting.key = 'environment'
        limit 1), ''),
      'unset')
  );
$$;

revoke all on function public.verah_canonical_environment() from public, anon;
grant execute on function public.verah_canonical_environment() to authenticated;

comment on function public.verah_canonical_environment() is
  '#266 non-secret environment probe shared by App and Web smoke tests.';

-- ---------------------------------------------------------------------------
-- 3) Canonical non-production environment label.
-- ---------------------------------------------------------------------------
-- The shared non-secret label that App and Web reads in the Alpha/staging
-- backend. This migration is repository-only pending (Human Gate) and only
-- ever targets the non-production canonical database; production keeps the
-- 'production' label from its own baseline seed and this migration is never
-- applied there (see release-1.0-staging-migrations-runbook).
update public.system_settings
   set value = 'alpha',
       description = 'Canonical non-production runtime label established by #266 single-backend guard.'
 where category = 'runtime'
   and key = 'environment';