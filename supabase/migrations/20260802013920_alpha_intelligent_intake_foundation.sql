alter table public.customer_vehicles
  add column customer_id uuid references public.customers(id) on delete cascade,
  add column version text,
  add column engine_type text,
  add column transmission text,
  alter column owner_id drop not null;

alter table public.customer_vehicles
  add constraint customer_vehicles_owner_or_customer_check
  check (owner_id is not null or customer_id is not null) not valid;

alter table public.customer_vehicles
  validate constraint customer_vehicles_owner_or_customer_check;

create index customer_vehicles_customer_active_idx
  on public.customer_vehicles (customer_id, active, created_at desc)
  where customer_id is not null;

create unique index customer_vehicles_customer_plate_uidx
  on public.customer_vehicles (
    customer_id,
    upper(regexp_replace(plate, '[^[:alnum:]]', '', 'g'))
  )
  where customer_id is not null and plate is not null and btrim(plate) <> '';

alter table public.service_requests
  add column customer_id uuid references public.customers(id) on delete set null,
  add column conversation_id uuid references public.service_conversations(id) on delete set null,
  add column mileage_snapshot integer;

alter table public.service_requests
  add constraint service_requests_mileage_snapshot_check
  check (mileage_snapshot is null or mileage_snapshot between 0 and 2000000) not valid;

alter table public.service_requests
  validate constraint service_requests_mileage_snapshot_check;

alter table public.service_requests
  drop constraint service_requests_origin_check,
  add constraint service_requests_origin_check
    check (origin in ('customer', 'concierge', 'whatsapp'));

create index service_requests_customer_id_idx
  on public.service_requests (customer_id, created_at desc)
  where customer_id is not null;
create index service_requests_conversation_id_idx
  on public.service_requests (conversation_id)
  where conversation_id is not null;

create table public.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.service_conversations(id) on delete restrict,
  customer_id uuid not null
    references public.customers(id) on delete restrict,
  vehicle_id uuid
    references public.customer_vehicles(id) on delete set null,
  service_request_id uuid
    references public.service_requests(id) on delete set null,
  status text not null default 'started',
  current_step text not null default 'welcome',
  collected_data jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  constraint intake_sessions_status_check check (status in (
    'started', 'collecting_vehicle', 'collecting_mileage',
    'collecting_symptoms', 'collecting_conditions', 'collecting_risk',
    'waiting_customer', 'ready', 'completed', 'cancelled', 'abandoned'
  )),
  constraint intake_sessions_step_check check (current_step in (
    'welcome', 'customer_name', 'vehicle_choice', 'vehicle_brand',
    'vehicle_model', 'vehicle_year', 'vehicle_plate', 'mileage',
    'symptom', 'conditions', 'frequency', 'dashboard_lights',
    'operating_condition', 'urgency', 'location', 'confirmation', 'completed'
  )),
  constraint intake_sessions_collected_data_object_check
    check (jsonb_typeof(collected_data) = 'object'),
  constraint intake_sessions_completion_check check (
    (status = 'completed' and completed_at is not null and service_request_id is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint intake_sessions_abandoned_check check (
    (status = 'abandoned' and abandoned_at is not null)
    or (status <> 'abandoned' and abandoned_at is null)
  ),
  constraint intake_sessions_correlation_key unique (correlation_id)
);

create unique index intake_sessions_one_active_conversation_uidx
  on public.intake_sessions (conversation_id)
  where status not in ('completed', 'cancelled', 'abandoned');
create unique index intake_sessions_service_request_uidx
  on public.intake_sessions (service_request_id)
  where service_request_id is not null;
create index intake_sessions_customer_started_idx
  on public.intake_sessions (customer_id, started_at desc);
create index intake_sessions_vehicle_id_idx
  on public.intake_sessions (vehicle_id)
  where vehicle_id is not null;

alter table public.service_requests
  add column intake_session_id uuid
    references public.intake_sessions(id) on delete set null;

create unique index service_requests_intake_session_uidx
  on public.service_requests (intake_session_id)
  where intake_session_id is not null;

alter table public.service_messages
  add column intake_session_id uuid
    references public.intake_sessions(id) on delete set null,
  add column intake_step text,
  add column intake_processed_at timestamptz;

create index service_messages_intake_session_idx
  on public.service_messages (intake_session_id, created_at)
  where intake_session_id is not null;

create table public.intake_assessments (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null unique
    references public.intake_sessions(id) on delete cascade,
  service_request_id uuid unique
    references public.service_requests(id) on delete set null,
  input_snapshot jsonb not null,
  summary text not null,
  normalized_symptoms jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  risk_level text not null,
  risk_flags jsonb not null default '[]'::jsonb,
  missing_questions jsonb not null default '[]'::jsonb,
  safe_next_step text not null,
  confidence numeric(4,3) not null,
  engine_type text not null default 'deterministic',
  engine_version text not null,
  requires_human_review boolean not null default true,
  human_review_status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint intake_assessments_input_object_check
    check (jsonb_typeof(input_snapshot) = 'object'),
  constraint intake_assessments_arrays_check check (
    jsonb_typeof(normalized_symptoms) = 'array'
    and jsonb_typeof(conditions) = 'array'
    and jsonb_typeof(hypotheses) = 'array'
    and jsonb_typeof(risk_flags) = 'array'
    and jsonb_typeof(missing_questions) = 'array'
  ),
  constraint intake_assessments_risk_check
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint intake_assessments_confidence_check
    check (confidence between 0 and 1),
  constraint intake_assessments_engine_check
    check (engine_type = 'deterministic'),
  constraint intake_assessments_review_required_check
    check (requires_human_review is true),
  constraint intake_assessments_review_status_check
    check (human_review_status in ('pending', 'reviewed', 'rejected')),
  constraint intake_assessments_review_metadata_check check (
    (human_review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (human_review_status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index intake_assessments_request_idx
  on public.intake_assessments (service_request_id)
  where service_request_id is not null;
create index intake_assessments_pending_review_idx
  on public.intake_assessments (created_at)
  where human_review_status = 'pending';

create table public.intake_session_events (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null
    references public.intake_sessions(id) on delete restrict,
  conversation_id uuid not null
    references public.service_conversations(id) on delete restrict,
  message_id uuid
    references public.service_messages(id) on delete set null,
  customer_id uuid not null
    references public.customers(id) on delete restrict,
  vehicle_id uuid
    references public.customer_vehicles(id) on delete set null,
  service_request_id uuid
    references public.service_requests(id) on delete set null,
  correlation_id uuid not null,
  integration text not null default 'whatsapp',
  event text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint intake_session_events_integration_check
    check (integration = 'whatsapp'),
  constraint intake_session_events_event_not_blank_check
    check (btrim(event) <> ''),
  constraint intake_session_events_idempotency_not_blank_check
    check (btrim(idempotency_key) <> ''),
  constraint intake_session_events_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint intake_session_events_idempotency_key unique (idempotency_key)
);

create index intake_session_events_session_created_idx
  on public.intake_session_events (intake_session_id, created_at);
create index intake_session_events_request_created_idx
  on public.intake_session_events (service_request_id, created_at)
  where service_request_id is not null;

alter table public.intake_sessions enable row level security;
alter table public.intake_assessments enable row level security;
alter table public.intake_session_events enable row level security;

revoke all on table public.intake_sessions from public, anon, authenticated, service_role;
revoke all on table public.intake_assessments from public, anon, authenticated, service_role;
revoke all on table public.intake_session_events from public, anon, authenticated, service_role;

grant select on table public.intake_sessions to authenticated;
grant select on table public.intake_assessments to authenticated;
grant select on table public.intake_session_events to authenticated;

create policy "Customers read own intake sessions"
  on public.intake_sessions for select to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and customer_id = (select private.current_customer_id())
  );
create policy "Operations read intake sessions"
  on public.intake_sessions for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Customers read own intake assessments"
  on public.intake_assessments for select to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and exists (
      select 1 from public.intake_sessions as session
      where session.id = intake_assessments.intake_session_id
        and session.customer_id = (select private.current_customer_id())
    )
  );
create policy "Operations read intake assessments"
  on public.intake_assessments for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Customers read own intake events"
  on public.intake_session_events for select to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and customer_id = (select private.current_customer_id())
  );
create policy "Operations read intake events"
  on public.intake_session_events for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

drop policy "Customers and admins read customer vehicles" on public.customer_vehicles;
create policy "Customers and admins read customer vehicles"
  on public.customer_vehicles for select to authenticated
  using (
    (
      (select public.current_verah_role()) = 'customer'
      and (
        owner_id = (select auth.uid())
        or customer_id = (select private.current_customer_id())
      )
    )
    or (select public.current_verah_role()) in ('concierge', 'admin')
  );

drop policy "Customers create own vehicles" on public.customer_vehicles;
create policy "Customers create own vehicles"
  on public.customer_vehicles for insert to authenticated
  with check (
    (select public.current_verah_role()) = 'customer'
    and owner_id = (select auth.uid())
    and (
      customer_id is null
      or customer_id = (select private.current_customer_id())
    )
  );

drop policy "Customers update own vehicles" on public.customer_vehicles;
create policy "Customers update own vehicles"
  on public.customer_vehicles for update to authenticated
  using (
    (select public.current_verah_role()) = 'customer'
    and (
      owner_id = (select auth.uid())
      or customer_id = (select private.current_customer_id())
    )
  )
  with check (
    (select public.current_verah_role()) = 'customer'
    and (
      owner_id = (select auth.uid())
      or customer_id = (select private.current_customer_id())
    )
  );

drop policy "Role scoped service request access" on public.service_requests;
create policy "Role scoped service request access"
  on public.service_requests for select to authenticated
  using (
    (
      (select public.current_verah_role()) = 'customer'
      and (
        created_by = (select auth.uid())
        or customer_id = (select private.current_customer_id())
      )
    )
    or (select public.current_verah_role()) in ('concierge', 'admin')
    or (
      (select public.current_verah_role()) = 'provider'
      and provider_id = (select public.current_verah_provider_id())
    )
  );

grant select (customer_id, conversation_id, intake_session_id, mileage_snapshot)
  on public.service_requests to authenticated;

create or replace function private.intake_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'started' then p_to in ('collecting_vehicle', 'cancelled')
    when 'collecting_vehicle' then p_to in ('collecting_mileage', 'cancelled')
    when 'collecting_mileage' then p_to in ('collecting_symptoms', 'cancelled')
    when 'collecting_symptoms' then p_to in ('collecting_conditions', 'cancelled')
    when 'collecting_conditions' then p_to in ('collecting_risk', 'cancelled')
    when 'collecting_risk' then p_to in ('waiting_customer', 'cancelled')
    when 'waiting_customer' then p_to in ('collecting_symptoms', 'ready', 'cancelled')
    when 'ready' then p_to = 'completed'
    else false
  end
$$;

revoke execute on function private.intake_transition_allowed(text, text)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_intake_session_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled', 'abandoned')
    and new.status is distinct from old.status then
    raise exception using errcode = '55000', message = 'Terminal intake session cannot transition';
  end if;
  if not private.intake_transition_allowed(old.status, new.status) then
    raise exception using errcode = '55000', message = 'Invalid intake session transition';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_intake_session_transition()
  from public, anon, authenticated, service_role;

create trigger intake_sessions_transition_guard
before update of status on public.intake_sessions
for each row execute function private.enforce_intake_session_transition();

create or replace function private.reject_intake_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Intake events are immutable';
end;
$$;

revoke execute on function private.reject_intake_event_mutation()
  from public, anon, authenticated, service_role;

create trigger intake_session_events_immutable
before update or delete on public.intake_session_events
for each row execute function private.reject_intake_event_mutation();

create or replace function public.prepare_intelligent_intake(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_message public.service_messages%rowtype;
  selected_conversation public.service_conversations%rowtype;
  selected_customer public.customers%rowtype;
  selected_session public.intake_sessions%rowtype;
  vehicle_options jsonb;
  attachment_options jsonb;
  was_resumed boolean := false;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_message_id is null then
    raise exception using errcode = '22023', message = 'Message id is required';
  end if;

  select message.* into selected_message
  from public.service_messages as message
  where message.id = p_message_id
    and message.direction = 'inbound'
    and message.sender_role = 'customer';
  if not found then
    raise exception using errcode = '22023', message = 'Inbound customer message not found';
  end if;

  select conversation.* into selected_conversation
  from public.service_conversations as conversation
  where conversation.id = selected_message.conversation_id;

  select customer.* into selected_customer
  from public.customers as customer
  where customer.id = selected_conversation.customer_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('intake-conversation:' || selected_conversation.id::text, 0)
  );

  if selected_message.intake_processed_at is not null then
    select session.* into selected_session
    from public.intake_sessions as session
    where session.id = selected_message.intake_session_id;
  else
    select session.* into selected_session
    from public.intake_sessions as session
    where session.conversation_id = selected_conversation.id
      and session.status not in ('completed', 'cancelled', 'abandoned')
    order by session.started_at desc
    limit 1
    for update;

    if not found then
      insert into public.intake_sessions (conversation_id, customer_id)
      values (selected_conversation.id, selected_conversation.customer_id)
      returning * into selected_session;

      insert into public.intake_session_events (
        intake_session_id, conversation_id, message_id, customer_id,
        correlation_id, event, idempotency_key, payload
      ) values (
        selected_session.id, selected_conversation.id, selected_message.id,
        selected_conversation.customer_id, selected_session.correlation_id,
        'intake.started', 'intake:started:' || selected_session.id::text,
        pg_catalog.jsonb_build_object('schema_version', 1)
      );
    else
      was_resumed := selected_session.updated_at < pg_catalog.now() - interval '30 minutes';
    end if;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', vehicle.id,
    'brand', vehicle.brand,
    'model', vehicle.model,
    'year', vehicle.year,
    'plate', vehicle.plate
  ) order by vehicle.created_at), '[]'::jsonb)
  into vehicle_options
  from public.customer_vehicles as vehicle
  where (
      vehicle.customer_id = selected_customer.id
      or vehicle.owner_id = selected_customer.auth_user_id
    )
    and vehicle.active;

  select coalesce(pg_catalog.jsonb_agg(media_item.metadata order by media_item.created_at), '[]'::jsonb)
  into attachment_options
  from (
    select
      pg_catalog.jsonb_build_object(
        'mediaType', attachment.media_type,
        'mimeType', coalesce(attachment.detected_mime_type, attachment.declared_mime_type)
      ) as metadata,
      attachment.created_at
    from public.service_attachments as attachment
    where attachment.conversation_id = selected_conversation.id
    union all
    select
      pg_catalog.jsonb_build_object(
        'mediaType', message.message_type,
        'mimeType', message.sanitized_metadata ->> 'mime_type'
      ) as metadata,
      message.created_at
    from public.service_messages as message
    where message.conversation_id = selected_conversation.id
      and message.direction = 'inbound'
      and message.message_type in ('image', 'video', 'audio', 'document')
      and not exists (
        select 1 from public.service_attachments as stored
        where stored.message_id = message.id
      )
  ) as media_item;

  return pg_catalog.jsonb_build_object(
    'alreadyProcessed', selected_message.intake_processed_at is not null,
    'messageId', selected_message.id,
    'messageType', selected_message.message_type,
    'messageBody', selected_message.body,
    'conversationId', selected_conversation.id,
    'customerId', selected_customer.id,
    'customerDisplayName', selected_customer.display_name,
    'sessionId', selected_session.id,
    'correlationId', selected_session.correlation_id,
    'status', selected_session.status,
    'currentStep', selected_session.current_step,
    'collectedData', selected_session.collected_data,
    'vehicleId', selected_session.vehicle_id,
    'vehicles', vehicle_options,
    'attachments', attachment_options,
    'resumed', was_resumed,
    'serviceRequestId', selected_session.service_request_id
  );
end;
$$;

revoke execute on function public.prepare_intelligent_intake(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_intelligent_intake(uuid)
  to service_role;

create or replace function public.apply_intelligent_intake_transition(
  p_message_id uuid,
  p_intake_session_id uuid,
  p_expected_status text,
  p_expected_step text,
  p_next_status text,
  p_next_step text,
  p_collected_data jsonb,
  p_response_body text,
  p_vehicle_id uuid default null,
  p_customer_display_name text default null,
  p_assessment jsonb default null,
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  selected_session public.intake_sessions%rowtype;
  selected_message public.service_messages%rowtype;
  selected_customer public.customers%rowtype;
  selected_vehicle public.customer_vehicles%rowtype;
  created_message_id uuid;
  created_request_id uuid;
  created_assessment_id uuid;
  response_key text;
  risk_level text;
  declared_urgency text;
  effective_urgency text;
  event_name text;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  if p_message_id is null or p_intake_session_id is null
    or p_collected_data is null or pg_catalog.jsonb_typeof(p_collected_data) <> 'object'
    or pg_catalog.octet_length(p_collected_data::text) > 65536
    or p_response_body is null or pg_catalog.btrim(p_response_body) = ''
    or pg_catalog.char_length(p_response_body) > 4000 then
    raise exception using errcode = '22023', message = 'Invalid intake transition parameters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('intake-session:' || p_intake_session_id::text, 0)
  );

  select session.* into selected_session
  from public.intake_sessions as session
  where session.id = p_intake_session_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Intake session not found';
  end if;

  select message.* into selected_message
  from public.service_messages as message
  where message.id = p_message_id
  for update;
  if not found
    or selected_message.conversation_id <> selected_session.conversation_id
    or selected_message.direction <> 'inbound'
    or selected_message.sender_role <> 'customer' then
    raise exception using errcode = '22023', message = 'Message does not belong to intake session';
  end if;

  if selected_message.intake_processed_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'duplicate',
      'intakeSessionId', selected_session.id,
      'serviceRequestId', selected_session.service_request_id,
      'vehicleId', selected_session.vehicle_id
    );
  end if;

  if selected_session.status <> p_expected_status
    or selected_session.current_step <> p_expected_step
    or not private.intake_transition_allowed(selected_session.status, p_next_status) then
    raise exception using errcode = '55000', message = 'Stale or invalid intake transition';
  end if;

  if p_vehicle_id is not null then
    select vehicle.* into selected_vehicle
    from public.customer_vehicles as vehicle
    where vehicle.id = p_vehicle_id
      and (
        vehicle.customer_id = selected_session.customer_id
        or vehicle.owner_id = (
          select customer.auth_user_id from public.customers as customer
          where customer.id = selected_session.customer_id
        )
      )
      and vehicle.active;
    if not found then
      raise exception using errcode = '42501', message = 'Vehicle does not belong to customer';
    end if;
    update public.customer_vehicles
      set customer_id = coalesce(customer_id, selected_session.customer_id),
          updated_at = pg_catalog.now()
      where id = selected_vehicle.id;
  end if;

  if p_customer_display_name is not null then
    if pg_catalog.char_length(pg_catalog.btrim(p_customer_display_name)) not between 2 and 120 then
      raise exception using errcode = '22023', message = 'Invalid customer display name';
    end if;
    update public.customers
      set display_name = pg_catalog.btrim(p_customer_display_name),
          updated_at = pg_catalog.now()
      where id = selected_session.customer_id;
  end if;

  update public.intake_sessions
    set status = p_next_status,
        current_step = p_next_step,
        collected_data = p_collected_data,
        vehicle_id = coalesce(p_vehicle_id, vehicle_id),
        updated_at = pg_catalog.now()
    where id = selected_session.id
    returning * into selected_session;

  if p_complete then
    if p_next_status <> 'ready'
      or p_assessment is null
      or pg_catalog.jsonb_typeof(p_assessment) <> 'object'
      or p_assessment ->> 'engineType' <> 'deterministic'
      or coalesce((p_assessment ->> 'requiresHumanReview')::boolean, false) is not true
      or pg_catalog.octet_length(p_assessment::text) > 65536 then
      raise exception using errcode = '22023', message = 'Valid deterministic assessment is required';
    end if;
    if nullif(p_collected_data ->> 'customerName', '') is null
      or nullif(p_collected_data #>> '{vehicle,brand}', '') is null
      or nullif(p_collected_data #>> '{vehicle,model}', '') is null
      or nullif(p_collected_data #>> '{vehicle,year}', '') is null
      or nullif(p_collected_data ->> 'mileage', '') is null
      or nullif(p_collected_data ->> 'symptom', '') is null
      or nullif(p_collected_data ->> 'conditions', '') is null
      or nullif(p_collected_data ->> 'frequency', '') is null
      or nullif(p_collected_data ->> 'dashboardLights', '') is null
      or nullif(p_collected_data ->> 'operatingCondition', '') is null
      or (p_collected_data ->> 'urgency') not in ('baixa', 'media', 'alta', 'critica') then
      raise exception using errcode = '22023', message = 'Required intake fields are missing';
    end if;

    select customer.* into selected_customer
    from public.customers as customer
    where customer.id = selected_session.customer_id;

    if selected_session.vehicle_id is null then
      insert into public.customer_vehicles (
        owner_id, customer_id, brand, model, year, plate, current_mileage,
        city, version, engine_type, transmission
      ) values (
        selected_customer.auth_user_id,
        selected_customer.id,
        p_collected_data #>> '{vehicle,brand}',
        p_collected_data #>> '{vehicle,model}',
        (p_collected_data #>> '{vehicle,year}')::integer,
        nullif(p_collected_data #>> '{vehicle,plate}', ''),
        (p_collected_data ->> 'mileage')::integer,
        nullif(p_collected_data ->> 'location', ''),
        nullif(p_collected_data #>> '{vehicle,version}', ''),
        nullif(p_collected_data #>> '{vehicle,engineType}', ''),
        nullif(p_collected_data #>> '{vehicle,transmission}', '')
      ) returning * into selected_vehicle;
      update public.intake_sessions
        set vehicle_id = selected_vehicle.id
        where id = selected_session.id;
      selected_session.vehicle_id := selected_vehicle.id;
    else
      select vehicle.* into selected_vehicle
      from public.customer_vehicles as vehicle
      where vehicle.id = selected_session.vehicle_id;
      update public.customer_vehicles
        set current_mileage = (p_collected_data ->> 'mileage')::integer,
            updated_at = pg_catalog.now()
        where id = selected_vehicle.id;
    end if;

    risk_level := p_assessment ->> 'riskLevel';
    declared_urgency := p_collected_data ->> 'urgency';
    effective_urgency := case
      when risk_level = 'critical' then 'critica'
      when risk_level = 'high' and declared_urgency in ('baixa', 'media') then 'alta'
      else declared_urgency
    end;

    insert into public.service_requests (
      reference_code, customer_id, conversation_id, intake_session_id,
      customer_name, customer_phone, vehicle_id, vehicle_brand, vehicle_model,
      vehicle_year, vehicle_plate, city, origin, mileage_snapshot,
      customer_report, perceived_urgency, service_stage, probable_category,
      copilot_summary, copilot_questions, copilot_risk_signals,
      copilot_recommended_next_step, copilot_customer_message,
      copilot_concierge_brief, copilot_provider_brief, copilot_confidence,
      requires_human_review, created_by
    ) values (
      'VRH-WA-' || upper(left(replace(selected_session.id::text, '-', ''), 12)),
      selected_customer.id, selected_session.conversation_id, selected_session.id,
      selected_customer.display_name, null, selected_vehicle.id,
      selected_vehicle.brand, selected_vehicle.model, selected_vehicle.year,
      selected_vehicle.plate, coalesce(nullif(p_collected_data ->> 'location', ''), 'A confirmar'),
      'whatsapp', (p_collected_data ->> 'mileage')::integer,
      p_collected_data ->> 'symptom', effective_urgency, 'solicitado',
      coalesce(p_assessment ->> 'probableCategory', 'outro'),
      p_assessment ->> 'summary', coalesce(p_assessment -> 'missingQuestions', '[]'::jsonb),
      coalesce(p_assessment -> 'riskFlags', '[]'::jsonb),
      p_assessment ->> 'safeNextStep',
      'Recebemos suas informações. O Concierge VERAH fará a revisão.',
      p_assessment ->> 'summary', p_assessment ->> 'summary',
      (p_assessment ->> 'confidence')::numeric, true, selected_customer.auth_user_id
    )
    on conflict (intake_session_id) where intake_session_id is not null do nothing
    returning id into created_request_id;

    if created_request_id is null then
      select request.id into created_request_id
      from public.service_requests as request
      where request.intake_session_id = selected_session.id;
    end if;

    insert into public.intake_assessments (
      intake_session_id, service_request_id, input_snapshot, summary,
      normalized_symptoms, conditions, hypotheses, risk_level, risk_flags,
      missing_questions, safe_next_step, confidence, engine_type,
      engine_version, requires_human_review
    ) values (
      selected_session.id, created_request_id, p_assessment -> 'inputSnapshot',
      p_assessment ->> 'summary', p_assessment -> 'normalizedSymptoms',
      p_assessment -> 'conditions', p_assessment -> 'hypotheses', risk_level,
      p_assessment -> 'riskFlags', p_assessment -> 'missingQuestions',
      p_assessment ->> 'safeNextStep', (p_assessment ->> 'confidence')::numeric,
      'deterministic', p_assessment ->> 'engineVersion', true
    )
    on conflict (intake_session_id) do update
      set service_request_id = excluded.service_request_id
    returning id into created_assessment_id;

    update public.service_conversations
      set service_request_id = created_request_id, updated_at = pg_catalog.now()
      where id = selected_session.conversation_id;
    update public.service_attachments
      set service_request_id = created_request_id, updated_at = pg_catalog.now()
      where conversation_id = selected_session.conversation_id
        and service_request_id is null;

    update public.intake_sessions
      set status = 'completed', current_step = 'completed',
          service_request_id = created_request_id,
          completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = selected_session.id
      returning * into selected_session;

    insert into public.service_request_events (
      service_request_id, message_id, event_type, actor_role, channel,
      audience, idempotency_key, payload
    ) values (
      created_request_id, selected_message.id, 'intake.completed', 'system',
      'whatsapp', 'operations', 'service-request:intake:' || selected_session.id::text,
      pg_catalog.jsonb_build_object(
        'schema_version', 1,
        'intake_session_id', selected_session.id,
        'assessment_id', created_assessment_id,
        'correlation_id', selected_session.correlation_id
      )
    ) on conflict (idempotency_key) do nothing;
  end if;

  response_key := 'intake:outbound:' || selected_session.id::text || ':' || selected_message.id::text;
  insert into public.service_messages (
    conversation_id, direction, sender_role, message_type, body,
    idempotency_key, delivery_status, intake_session_id, intake_step
  ) values (
    selected_session.conversation_id, 'outbound', 'system', 'text',
    pg_catalog.btrim(p_response_body), response_key, 'queued',
    selected_session.id, p_next_step
  )
  on conflict (idempotency_key) do nothing
  returning id into created_message_id;

  if created_message_id is null then
    select message.id into created_message_id
    from public.service_messages as message
    where message.idempotency_key = response_key;
  end if;

  insert into public.integration_outbox (
    aggregate_type, aggregate_id, event_type, destination, payload, idempotency_key
  ) values (
    'service_message', created_message_id, 'whatsapp.message.send', 'meta_whatsapp',
    pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'message_id', created_message_id,
      'conversation_id', selected_session.conversation_id,
      'correlation_id', selected_session.correlation_id
    ),
    'meta:' || response_key
  ) on conflict (idempotency_key) do nothing;

  update public.service_messages
    set intake_session_id = selected_session.id,
        intake_step = p_expected_step,
        intake_processed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = selected_message.id;

  event_name := case
    when p_complete then 'intake.completed'
    when p_next_status = 'cancelled' then 'intake.cancelled'
    when p_next_status = p_expected_status and p_next_step = p_expected_step then 'intake.invalid_answer'
    else 'intake.advanced'
  end;

  insert into public.intake_session_events (
    intake_session_id, conversation_id, message_id, customer_id, vehicle_id,
    service_request_id, correlation_id, event, idempotency_key, payload
  ) values (
    selected_session.id, selected_session.conversation_id, selected_message.id,
    selected_session.customer_id, selected_session.vehicle_id,
    selected_session.service_request_id, selected_session.correlation_id,
    event_name, 'intake:message:' || selected_message.id::text,
    pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'from_status', p_expected_status,
      'to_status', selected_session.status,
      'from_step', p_expected_step,
      'to_step', selected_session.current_step
    )
  ) on conflict (idempotency_key) do nothing;

  return pg_catalog.jsonb_build_object(
    'status', selected_session.status,
    'intakeSessionId', selected_session.id,
    'serviceRequestId', selected_session.service_request_id,
    'vehicleId', selected_session.vehicle_id
  );
end;
$$;

revoke execute on function public.apply_intelligent_intake_transition(
  uuid, uuid, text, text, text, text, jsonb, text, uuid, text, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.apply_intelligent_intake_transition(
  uuid, uuid, text, text, text, text, jsonb, text, uuid, text, jsonb, boolean
) to service_role;
