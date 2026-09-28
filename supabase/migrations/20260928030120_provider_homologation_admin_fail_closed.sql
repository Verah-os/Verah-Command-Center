-- Repository-only security hardening; deployment remains a separate human gate.
-- Preserve the canonical RPCs and their append-only audit history.
create or replace function private.require_homologation_admin()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or (select public.current_verah_role()) is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Human homologation Admin required.';
  end if;
  return actor_id;
end;
$$;
revoke execute on function private.require_homologation_admin()
  from public, anon, authenticated, service_role;
