create or replace function private.reject_pilot_alpha_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Pilot Alpha consent, custody and audit records are append-only.';
end;
$$;

revoke execute on function private.reject_pilot_alpha_append_only_mutation()
  from public, anon, authenticated, service_role;

create table public.pilot_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.customer_vehicles(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  consent_type text not null,
  consent_version text not null,
  presented_text_hash text not null,
  decision text not null,
  decided_at timestamptz not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source_channel text not null,
  supersedes_receipt_id uuid references public.pilot_consent_receipts(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint pilot_consent_receipts_type_check check (consent_type in (
    'pilot_alpha_participation',
    'vehicle_collection_return',
    'custody_checkin_acknowledgement',
    'route_destination_boundary',
    'separate_service_price_approval'
  )),
  constraint pilot_consent_receipts_version_check check (
    consent_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'
  ),
  constraint pilot_consent_receipts_hash_check check (
    presented_text_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint pilot_consent_receipts_decision_check check (
    decision in ('accepted', 'rejected')
  ),
  constraint pilot_consent_receipts_source_check check (
    source_channel in ('app', 'whatsapp', 'concierge_assisted')
  ),
  constraint pilot_consent_receipts_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint pilot_consent_receipts_no_self_supersession_check check (
    supersedes_receipt_id is null or supersedes_receipt_id <> id
  )
);

create index pilot_consent_receipts_request_type_created_idx
  on public.pilot_consent_receipts (service_request_id, consent_type, created_at desc);
create index pilot_consent_receipts_supersedes_idx
  on public.pilot_consent_receipts (supersedes_receipt_id)
  where supersedes_receipt_id is not null;

create table public.vehicle_custody_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  vehicle_id uuid not null references public.customer_vehicles(id) on delete restrict,
  event_type text not null,
  from_party_type text not null,
  from_party_ref text not null,
  to_party_type text not null,
  to_party_ref text not null,
  authorized_driver_ref text not null,
  occurred_at timestamptz not null,
  location_descriptor text not null,
  odometer_km integer not null,
  fuel_level text not null,
  keys_items text[] not null default '{}',
  visible_damage_notes text,
  evidence_attachment_ids uuid[] not null default '{}',
  occurrence_reported boolean not null default false,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_role text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint vehicle_custody_events_type_check check (event_type in (
    'pickup', 'transfer', 'provider_dropoff', 'provider_pickup', 'return', 'incident_hold'
  )),
  constraint vehicle_custody_events_party_type_check check (
    from_party_type in ('customer', 'verah_driver', 'concierge', 'provider', 'tow_operator')
    and to_party_type in ('customer', 'verah_driver', 'concierge', 'provider', 'tow_operator')
  ),
  constraint vehicle_custody_events_party_ref_check check (
    btrim(from_party_ref) <> '' and length(from_party_ref) <= 120
    and btrim(to_party_ref) <> '' and length(to_party_ref) <= 120
    and btrim(authorized_driver_ref) <> '' and length(authorized_driver_ref) <= 120
  ),
  constraint vehicle_custody_events_location_check check (
    btrim(location_descriptor) <> '' and length(location_descriptor) <= 160
    and location_descriptor !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role)'
  ),
  constraint vehicle_custody_events_odometer_check check (
    odometer_km between 0 and 2000000
  ),
  constraint vehicle_custody_events_fuel_check check (fuel_level in (
    'unknown', 'empty', 'quarter', 'half', 'three_quarters', 'full'
  )),
  constraint vehicle_custody_events_keys_check check (
    cardinality(keys_items) <= 20
  ),
  constraint vehicle_custody_events_damage_check check (
    visible_damage_notes is null
    or (btrim(visible_damage_notes) <> '' and length(visible_damage_notes) <= 1000)
  ),
  constraint vehicle_custody_events_evidence_check check (
    cardinality(evidence_attachment_ids) <= 20
  ),
  constraint vehicle_custody_events_role_check check (
    recorded_role in ('concierge', 'admin')
  ),
  constraint vehicle_custody_events_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  )
);

create index vehicle_custody_events_request_occurred_idx
  on public.vehicle_custody_events (service_request_id, occurred_at, created_at);
create index vehicle_custody_events_vehicle_occurred_idx
  on public.vehicle_custody_events (vehicle_id, occurred_at desc);

create table public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  custody_event_id uuid references public.vehicle_custody_events(id) on delete restrict,
  severity text not null,
  category text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open',
  communication_status text not null default 'pending',
  containment_notes text not null,
  evidence_attachment_ids uuid[] not null default '{}',
  payment_reference text,
  rework boolean not null default false,
  opened_at timestamptz not null,
  closed_at timestamptz,
  opened_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_incidents_severity_check check (severity in ('S0', 'S1', 'S2', 'S3', 'S4')),
  constraint service_incidents_category_check check (
    btrim(category) <> '' and length(category) <= 80
  ),
  constraint service_incidents_status_check check (
    status in ('open', 'contained', 'resolved', 'closed')
  ),
  constraint service_incidents_communication_check check (communication_status in (
    'not_required', 'pending', 'customer_notified', 'provider_notified', 'all_notified'
  )),
  constraint service_incidents_containment_check check (
    btrim(containment_notes) <> '' and length(containment_notes) <= 2000
  ),
  constraint service_incidents_evidence_check check (
    cardinality(evidence_attachment_ids) <= 20
  ),
  constraint service_incidents_payment_ref_check check (
    payment_reference is null
    or (btrim(payment_reference) <> '' and length(payment_reference) <= 120)
  ),
  constraint service_incidents_closed_at_check check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  )
);

create index service_incidents_request_status_idx
  on public.service_incidents (service_request_id, status, severity);
create index service_incidents_owner_status_idx
  on public.service_incidents (owner_user_id, status);

create table public.service_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.service_incidents(id) on delete restrict,
  sequence_number integer not null,
  event_type text not null,
  status_after text not null,
  communication_status_after text not null,
  action_notes text not null,
  evidence_attachment_ids uuid[] not null default '{}',
  rework boolean not null default false,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint service_incident_events_sequence_check check (sequence_number > 0),
  constraint service_incident_events_type_check check (
    event_type in ('opened', 'action_recorded', 'status_changed')
  ),
  constraint service_incident_events_status_check check (
    status_after in ('open', 'contained', 'resolved', 'closed')
  ),
  constraint service_incident_events_communication_check check (communication_status_after in (
    'not_required', 'pending', 'customer_notified', 'provider_notified', 'all_notified'
  )),
  constraint service_incident_events_notes_check check (
    btrim(action_notes) <> '' and length(action_notes) <= 2000
  ),
  constraint service_incident_events_evidence_check check (
    cardinality(evidence_attachment_ids) <= 20
  ),
  constraint service_incident_events_actor_role_check check (
    actor_role in ('concierge', 'admin')
  ),
  constraint service_incident_events_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint service_incident_events_incident_sequence_key unique (incident_id, sequence_number)
);

create index service_incident_events_incident_created_idx
  on public.service_incident_events (incident_id, sequence_number);

create table public.pilot_concierge_time_entries (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  phase text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null,
  rework boolean not null default false,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint pilot_concierge_time_entries_phase_check check (phase in (
    'intake', 'triage', 'provider_coordination', 'pickup', 'quote_review',
    'execution', 'return', 'incident', 'follow_up'
  )),
  constraint pilot_concierge_time_entries_window_check check (
    ended_at >= started_at and duration_minutes between 0 and 10080
  ),
  constraint pilot_concierge_time_entries_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  )
);

create index pilot_concierge_time_entries_request_phase_idx
  on public.pilot_concierge_time_entries (service_request_id, phase, started_at);

alter table public.pilot_consent_receipts enable row level security;
alter table public.vehicle_custody_events enable row level security;
alter table public.service_incidents enable row level security;
alter table public.service_incident_events enable row level security;
alter table public.pilot_concierge_time_entries enable row level security;

revoke all on table public.pilot_consent_receipts from public, anon, authenticated, service_role;
revoke all on table public.vehicle_custody_events from public, anon, authenticated, service_role;
revoke all on table public.service_incidents from public, anon, authenticated, service_role;
revoke all on table public.service_incident_events from public, anon, authenticated, service_role;
revoke all on table public.pilot_concierge_time_entries from public, anon, authenticated, service_role;

grant select on table public.pilot_consent_receipts to authenticated;
grant select on table public.vehicle_custody_events to authenticated;
grant select on table public.service_incidents to authenticated;
grant select on table public.service_incident_events to authenticated;
grant select on table public.pilot_concierge_time_entries to authenticated;

create policy "Customers and operations read pilot consent receipts"
  on public.pilot_consent_receipts for select to authenticated
  using (
    (select public.current_verah_role()) in ('concierge', 'admin')
    or (
      (select public.current_verah_role()) = 'customer'
      and customer_id = (select private.current_customer_id())
    )
  );

create policy "Participants read vehicle custody events"
  on public.vehicle_custody_events for select to authenticated
  using (
    (select public.current_verah_role()) in ('concierge', 'admin')
    or exists (
      select 1 from public.service_requests as request
      where request.id = vehicle_custody_events.service_request_id
        and (
          ((select public.current_verah_role()) = 'customer'
            and (request.created_by = (select auth.uid())
              or request.customer_id = (select private.current_customer_id())))
          or ((select public.current_verah_role()) = 'provider'
            and request.provider_id = (select public.current_verah_provider_id()))
        )
    )
  );

create policy "Participants read service incidents"
  on public.service_incidents for select to authenticated
  using (
    (select public.current_verah_role()) in ('concierge', 'admin')
    or exists (
      select 1 from public.service_requests as request
      where request.id = service_incidents.service_request_id
        and (
          ((select public.current_verah_role()) = 'customer'
            and (request.created_by = (select auth.uid())
              or request.customer_id = (select private.current_customer_id())))
          or ((select public.current_verah_role()) = 'provider'
            and request.provider_id = (select public.current_verah_provider_id()))
        )
    )
  );

create policy "Participants read service incident events"
  on public.service_incident_events for select to authenticated
  using (
    exists (
      select 1
      from public.service_incidents as incident
      join public.service_requests as request on request.id = incident.service_request_id
      where incident.id = service_incident_events.incident_id
        and (
          (select public.current_verah_role()) in ('concierge', 'admin')
          or ((select public.current_verah_role()) = 'customer'
            and (request.created_by = (select auth.uid())
              or request.customer_id = (select private.current_customer_id())))
          or ((select public.current_verah_role()) = 'provider'
            and request.provider_id = (select public.current_verah_provider_id()))
        )
    )
  );

create policy "Operations read pilot concierge time entries"
  on public.pilot_concierge_time_entries for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create trigger pilot_consent_receipts_immutable
before update or delete on public.pilot_consent_receipts
for each row execute function private.reject_pilot_alpha_append_only_mutation();

create trigger vehicle_custody_events_immutable
before update or delete on public.vehicle_custody_events
for each row execute function private.reject_pilot_alpha_append_only_mutation();

create trigger service_incident_events_immutable
before update or delete on public.service_incident_events
for each row execute function private.reject_pilot_alpha_append_only_mutation();

create trigger pilot_concierge_time_entries_immutable
before update or delete on public.pilot_concierge_time_entries
for each row execute function private.reject_pilot_alpha_append_only_mutation();

create or replace function private.has_current_transport_consent(
  p_service_request_id uuid,
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with required(consent_type) as (
    values
      ('pilot_alpha_participation'::text),
      ('vehicle_collection_return'::text),
      ('custody_checkin_acknowledgement'::text),
      ('route_destination_boundary'::text),
      ('separate_service_price_approval'::text)
  )
  select count(*) = 5
  from required
  where exists (
    select 1
    from public.pilot_consent_receipts as receipt
    where receipt.service_request_id = p_service_request_id
      and receipt.vehicle_id = p_vehicle_id
      and receipt.consent_type = required.consent_type
      and receipt.decision = 'accepted'
      and not exists (
        select 1 from public.pilot_consent_receipts as newer
        where newer.supersedes_receipt_id = receipt.id
      )
  );
$$;

revoke execute on function private.has_current_transport_consent(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.record_pilot_consent_receipt(
  p_service_request_id uuid,
  p_consent_type text,
  p_consent_version text,
  p_presented_text_hash text,
  p_decision text,
  p_source_channel text,
  p_supersedes_receipt_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  caller_customer_id uuid := (select private.current_customer_id());
  request_row public.service_requests%rowtype;
  previous_row public.pilot_consent_receipts%rowtype;
  existing_row public.pilot_consent_receipts%rowtype;
  normalized_version text := nullif(pg_catalog.btrim(p_consent_version), '');
  normalized_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_presented_text_hash), ''));
  normalized_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  receipt_id uuid;
begin
  if auth.uid() is null or caller_role not in ('customer', 'concierge', 'admin') then
    raise exception 'Pilot consent requires an authenticated customer or human operator.';
  end if;
  if p_consent_type not in (
      'pilot_alpha_participation', 'vehicle_collection_return',
      'custody_checkin_acknowledgement', 'route_destination_boundary',
      'separate_service_price_approval'
    )
    or normalized_version is null
    or normalized_version !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'
    or normalized_hash is null or normalized_hash !~ '^[0-9a-f]{64}$'
    or p_decision not in ('accepted', 'rejected')
    or p_source_channel not in ('app', 'whatsapp', 'concierge_assisted')
    or normalized_key is null or pg_catalog.length(normalized_key) > 200 then
    raise exception 'Invalid Pilot Alpha consent receipt.';
  end if;

  select * into request_row
  from public.service_requests where id = p_service_request_id;
  if request_row.id is null or request_row.customer_id is null or request_row.vehicle_id is null then
    raise exception 'Pilot consent requires canonical customer and vehicle links.';
  end if;
  if caller_role = 'customer'
    and request_row.customer_id is distinct from caller_customer_id then
    raise exception 'Pilot consent request is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pilot-consent:' || request_row.id::text || ':' || p_consent_type,
      0
    )
  );

  select * into existing_row
  from public.pilot_consent_receipts where idempotency_key = normalized_key;
  if existing_row.id is not null then
    if existing_row.service_request_id = request_row.id
      and existing_row.consent_type = p_consent_type
      and existing_row.consent_version = normalized_version
      and existing_row.presented_text_hash = normalized_hash
      and existing_row.decision = p_decision
      and existing_row.source_channel = p_source_channel
      and existing_row.supersedes_receipt_id is not distinct from p_supersedes_receipt_id then
      return existing_row.id;
    end if;
    raise exception 'Pilot consent idempotency key conflicts with existing input.';
  end if;

  if p_supersedes_receipt_id is not null then
    select * into previous_row
    from public.pilot_consent_receipts where id = p_supersedes_receipt_id;
    if previous_row.id is null
      or previous_row.service_request_id <> request_row.id
      or previous_row.customer_id <> request_row.customer_id
      or previous_row.vehicle_id <> request_row.vehicle_id
      or previous_row.consent_type <> p_consent_type
      or exists (
        select 1 from public.pilot_consent_receipts as newer
        where newer.supersedes_receipt_id = previous_row.id
      ) then
      raise exception 'Consent supersession target is invalid or no longer current.';
    end if;
  elsif exists (
    select 1
    from public.pilot_consent_receipts as current_receipt
    where current_receipt.service_request_id = request_row.id
      and current_receipt.consent_type = p_consent_type
      and not exists (
        select 1 from public.pilot_consent_receipts as newer
        where newer.supersedes_receipt_id = current_receipt.id
      )
  ) then
    raise exception 'Current consent must be explicitly superseded.';
  end if;

  insert into public.pilot_consent_receipts (
    customer_id, vehicle_id, service_request_id, consent_type, consent_version,
    presented_text_hash, decision, decided_at, actor_user_id, source_channel,
    supersedes_receipt_id, idempotency_key
  ) values (
    request_row.customer_id, request_row.vehicle_id, request_row.id,
    p_consent_type, normalized_version, normalized_hash, p_decision,
    pg_catalog.clock_timestamp(), auth.uid(), p_source_channel,
    p_supersedes_receipt_id, normalized_key
  ) returning id into receipt_id;

  return receipt_id;
end;
$$;

create or replace function public.record_vehicle_custody_event(
  p_service_request_id uuid,
  p_event_type text,
  p_from_party_type text,
  p_from_party_ref text,
  p_to_party_type text,
  p_to_party_ref text,
  p_authorized_driver_ref text,
  p_occurred_at timestamptz,
  p_location_descriptor text,
  p_odometer_km integer,
  p_fuel_level text,
  p_keys_items text[],
  p_visible_damage_notes text,
  p_evidence_attachment_ids uuid[],
  p_occurrence_reported boolean,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  request_row public.service_requests%rowtype;
  previous_event public.vehicle_custody_events%rowtype;
  existing_event public.vehicle_custody_events%rowtype;
  normalized_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  custody_event_id uuid;
begin
  if auth.uid() is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Custody events require an authenticated human operator.';
  end if;
  if p_event_type not in ('pickup', 'transfer', 'provider_dropoff', 'provider_pickup', 'return', 'incident_hold')
    or p_from_party_type not in ('customer', 'verah_driver', 'concierge', 'provider', 'tow_operator')
    or p_to_party_type not in ('customer', 'verah_driver', 'concierge', 'provider', 'tow_operator')
    or nullif(pg_catalog.btrim(p_from_party_ref), '') is null
    or nullif(pg_catalog.btrim(p_to_party_ref), '') is null
    or nullif(pg_catalog.btrim(p_authorized_driver_ref), '') is null
    or p_occurred_at is null or p_occurred_at > pg_catalog.clock_timestamp() + interval '5 minutes'
    or nullif(pg_catalog.btrim(p_location_descriptor), '') is null
    or p_odometer_km is null or p_odometer_km not between 0 and 2000000
    or p_fuel_level not in ('unknown', 'empty', 'quarter', 'half', 'three_quarters', 'full')
    or cardinality(coalesce(p_keys_items, '{}'::text[])) > 20
    or cardinality(coalesce(p_evidence_attachment_ids, '{}'::uuid[])) > 20
    or normalized_key is null or pg_catalog.length(normalized_key) > 200 then
    raise exception 'Invalid custody event input.';
  end if;
  if p_event_type in ('pickup', 'return')
    and cardinality(coalesce(p_evidence_attachment_ids, '{}'::uuid[])) = 0 then
    raise exception 'Pickup and return require private evidence references.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-custody:' || p_service_request_id::text, 0)
  );

  select * into request_row
  from public.service_requests where id = p_service_request_id for update;
  if request_row.id is null or request_row.customer_id is null or request_row.vehicle_id is null then
    raise exception 'Custody requires a canonical service request.';
  end if;

  select * into existing_event
  from public.vehicle_custody_events where idempotency_key = normalized_key;
  if existing_event.id is not null then
    if existing_event.service_request_id = request_row.id
      and existing_event.event_type = p_event_type
      and existing_event.odometer_km = p_odometer_km
      and existing_event.occurred_at = p_occurred_at then
      return existing_event.id;
    end if;
    raise exception 'Custody idempotency key conflicts with existing input.';
  end if;
  if request_row.service_stage in ('concluido', 'cancelado') then
    raise exception 'Custody requires an active canonical service request.';
  end if;

  if p_event_type <> 'incident_hold'
    and not private.has_current_transport_consent(request_row.id, request_row.vehicle_id) then
    raise exception 'Current explicit transport consent is required.';
  end if;
  if p_event_type <> 'incident_hold' and exists (
    select 1 from public.service_incidents
    where service_request_id = request_row.id
      and severity in ('S3', 'S4') and status <> 'closed'
  ) then
    raise exception 'Severe incident blocks normal custody progression.';
  end if;

  select * into previous_event
  from public.vehicle_custody_events
  where service_request_id = request_row.id
  order by occurred_at desc, created_at desc, id desc
  limit 1;

  if previous_event.id is null and p_event_type <> 'pickup' then
    raise exception 'Custody chain must start with pickup.';
  elsif previous_event.id is not null then
    if p_occurred_at < previous_event.occurred_at
      or p_odometer_km < previous_event.odometer_km then
      raise exception 'Custody chronology and odometer cannot move backwards.';
    end if;
    if previous_event.event_type = 'return' then
      raise exception 'Returned custody chain is already complete.';
    elsif p_event_type = 'pickup' then
      raise exception 'Custody pickup is already recorded.';
    elsif p_event_type = 'provider_dropoff'
      and previous_event.event_type not in ('pickup', 'transfer', 'incident_hold') then
      raise exception 'Invalid provider dropoff transition.';
    elsif p_event_type = 'provider_pickup'
      and previous_event.event_type not in ('provider_dropoff', 'incident_hold') then
      raise exception 'Invalid provider pickup transition.';
    elsif p_event_type = 'transfer'
      and previous_event.event_type not in ('pickup', 'transfer', 'provider_pickup', 'incident_hold') then
      raise exception 'Invalid custody transfer transition.';
    elsif p_event_type = 'return'
      and previous_event.event_type not in ('provider_pickup', 'transfer', 'incident_hold') then
      raise exception 'Invalid return transition.';
    end if;
  end if;

  insert into public.vehicle_custody_events (
    service_request_id, vehicle_id, event_type,
    from_party_type, from_party_ref, to_party_type, to_party_ref,
    authorized_driver_ref, occurred_at, location_descriptor, odometer_km,
    fuel_level, keys_items, visible_damage_notes, evidence_attachment_ids,
    occurrence_reported, recorded_by, recorded_role, idempotency_key
  ) values (
    request_row.id, request_row.vehicle_id, p_event_type,
    p_from_party_type, pg_catalog.btrim(p_from_party_ref),
    p_to_party_type, pg_catalog.btrim(p_to_party_ref),
    pg_catalog.btrim(p_authorized_driver_ref), p_occurred_at,
    pg_catalog.btrim(p_location_descriptor), p_odometer_km, p_fuel_level,
    coalesce(p_keys_items, '{}'::text[]), nullif(pg_catalog.btrim(p_visible_damage_notes), ''),
    coalesce(p_evidence_attachment_ids, '{}'::uuid[]), coalesce(p_occurrence_reported, false),
    auth.uid(), caller_role, normalized_key
  ) returning id into custody_event_id;

  return custody_event_id;
end;
$$;

create or replace function public.open_service_incident(
  p_service_request_id uuid,
  p_custody_event_id uuid,
  p_severity text,
  p_category text,
  p_owner_user_id uuid,
  p_communication_status text,
  p_containment_notes text,
  p_evidence_attachment_ids uuid[],
  p_payment_reference text,
  p_rework boolean,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  normalized_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  existing_event public.service_incident_events%rowtype;
  incident_id uuid;
begin
  if auth.uid() is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Incidents require an authenticated human operator.';
  end if;
  if p_severity not in ('S0', 'S1', 'S2', 'S3', 'S4')
    or nullif(pg_catalog.btrim(p_category), '') is null
    or p_communication_status not in ('not_required', 'pending', 'customer_notified', 'provider_notified', 'all_notified')
    or nullif(pg_catalog.btrim(p_containment_notes), '') is null
    or cardinality(coalesce(p_evidence_attachment_ids, '{}'::uuid[])) > 20
    or normalized_key is null or pg_catalog.length(normalized_key) > 200 then
    raise exception 'Invalid service incident input.';
  end if;
  if not exists (
    select 1 from public.service_requests
    where id = p_service_request_id and service_stage <> 'cancelado'
  ) or not exists (
    select 1 from public.user_profiles
    where user_id = p_owner_user_id and role in ('concierge', 'admin')
  ) or (p_custody_event_id is not null and not exists (
    select 1 from public.vehicle_custody_events
    where id = p_custody_event_id and service_request_id = p_service_request_id
  )) then
    raise exception 'Incident request, custody event or human owner is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('service-incident:' || normalized_key, 0)
  );
  select * into existing_event
  from public.service_incident_events where idempotency_key = normalized_key;
  if existing_event.id is not null then return existing_event.incident_id; end if;

  insert into public.service_incidents (
    service_request_id, custody_event_id, severity, category, owner_user_id,
    status, communication_status, containment_notes, evidence_attachment_ids,
    payment_reference, rework, opened_at, opened_by
  ) values (
    p_service_request_id, p_custody_event_id, p_severity, pg_catalog.btrim(p_category),
    p_owner_user_id, 'open', p_communication_status, pg_catalog.btrim(p_containment_notes),
    coalesce(p_evidence_attachment_ids, '{}'::uuid[]), nullif(pg_catalog.btrim(p_payment_reference), ''),
    coalesce(p_rework, false), pg_catalog.clock_timestamp(), auth.uid()
  ) returning id into incident_id;

  insert into public.service_incident_events (
    incident_id, sequence_number, event_type, status_after,
    communication_status_after, action_notes, evidence_attachment_ids,
    rework, actor_user_id, actor_role, idempotency_key
  ) values (
    incident_id, 1, 'opened', 'open', p_communication_status,
    pg_catalog.btrim(p_containment_notes), coalesce(p_evidence_attachment_ids, '{}'::uuid[]),
    coalesce(p_rework, false), auth.uid(), caller_role, normalized_key
  );
  return incident_id;
end;
$$;

create or replace function public.record_service_incident_action(
  p_incident_id uuid,
  p_status text,
  p_communication_status text,
  p_action_notes text,
  p_evidence_attachment_ids uuid[],
  p_rework boolean,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  normalized_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  incident_row public.service_incidents%rowtype;
  existing_event public.service_incident_events%rowtype;
  next_sequence integer;
  incident_event_id uuid;
begin
  if auth.uid() is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Incident actions require an authenticated human operator.';
  end if;
  if p_status not in ('open', 'contained', 'resolved', 'closed')
    or p_communication_status not in ('not_required', 'pending', 'customer_notified', 'provider_notified', 'all_notified')
    or nullif(pg_catalog.btrim(p_action_notes), '') is null
    or cardinality(coalesce(p_evidence_attachment_ids, '{}'::uuid[])) > 20
    or normalized_key is null or pg_catalog.length(normalized_key) > 200 then
    raise exception 'Invalid incident action input.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('service-incident-action:' || normalized_key, 0)
  );
  select * into existing_event
  from public.service_incident_events where idempotency_key = normalized_key;
  if existing_event.id is not null then
    if existing_event.incident_id = p_incident_id
      and existing_event.status_after = p_status
      and existing_event.communication_status_after = p_communication_status then
      return existing_event.id;
    end if;
    raise exception 'Incident action idempotency key conflicts with existing input.';
  end if;

  select * into incident_row
  from public.service_incidents where id = p_incident_id for update;
  if incident_row.id is null or incident_row.status = 'closed' then
    raise exception 'Incident is unavailable or already closed.';
  end if;
  if p_status = 'closed'
    and auth.uid() <> incident_row.owner_user_id and caller_role <> 'admin' then
    raise exception 'Only the human incident owner or an admin can close the incident.';
  end if;
  if incident_row.severity in ('S3', 'S4') and p_status = 'closed'
    and incident_row.status <> 'resolved' then
    raise exception 'Severe incidents require contained and resolved human handling before close.';
  end if;
  if (incident_row.status = 'open' and p_status not in ('open', 'contained'))
    or (incident_row.status = 'contained' and p_status not in ('contained', 'resolved'))
    or (incident_row.status = 'resolved' and p_status not in ('resolved', 'closed')) then
    raise exception 'Invalid incident status transition.';
  end if;

  select coalesce(max(sequence_number), 0) + 1 into next_sequence
  from public.service_incident_events where incident_id = incident_row.id;

  update public.service_incidents
  set status = p_status,
      communication_status = p_communication_status,
      rework = rework or coalesce(p_rework, false),
      closed_at = case when p_status = 'closed' then pg_catalog.clock_timestamp() else null end,
      updated_at = pg_catalog.clock_timestamp()
  where id = incident_row.id;

  insert into public.service_incident_events (
    incident_id, sequence_number, event_type, status_after,
    communication_status_after, action_notes, evidence_attachment_ids,
    rework, actor_user_id, actor_role, idempotency_key
  ) values (
    incident_row.id, next_sequence,
    case when p_status = incident_row.status then 'action_recorded' else 'status_changed' end,
    p_status, p_communication_status, pg_catalog.btrim(p_action_notes),
    coalesce(p_evidence_attachment_ids, '{}'::uuid[]), coalesce(p_rework, false),
    auth.uid(), caller_role, normalized_key
  ) returning id into incident_event_id;
  return incident_event_id;
end;
$$;

create or replace function public.record_pilot_concierge_time(
  p_service_request_id uuid,
  p_phase text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_rework boolean,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  normalized_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  existing_entry public.pilot_concierge_time_entries%rowtype;
  minutes_value integer;
  entry_id uuid;
begin
  if auth.uid() is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Pilot time entries require an authenticated human operator.';
  end if;
  if p_phase not in (
      'intake', 'triage', 'provider_coordination', 'pickup', 'quote_review',
      'execution', 'return', 'incident', 'follow_up'
    ) or p_started_at is null or p_ended_at is null or p_ended_at < p_started_at
    or p_ended_at > pg_catalog.clock_timestamp() + interval '5 minutes'
    or normalized_key is null or pg_catalog.length(normalized_key) > 200
    or not exists (select 1 from public.service_requests where id = p_service_request_id) then
    raise exception 'Invalid Pilot Alpha time entry.';
  end if;
  minutes_value := pg_catalog.ceil(
    extract(epoch from (p_ended_at - p_started_at)) / 60.0
  )::integer;
  if minutes_value > 10080 then raise exception 'Pilot Alpha time entry is too large.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pilot-time:' || normalized_key, 0)
  );
  select * into existing_entry
  from public.pilot_concierge_time_entries where idempotency_key = normalized_key;
  if existing_entry.id is not null then
    if existing_entry.service_request_id = p_service_request_id
      and existing_entry.phase = p_phase
      and existing_entry.started_at = p_started_at
      and existing_entry.ended_at = p_ended_at then
      return existing_entry.id;
    end if;
    raise exception 'Pilot time idempotency key conflicts with existing input.';
  end if;

  insert into public.pilot_concierge_time_entries (
    service_request_id, phase, started_at, ended_at, duration_minutes,
    rework, recorded_by, idempotency_key
  ) values (
    p_service_request_id, p_phase, p_started_at, p_ended_at, minutes_value,
    coalesce(p_rework, false), auth.uid(), normalized_key
  ) returning id into entry_id;
  return entry_id;
end;
$$;

create or replace function public.get_pilot_alpha_metrics(p_service_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_role text := (select public.current_verah_role());
  request_row public.service_requests%rowtype;
  minutes_total integer;
  minutes_by_phase jsonb;
  first_pickup_at timestamptz;
  last_return_at timestamptz;
  pickup_odometer integer;
  return_odometer integer;
  severity_counts jsonb;
  incident_count integer;
  rework_value boolean;
begin
  if auth.uid() is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Pilot Alpha metrics require a human operator.';
  end if;
  select * into request_row from public.service_requests where id = p_service_request_id;
  if request_row.id is null then raise exception 'Service request is unavailable.'; end if;

  select coalesce(sum(duration_minutes), 0), coalesce(bool_or(rework), false)
    into minutes_total, rework_value
  from public.pilot_concierge_time_entries where service_request_id = request_row.id;

  select coalesce(pg_catalog.jsonb_object_agg(phase, phase_minutes), '{}'::jsonb)
    into minutes_by_phase
  from (
    select phase, sum(duration_minutes) as phase_minutes
    from public.pilot_concierge_time_entries
    where service_request_id = request_row.id group by phase
  ) as phase_totals;

  select occurred_at, odometer_km into first_pickup_at, pickup_odometer
  from public.vehicle_custody_events
  where service_request_id = request_row.id and event_type = 'pickup'
  order by occurred_at, id limit 1;
  select occurred_at, odometer_km into last_return_at, return_odometer
  from public.vehicle_custody_events
  where service_request_id = request_row.id and event_type = 'return'
  order by occurred_at desc, id desc limit 1;

  select coalesce(pg_catalog.jsonb_object_agg(severity, severity_count), '{}'::jsonb)
    into severity_counts
  from (
    select severity, count(*) as severity_count
    from public.service_incidents
    where service_request_id = request_row.id group by severity
  ) as incident_totals;
  select count(*) into incident_count
  from public.service_incidents where service_request_id = request_row.id;

  select rework_value or exists (
    select 1 from public.service_incidents
    where service_request_id = request_row.id and rework
  ) into rework_value;

  return pg_catalog.jsonb_build_object(
    'service_request_id', request_row.id,
    'concierge_minutes_total', minutes_total,
    'concierge_minutes_by_phase', minutes_by_phase,
    'pickup_return_duration_minutes', case
      when first_pickup_at is null or last_return_at is null then null
      else pg_catalog.ceil(extract(epoch from (last_return_at - first_pickup_at)) / 60.0)::integer
    end,
    'km_during_custody', case
      when pickup_odometer is null or return_odometer is null then null
      else return_odometer - pickup_odometer
    end,
    'incident_count', incident_count,
    'incidents_by_severity', severity_counts,
    'rework_occurred', rework_value,
    'completion_time_minutes', case
      when request_row.completed_at is null then null
      else pg_catalog.ceil(extract(epoch from (request_row.completed_at - request_row.created_at)) / 60.0)::integer
    end,
    'customer_feedback_recorded', request_row.customer_rated_at is not null
      or nullif(pg_catalog.btrim(request_row.customer_feedback), '') is not null
  );
end;
$$;

create or replace function public.concierge_confirm_service_completion(p_service_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  caller_role text := (select public.current_verah_role());
begin
  if uid is null or caller_role not in ('concierge', 'admin') then
    raise exception 'Conclusão exige operador humano autorizado.';
  end if;
  if exists (
    select 1 from public.service_incidents
    where service_request_id = p_service_request_id
      and severity in ('S3', 'S4') and status <> 'closed'
  ) then
    raise exception 'Incidente grave aberto bloqueia a conclusão normal.';
  end if;
  update public.service_requests
  set concierge_confirmed_at = pg_catalog.now(), completed_at = pg_catalog.now(),
      service_stage = 'concluido', updated_at = pg_catalog.now()
  where id = p_service_request_id and service_stage = 'em_execucao'
    and provider_completed_at is not null and concierge_confirmed_at is null;
  if not found then raise exception 'Conclusão indisponível ou já confirmada.'; end if;
  return p_service_request_id;
end;
$$;

revoke all on function public.record_pilot_consent_receipt(uuid, text, text, text, text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_vehicle_custody_event(uuid, text, text, text, text, text, text, timestamptz, text, integer, text, text[], text, uuid[], boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.open_service_incident(uuid, uuid, text, text, uuid, text, text, uuid[], text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_service_incident_action(uuid, text, text, text, uuid[], boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_pilot_concierge_time(uuid, text, timestamptz, timestamptz, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_pilot_alpha_metrics(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.record_pilot_consent_receipt(uuid, text, text, text, text, text, uuid, text)
  to authenticated;
grant execute on function public.record_vehicle_custody_event(uuid, text, text, text, text, text, text, timestamptz, text, integer, text, text[], text, uuid[], boolean, text)
  to authenticated;
grant execute on function public.open_service_incident(uuid, uuid, text, text, uuid, text, text, uuid[], text, boolean, text)
  to authenticated;
grant execute on function public.record_service_incident_action(uuid, text, text, text, uuid[], boolean, text)
  to authenticated;
grant execute on function public.record_pilot_concierge_time(uuid, text, timestamptz, timestamptz, boolean, text)
  to authenticated;
grant execute on function public.get_pilot_alpha_metrics(uuid)
  to authenticated;

comment on table public.pilot_consent_receipts is
  'Immutable versioned consent receipts. Transport consent is independent from quote/payment approval.';
comment on table public.vehicle_custody_events is
  'Append-only controlled custody chain. Evidence fields contain private attachment UUIDs, never public URLs.';
comment on table public.service_incidents is
  'Current human-owned incident projection; all changes are preserved in service_incident_events.';
comment on table public.pilot_concierge_time_entries is
  'Append-only operational time inputs used to derive Pilot Alpha metrics.';
