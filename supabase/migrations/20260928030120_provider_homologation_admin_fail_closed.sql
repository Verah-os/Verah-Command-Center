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

-- Operational onboarding may have created a profile without its checklist.
-- Lock and reuse the existing canonical initializer, preserving every field.
create or replace function public.initialize_provider_homologation_checklist(p_provider_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select private.require_homologation_admin());
  profile public.provider_homologation_profiles%rowtype;
begin
  select * into profile from public.provider_homologation_profiles
  where provider_id = p_provider_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Provider homologation profile not found.';
  end if;
  return public.upsert_provider_homologation_profile(
    profile.provider_id, profile.legal_name, profile.trade_name,
    profile.registration_reference, profile.operational_address,
    profile.responsible_person, profile.contacts, profile.specialties,
    profile.service_regions, profile.operational_hours, profile.approximate_capacity,
    profile.warranty_policy, profile.warranty_days, profile.receives_vehicles,
    profile.internal_notes
  );
end;
$$;
revoke execute on function public.initialize_provider_homologation_checklist(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_provider_homologation_checklist(uuid) to authenticated;
