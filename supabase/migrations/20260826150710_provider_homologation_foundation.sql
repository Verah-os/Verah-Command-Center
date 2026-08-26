-- Internal provider homologation for controlled Pilot Alpha operations.
-- Operational status remains independent: active does not mean VERAH-approved.

alter table public.service_providers
  add column is_synthetic boolean not null default false;

alter table public.service_requests
  add column operation_context text not null default 'demo'
    check (operation_context in ('demo', 'pilot_alpha')),
  add column service_category_code text,
  add constraint service_requests_pilot_category_check check (
    operation_context <> 'pilot_alpha' or nullif(btrim(service_category_code), '') is not null
  );

update public.service_providers
set is_synthetic = true
where name in ('Oficina Confiança', 'Auto Elétrica Central', 'Centro Automotivo Segura');

create table public.provider_homologation_profiles (
  provider_id uuid primary key references public.service_providers(id) on delete restrict,
  legal_name text,
  trade_name text,
  registration_reference text,
  operational_address jsonb not null default '{}'::jsonb,
  responsible_person jsonb not null default '{}'::jsonb,
  contacts jsonb not null default '{}'::jsonb,
  specialties text[] not null default '{}',
  service_regions text[] not null default '{}',
  operational_hours jsonb not null default '{}'::jsonb,
  approximate_capacity integer check (approximate_capacity is null or approximate_capacity >= 0),
  warranty_policy text,
  warranty_days integer check (warranty_days is null or warranty_days >= 0),
  receives_vehicles boolean not null default false,
  internal_notes text,
  homologation_status text not null default 'candidate' check (homologation_status in (
    'candidate', 'documents_pending', 'under_review', 'pilot_approved',
    'approved', 'suspended', 'rejected', 'expired'
  )),
  homologated_at timestamptz,
  homologated_by uuid references auth.users(id) on delete restrict,
  next_review_at timestamptz,
  critical_operational_block boolean not null default false,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    homologation_status not in ('pilot_approved', 'approved')
    or (homologated_at is not null and homologated_by is not null)
  )
);

create table public.provider_homologation_checklist_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  item_code text not null check (item_code in (
    'company_registration', 'cadastral_data', 'operational_address',
    'responsible_person', 'fiscal_documentation', 'banking_reference',
    'contract_acceptance', 'warranty_policy', 'capacity_evidence',
    'verah_inspection', 'pilot_service', 'final_human_approval'
  )),
  is_required_for_pilot boolean not null default true,
  review_status text not null default 'pending' check (review_status in (
    'pending', 'verified', 'rejected', 'expired', 'not_applicable'
  )),
  reviewer_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  evidence_ref uuid,
  valid_until timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, item_code),
  check (review_status = 'pending' or (reviewer_id is not null and reviewed_at is not null))
);

create table public.provider_category_authorizations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  category_code text not null check (btrim(category_code) <> ''),
  authorization_status text not null default 'candidate' check (authorization_status in (
    'candidate', 'documents_pending', 'under_review', 'pilot_approved',
    'approved', 'suspended', 'rejected', 'expired'
  )),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  valid_until timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, category_code),
  check (
    authorization_status not in ('pilot_approved', 'approved')
    or (approved_by is not null and approved_at is not null)
  )
);

create table public.provider_homologation_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table public.provider_performance_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  event_type text not null check (event_type in (
    'delivery_time', 'budget_variance', 'rework', 'warranty_claim',
    'incident', 'customer_rating', 'document_compliance'
  )),
  metric_value numeric,
  metric_unit text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.service_completion_records (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  service_performed text not null check (btrim(service_performed) <> ''),
  relevant_items jsonb not null default '[]'::jsonb check (jsonb_typeof(relevant_items) = 'array'),
  final_amount numeric(12,2) not null check (final_amount >= 0),
  completed_at timestamptz not null,
  warranty_terms text,
  warranty_valid_until date,
  notes text,
  evidence_refs uuid[] not null default '{}',
  closed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (service_request_id),
  check (warranty_valid_until is null or warranty_terms is not null)
);

create index provider_homologation_status_idx
  on public.provider_homologation_profiles (homologation_status, next_review_at);
create index provider_category_authorization_idx
  on public.provider_category_authorizations (provider_id, category_code, authorization_status);
create index provider_homologation_events_idx
  on public.provider_homologation_events (provider_id, created_at);
create index provider_performance_events_idx
  on public.provider_performance_events (provider_id, created_at);

alter table public.provider_homologation_profiles enable row level security;
alter table public.provider_homologation_checklist_items enable row level security;
alter table public.provider_category_authorizations enable row level security;
alter table public.provider_homologation_events enable row level security;
alter table public.provider_performance_events enable row level security;
alter table public.service_completion_records enable row level security;

revoke all on table public.provider_homologation_profiles from public, anon, authenticated, service_role;
revoke all on table public.provider_homologation_checklist_items from public, anon, authenticated, service_role;
revoke all on table public.provider_category_authorizations from public, anon, authenticated, service_role;
revoke all on table public.provider_homologation_events from public, anon, authenticated, service_role;
revoke all on table public.provider_performance_events from public, anon, authenticated, service_role;
revoke all on table public.service_completion_records from public, anon, authenticated, service_role;

grant select on table public.provider_homologation_profiles to authenticated;
grant select on table public.provider_homologation_checklist_items to authenticated;
grant select on table public.provider_category_authorizations to authenticated;
grant select on table public.provider_homologation_events to authenticated;
grant select on table public.provider_performance_events to authenticated;
grant select on table public.service_completion_records to authenticated;

create policy "Operations read provider homologation profiles"
  on public.provider_homologation_profiles for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read provider checklist"
  on public.provider_homologation_checklist_items for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read provider category authorization"
  on public.provider_category_authorizations for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read provider homologation audit"
  on public.provider_homologation_events for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read provider performance events"
  on public.provider_performance_events for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read completion records"
  on public.service_completion_records for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Providers read own completion records"
  on public.service_completion_records for select to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and provider_id = (select public.current_verah_provider_id())
  );
create or replace function private.reject_provider_homologation_artifact_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Provider homologation history is append-only.';
end;
$$;
revoke execute on function private.reject_provider_homologation_artifact_mutation()
  from public, anon, authenticated, service_role;

create trigger provider_homologation_events_immutable
before update or delete on public.provider_homologation_events
for each row execute function private.reject_provider_homologation_artifact_mutation();
create trigger provider_performance_events_immutable
before update or delete on public.provider_performance_events
for each row execute function private.reject_provider_homologation_artifact_mutation();
create trigger service_completion_records_immutable
before update or delete on public.service_completion_records
for each row execute function private.reject_provider_homologation_artifact_mutation();

create or replace function private.require_homologation_admin()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or (select public.current_verah_role()) <> 'admin' then
    raise exception using errcode = '42501', message = 'Human homologation Admin required.';
  end if;
  return actor_id;
end;
$$;
revoke execute on function private.require_homologation_admin()
  from public, anon, authenticated, service_role;

create or replace function private.append_provider_homologation_event(
  p_provider_id uuid, p_event_type text, p_actor_id uuid,
  p_reason text, p_before jsonb, p_after jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare event_id uuid;
begin
  insert into public.provider_homologation_events (
    provider_id, event_type, actor_user_id, actor_role, reason, before_state, after_state
  ) values (p_provider_id, p_event_type, p_actor_id, 'admin', p_reason, p_before, p_after)
  returning id into event_id;
  return event_id;
end;
$$;
revoke execute on function private.append_provider_homologation_event(uuid, text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.provider_is_eligible_for_service(
  p_provider_id uuid,
  p_service_category text,
  p_operation_context text default 'pilot_alpha'
) returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_operation_context = 'demo' then exists (
      select 1 from public.service_providers provider
      where provider.id = p_provider_id and provider.status = 'active' and provider.is_synthetic
    )
    when p_operation_context <> 'pilot_alpha' or nullif(btrim(p_service_category), '') is null then false
    else exists (
      select 1
      from public.service_providers provider
      join public.provider_homologation_profiles profile on profile.provider_id = provider.id
      join public.provider_category_authorizations category on category.provider_id = provider.id
      where provider.id = p_provider_id
        and provider.status = 'active'
        and profile.homologation_status in ('pilot_approved', 'approved')
        and not profile.critical_operational_block
        and (profile.next_review_at is null or profile.next_review_at > pg_catalog.now())
        and category.category_code = p_service_category
        and category.authorization_status in ('pilot_approved', 'approved')
        and (category.valid_until is null or category.valid_until > pg_catalog.now())
        and not exists (
          select 1 from public.provider_homologation_checklist_items item
          where item.provider_id = provider.id
            and item.is_required_for_pilot
            and (item.review_status <> 'verified' or (item.valid_until is not null and item.valid_until <= pg_catalog.now()))
        )
        and exists (
          select 1 from public.provider_homologation_checklist_items item
          where item.provider_id = provider.id and item.is_required_for_pilot
        )
    )
  end
$$;
revoke execute on function public.provider_is_eligible_for_service(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.provider_is_eligible_for_service(uuid, text, text) to authenticated;

create or replace function public.upsert_provider_homologation_profile(
  p_provider_id uuid, p_legal_name text, p_trade_name text,
  p_registration_reference text, p_operational_address jsonb,
  p_responsible_person jsonb, p_contacts jsonb, p_specialties text[],
  p_service_regions text[], p_operational_hours jsonb,
  p_approximate_capacity integer, p_warranty_policy text, p_warranty_days integer,
  p_receives_vehicles boolean, p_internal_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb;
begin
  select to_jsonb(profile) into old_row from public.provider_homologation_profiles profile
  where profile.provider_id = p_provider_id;
  insert into public.provider_homologation_profiles (
    provider_id, legal_name, trade_name, registration_reference, operational_address,
    responsible_person, contacts, specialties, service_regions, operational_hours,
    approximate_capacity, warranty_policy, warranty_days, receives_vehicles, internal_notes
  ) values (
    p_provider_id, p_legal_name, p_trade_name, p_registration_reference, p_operational_address,
    p_responsible_person, p_contacts, p_specialties, p_service_regions, p_operational_hours,
    p_approximate_capacity, p_warranty_policy, p_warranty_days, p_receives_vehicles, p_internal_notes
  ) on conflict (provider_id) do update set
    legal_name = excluded.legal_name, trade_name = excluded.trade_name,
    registration_reference = excluded.registration_reference,
    operational_address = excluded.operational_address,
    responsible_person = excluded.responsible_person, contacts = excluded.contacts,
    specialties = excluded.specialties, service_regions = excluded.service_regions,
    operational_hours = excluded.operational_hours,
    approximate_capacity = excluded.approximate_capacity,
    warranty_policy = excluded.warranty_policy, warranty_days = excluded.warranty_days,
    receives_vehicles = excluded.receives_vehicles, internal_notes = excluded.internal_notes,
    updated_at = pg_catalog.now();

  insert into public.provider_homologation_checklist_items (provider_id, item_code, is_required_for_pilot)
  select p_provider_id, seed.item_code, seed.required
  from (values
    ('company_registration', true), ('cadastral_data', true),
    ('operational_address', true), ('responsible_person', true),
    ('fiscal_documentation', true), ('banking_reference', false),
    ('contract_acceptance', true), ('warranty_policy', true),
    ('capacity_evidence', true), ('verah_inspection', true),
    ('pilot_service', true), ('final_human_approval', true)
  ) as seed(item_code, required)
  on conflict (provider_id, item_code) do nothing;

  perform private.append_provider_homologation_event(
    p_provider_id, 'profile_reviewed', actor_id, 'Internal provider profile review', old_row,
    (select to_jsonb(profile) from public.provider_homologation_profiles profile where profile.provider_id = p_provider_id)
  );
  return p_provider_id;
end;
$$;

create or replace function public.review_provider_checklist_item(
  p_provider_id uuid, p_item_code text, p_status text,
  p_evidence_ref uuid default null, p_valid_until timestamptz default null,
  p_note text default null, p_required_for_pilot boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb; result_id uuid;
begin
  select to_jsonb(item) into old_row from public.provider_homologation_checklist_items item
  where item.provider_id = p_provider_id and item.item_code = p_item_code;
  insert into public.provider_homologation_checklist_items (
    provider_id, item_code, is_required_for_pilot, review_status, reviewer_id,
    reviewed_at, evidence_ref, valid_until, note
  ) values (
    p_provider_id, p_item_code, p_required_for_pilot, p_status, actor_id,
    pg_catalog.now(), p_evidence_ref, p_valid_until, p_note
  ) on conflict (provider_id, item_code) do update set
    is_required_for_pilot = excluded.is_required_for_pilot,
    review_status = excluded.review_status, reviewer_id = excluded.reviewer_id,
    reviewed_at = excluded.reviewed_at, evidence_ref = excluded.evidence_ref,
    valid_until = excluded.valid_until, note = excluded.note, updated_at = pg_catalog.now()
  returning id into result_id;
  perform private.append_provider_homologation_event(
    p_provider_id, 'checklist_reviewed', actor_id, p_note, old_row,
    (select to_jsonb(item) from public.provider_homologation_checklist_items item where item.id = result_id)
  );
  return result_id;
end;
$$;

create or replace function public.set_provider_category_authorization(
  p_provider_id uuid, p_category_code text, p_status text,
  p_valid_until timestamptz default null, p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb; result_id uuid;
begin
  select to_jsonb(category) into old_row from public.provider_category_authorizations category
  where category.provider_id = p_provider_id and category.category_code = p_category_code;
  insert into public.provider_category_authorizations (
    provider_id, category_code, authorization_status, approved_by, approved_at, valid_until, reason
  ) values (
    p_provider_id, p_category_code, p_status,
    case when p_status in ('pilot_approved', 'approved') then actor_id end,
    case when p_status in ('pilot_approved', 'approved') then pg_catalog.now() end,
    p_valid_until, p_reason
  ) on conflict (provider_id, category_code) do update set
    authorization_status = excluded.authorization_status,
    approved_by = excluded.approved_by, approved_at = excluded.approved_at,
    valid_until = excluded.valid_until, reason = excluded.reason, updated_at = pg_catalog.now()
  returning id into result_id;
  perform private.append_provider_homologation_event(
    p_provider_id, 'category_authorization_changed', actor_id, p_reason, old_row,
    (select to_jsonb(category) from public.provider_category_authorizations category where category.id = result_id)
  );
  return result_id;
end;
$$;

create or replace function public.set_provider_homologation_status(
  p_provider_id uuid, p_status text, p_reason text default null,
  p_next_review_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb;
begin
  select to_jsonb(profile) into old_row from public.provider_homologation_profiles profile
  where profile.provider_id = p_provider_id for update;
  if p_status in ('pilot_approved', 'approved') and (
    not exists (
      select 1 from public.provider_homologation_checklist_items item
      where item.provider_id = p_provider_id and item.is_required_for_pilot
    ) or exists (
      select 1 from public.provider_homologation_checklist_items item
      where item.provider_id = p_provider_id and item.is_required_for_pilot
        and (item.review_status <> 'verified' or (item.valid_until is not null and item.valid_until <= pg_catalog.now()))
    )
  ) then
    raise exception using errcode = 'P0001', message = 'Mandatory provider checklist is not valid.';
  end if;
  insert into public.provider_homologation_profiles (
    provider_id, homologation_status, homologated_at, homologated_by, next_review_at, status_reason
  ) values (
    p_provider_id, p_status,
    case when p_status in ('pilot_approved', 'approved') then pg_catalog.now() end,
    case when p_status in ('pilot_approved', 'approved') then actor_id end,
    p_next_review_at, p_reason
  ) on conflict (provider_id) do update set
    homologation_status = excluded.homologation_status,
    homologated_at = case when excluded.homologation_status in ('pilot_approved', 'approved') then pg_catalog.now() else provider_homologation_profiles.homologated_at end,
    homologated_by = case when excluded.homologation_status in ('pilot_approved', 'approved') then actor_id else provider_homologation_profiles.homologated_by end,
    next_review_at = excluded.next_review_at, status_reason = excluded.status_reason,
    updated_at = pg_catalog.now();
  perform private.append_provider_homologation_event(
    p_provider_id, 'homologation_status_changed', actor_id, p_reason, old_row,
    (select to_jsonb(profile) from public.provider_homologation_profiles profile where profile.provider_id = p_provider_id)
  );
  return p_provider_id;
end;
$$;

create or replace function public.set_provider_operational_block(
  p_provider_id uuid, p_blocked boolean, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb;
begin
  if p_blocked and nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Operational block reason is required.';
  end if;
  select to_jsonb(profile) into old_row from public.provider_homologation_profiles profile
  where profile.provider_id = p_provider_id for update;
  update public.provider_homologation_profiles
  set critical_operational_block = p_blocked,
      status_reason = case when p_blocked then p_reason else status_reason end,
      updated_at = pg_catalog.now()
  where provider_id = p_provider_id;
  if not found then raise exception using errcode = 'P0002', message = 'Provider homologation profile not found.'; end if;
  perform private.append_provider_homologation_event(
    p_provider_id, case when p_blocked then 'operational_block_added' else 'operational_block_removed' end,
    actor_id, p_reason, old_row,
    (select to_jsonb(profile) from public.provider_homologation_profiles profile where profile.provider_id = p_provider_id)
  );
  return p_provider_id;
end;
$$;

create or replace function public.update_own_provider_operational_profile(
  p_operational_hours jsonb, p_approximate_capacity integer,
  p_warranty_policy text, p_warranty_days integer, p_receives_vehicles boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare provider_id uuid := (select public.current_verah_provider_id());
begin
  if auth.uid() is null or (select public.current_verah_role()) <> 'provider' or provider_id is null then
    raise exception using errcode = '42501', message = 'Provider authorization required.';
  end if;
  insert into public.provider_homologation_profiles (
    provider_id, operational_hours, approximate_capacity, warranty_policy, warranty_days, receives_vehicles
  ) values (
    provider_id, p_operational_hours, p_approximate_capacity, p_warranty_policy, p_warranty_days, p_receives_vehicles
  ) on conflict (provider_id) do update set
    operational_hours = excluded.operational_hours,
    approximate_capacity = excluded.approximate_capacity,
    warranty_policy = excluded.warranty_policy,
    warranty_days = excluded.warranty_days,
    receives_vehicles = excluded.receives_vehicles,
    updated_at = pg_catalog.now();
  return provider_id;
end;
$$;

create or replace function public.get_own_provider_homologation()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare provider_id uuid := (select public.current_verah_provider_id()); result jsonb;
begin
  if auth.uid() is null or (select public.current_verah_role()) <> 'provider' or provider_id is null then
    raise exception using errcode = '42501', message = 'Provider authorization required.';
  end if;
  select jsonb_build_object(
    'provider_id', profile.provider_id,
    'homologation_status', profile.homologation_status,
    'specialties', profile.specialties,
    'service_regions', profile.service_regions,
    'operational_hours', profile.operational_hours,
    'approximate_capacity', profile.approximate_capacity,
    'warranty_policy', profile.warranty_policy,
    'warranty_days', profile.warranty_days,
    'receives_vehicles', profile.receives_vehicles,
    'next_review_at', profile.next_review_at
  ) into result from public.provider_homologation_profiles profile where profile.provider_id = provider_id;
  return coalesce(result, jsonb_build_object('provider_id', provider_id, 'homologation_status', 'candidate'));
end;
$$;

create or replace function public.record_provider_service_completion(
  p_service_request_id uuid, p_service_performed text, p_relevant_items jsonb,
  p_final_amount numeric, p_completed_at timestamptz,
  p_warranty_terms text default null, p_warranty_valid_until date default null,
  p_notes text default null, p_evidence_refs uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); role_name text := (select public.current_verah_role());
  provider_id uuid := (select public.current_verah_provider_id()); request_row public.service_requests%rowtype; result_id uuid;
begin
  select * into request_row from public.service_requests request where request.id = p_service_request_id;
  if actor_id is null or role_name not in ('provider', 'admin') then
    raise exception using errcode = '42501', message = 'Provider completion authorization required.';
  end if;
  if role_name = 'admin' then provider_id := request_row.provider_id; end if;
  if provider_id is null or request_row.provider_id is distinct from provider_id then
    raise exception using errcode = '42501', message = 'Service request does not belong to provider.';
  end if;
  if request_row.operation_context = 'pilot_alpha' and not exists (
    select 1 from public.service_quotes quote
    where quote.service_request_id = request_row.id and quote.provider_id = provider_id
      and quote.status = 'approved' and quote.total_amount = p_final_amount
  ) then
    raise exception using errcode = 'P0001', message = 'Final amount requires an approved quote.';
  end if;
  insert into public.service_completion_records (
    service_request_id, provider_id, service_performed, relevant_items, final_amount,
    completed_at, warranty_terms, warranty_valid_until, notes, evidence_refs, closed_by
  ) values (
    request_row.id, provider_id, p_service_performed, p_relevant_items, p_final_amount,
    p_completed_at, p_warranty_terms, p_warranty_valid_until, p_notes, p_evidence_refs, actor_id
  ) returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.record_provider_performance_event(
  p_provider_id uuid, p_service_request_id uuid, p_event_type text,
  p_metric_value numeric default null, p_metric_unit text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); result_id uuid;
begin
  if actor_id is null or (select public.current_verah_role()) not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Human operations authorization required.';
  end if;
  insert into public.provider_performance_events (
    provider_id, service_request_id, event_type, metric_value, metric_unit, recorded_by
  ) values (
    p_provider_id, p_service_request_id, p_event_type, p_metric_value, p_metric_unit, actor_id
  ) returning id into result_id;
  return result_id;
end;
$$;

create or replace function private.guard_real_provider_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.operation_context = 'pilot_alpha' and new.provider_id is not null
     and not public.provider_is_eligible_for_service(new.provider_id, new.service_category_code, 'pilot_alpha') then
    raise exception using errcode = 'P0001', message = 'Provider is not eligible for this Pilot Alpha service.';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_real_provider_assignment()
  from public, anon, authenticated, service_role;
create trigger service_requests_real_provider_eligibility
before insert or update of provider_id, operation_context, service_category_code on public.service_requests
for each row execute function private.guard_real_provider_assignment();

create or replace function private.guard_real_provider_invitation()
returns trigger language plpgsql set search_path = '' as $$
declare request_row public.service_requests%rowtype;
begin
  select * into request_row from public.service_requests request where request.id = new.service_request_id;
  if request_row.operation_context = 'pilot_alpha'
     and not public.provider_is_eligible_for_service(new.provider_id, request_row.service_category_code, 'pilot_alpha') then
    raise exception using errcode = 'P0001', message = 'Provider is not eligible for this Pilot Alpha invitation.';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_real_provider_invitation()
  from public, anon, authenticated, service_role;
create trigger provider_invitations_real_eligibility
before insert on public.provider_invitations
for each row execute function private.guard_real_provider_invitation();

create or replace function public.provider_mark_service_completed(
  p_service_request_id uuid, p_completion_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); profile_role text; profile_provider_id uuid; request_context text;
begin
  select role, provider_id into profile_role, profile_provider_id from public.user_profiles where user_id = uid;
  if profile_role is distinct from 'admin' and (
    profile_role is distinct from 'provider' or profile_provider_id is null or not exists (
      select 1 from public.service_requests where id = p_service_request_id and provider_id = profile_provider_id
    )
  ) then raise exception 'Atendimento não pertence ao prestador autenticado.'; end if;
  select operation_context into request_context from public.service_requests where id = p_service_request_id;
  if request_context = 'pilot_alpha' and not exists (
    select 1 from public.service_completion_records where service_request_id = p_service_request_id
  ) then raise exception 'Structured completion evidence is required for Pilot Alpha.'; end if;
  return public.provider_mark_service_completed_authorized_impl(p_service_request_id, p_completion_notes);
end;
$$;

revoke all on function public.review_provider_checklist_item(uuid, text, text, uuid, timestamptz, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.upsert_provider_homologation_profile(uuid, text, text, text, jsonb, jsonb, jsonb, text[], text[], jsonb, integer, text, integer, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.set_provider_category_authorization(uuid, text, text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.set_provider_homologation_status(uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.set_provider_operational_block(uuid, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.update_own_provider_operational_profile(jsonb, integer, text, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_own_provider_homologation() from public, anon, authenticated, service_role;
revoke all on function public.record_provider_service_completion(uuid, text, jsonb, numeric, timestamptz, text, date, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.record_provider_performance_event(uuid, uuid, text, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.provider_mark_service_completed(uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.review_provider_checklist_item(uuid, text, text, uuid, timestamptz, text, boolean) to authenticated;
grant execute on function public.upsert_provider_homologation_profile(uuid, text, text, text, jsonb, jsonb, jsonb, text[], text[], jsonb, integer, text, integer, boolean, text) to authenticated;
grant execute on function public.set_provider_category_authorization(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.set_provider_homologation_status(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.set_provider_operational_block(uuid, boolean, text) to authenticated;
grant execute on function public.update_own_provider_operational_profile(jsonb, integer, text, integer, boolean) to authenticated;
grant execute on function public.get_own_provider_homologation() to authenticated;
grant execute on function public.record_provider_service_completion(uuid, text, jsonb, numeric, timestamptz, text, date, text, uuid[]) to authenticated;
grant execute on function public.record_provider_performance_event(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.provider_mark_service_completed(uuid, text) to authenticated;

-- Public provider projection is deliberately column-limited; internal homologation stays private.
revoke select on table public.service_providers from authenticated;
grant select (id, name, trade_name, city, specialties, status, rating) on public.service_providers to authenticated;
drop policy if exists "Authenticated users can read active providers" on public.service_providers;
create policy "Role scoped provider directory"
  on public.service_providers for select to authenticated using (
    (select public.current_verah_role()) in ('concierge', 'admin')
    or ((select public.current_verah_role()) = 'provider' and id = (select public.current_verah_provider_id()))
    or (
      (select public.current_verah_role()) = 'customer'
      and exists (
        select 1 from public.service_requests request
        where request.provider_id = service_providers.id
          and request.customer_id = (select private.current_customer_id())
      )
    )
  );
