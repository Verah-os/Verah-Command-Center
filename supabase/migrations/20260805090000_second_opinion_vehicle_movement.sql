create table public.second_opinion_requests (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  review_provider_id uuid not null references public.service_providers(id) on delete restrict,
  eligibility_assessment_id uuid not null references public.quote_quality_assessments(id) on delete restrict,
  eligibility_justification text not null,
  request_reason text not null,
  idempotency_key text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint second_opinion_requests_justification_check check (
    btrim(eligibility_justification) <> ''
    and length(eligibility_justification) <= 500
  ),
  constraint second_opinion_requests_reason_check check (
    btrim(request_reason) <> '' and length(request_reason) <= 1000
  ),
  constraint second_opinion_requests_sanitized_check check (
    (eligibility_justification || ' ' || request_reason) !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
  ),
  constraint second_opinion_requests_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint second_opinion_requests_revision_provider_key unique (revision_id, review_provider_id),
  constraint second_opinion_requests_idempotency_key unique (idempotency_key)
);

create table public.second_opinion_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.second_opinion_requests(id) on delete restrict,
  sequence_number smallint not null,
  event_type text not null,
  result_outcome text,
  note text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint second_opinion_events_type_check check (
    event_type in ('requested', 'accepted', 'declined', 'result_submitted')
  ),
  constraint second_opinion_events_sequence_check check (
    (event_type = 'requested' and sequence_number = 1)
    or (event_type in ('accepted', 'declined') and sequence_number = 2)
    or (event_type = 'result_submitted' and sequence_number = 3)
  ),
  constraint second_opinion_events_outcome_check check (
    result_outcome is null
    or result_outcome in ('supports_scope', 'questions_scope', 'professional_assessment_required')
  ),
  constraint second_opinion_events_actor_role_check check (
    actor_role in ('concierge', 'provider', 'admin')
  ),
  constraint second_opinion_events_state_payload_check check (
    (event_type = 'requested' and result_outcome is null and note is null)
    or (event_type = 'accepted' and result_outcome is null)
    or (event_type = 'declined' and result_outcome is null and nullif(btrim(note), '') is not null)
    or (event_type = 'result_submitted' and result_outcome is not null and nullif(btrim(note), '') is not null)
  ),
  constraint second_opinion_events_note_check check (
    note is null or (length(note) <= 1000 and note !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})')
  ),
  constraint second_opinion_events_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint second_opinion_events_request_sequence_key unique (request_id, sequence_number),
  constraint second_opinion_events_idempotency_key unique (idempotency_key)
);

create table public.vehicle_movement_guidance (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  second_opinion_request_id uuid references public.second_opinion_requests(id) on delete restrict,
  guidance_code text not null,
  internal_reason text not null,
  customer_message text not null,
  human_confirmed_by uuid not null references auth.users(id) on delete restrict,
  human_confirmed_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint vehicle_movement_guidance_code_check check (
    guidance_code in ('do_not_move', 'tow_recommended', 'professional_assessment_required')
  ),
  constraint vehicle_movement_guidance_reason_check check (
    btrim(internal_reason) <> ''
    and length(internal_reason) <= 1000
    and internal_reason !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
  ),
  constraint vehicle_movement_guidance_message_check check (
    btrim(customer_message) <> ''
    and length(customer_message) <= 500
    and customer_message !~* '(segur[oa] para|pode circular|autorizad[oa] a circular)'
  ),
  constraint vehicle_movement_guidance_human_check check (
    human_confirmed_at is not null
  ),
  constraint vehicle_movement_guidance_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint vehicle_movement_guidance_idempotency_key unique (idempotency_key)
);

create index second_opinion_requests_request_created_idx
  on public.second_opinion_requests (service_request_id, created_at desc);
create index second_opinion_requests_provider_created_idx
  on public.second_opinion_requests (review_provider_id, created_at desc);
create index second_opinion_events_request_created_idx
  on public.second_opinion_events (request_id, sequence_number);
create index vehicle_movement_guidance_request_created_idx
  on public.vehicle_movement_guidance (service_request_id, created_at desc);
create index vehicle_movement_guidance_second_opinion_idx
  on public.vehicle_movement_guidance (second_opinion_request_id)
  where second_opinion_request_id is not null;

alter table public.second_opinion_requests enable row level security;
alter table public.second_opinion_events enable row level security;
alter table public.vehicle_movement_guidance enable row level security;

revoke all on table public.second_opinion_requests from public, anon, authenticated, service_role;
revoke all on table public.second_opinion_events from public, anon, authenticated, service_role;
revoke all on table public.vehicle_movement_guidance from public, anon, authenticated, service_role;

grant select on table public.second_opinion_requests to authenticated;
grant select on table public.second_opinion_events to authenticated;
grant select on table public.vehicle_movement_guidance to authenticated;

create policy "Providers read participating second opinion requests"
  on public.second_opinion_requests
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and review_provider_id = (select public.current_verah_provider_id())
  );

create policy "Operations read second opinion requests"
  on public.second_opinion_requests
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Providers read participating second opinion events"
  on public.second_opinion_events
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and exists (
      select 1
      from public.second_opinion_requests as request
      where request.id = second_opinion_events.request_id
        and request.review_provider_id = (select public.current_verah_provider_id())
    )
  );

create policy "Operations read second opinion events"
  on public.second_opinion_events
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read vehicle movement guidance"
  on public.vehicle_movement_guidance
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create or replace function private.reject_second_opinion_artifact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Second opinion and vehicle movement records are append-only.';
end;
$$;

revoke execute on function private.reject_second_opinion_artifact_mutation()
  from public, anon, authenticated, service_role;

create trigger second_opinion_requests_immutable
before update or delete on public.second_opinion_requests
for each row execute function private.reject_second_opinion_artifact_mutation();

create trigger second_opinion_events_immutable
before update or delete on public.second_opinion_events
for each row execute function private.reject_second_opinion_artifact_mutation();

create trigger vehicle_movement_guidance_immutable
before update or delete on public.vehicle_movement_guidance
for each row execute function private.reject_second_opinion_artifact_mutation();

create or replace function public.request_second_opinion(
  p_revision_id uuid,
  p_review_provider_id uuid,
  p_eligibility_assessment_id uuid,
  p_eligibility_justification text,
  p_request_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  normalized_justification text := nullif(pg_catalog.btrim(p_eligibility_justification), '');
  normalized_reason text := nullif(pg_catalog.btrim(p_request_reason), '');
  revision_row public.service_quote_revisions%rowtype;
  existing_request public.second_opinion_requests%rowtype;
  request_id uuid;
begin
  if operational_role is null
    or operational_role not in ('concierge', 'admin')
    or auth.uid() is null then
    raise exception 'Requesting a second opinion requires an authenticated human operator.';
  end if;

  if p_revision_id is null or p_review_provider_id is null or p_eligibility_assessment_id is null
    or effective_key is null or pg_catalog.length(effective_key) > 200
    or normalized_justification is null or pg_catalog.length(normalized_justification) > 500
    or normalized_reason is null or pg_catalog.length(normalized_reason) > 1000 then
    raise exception 'Invalid second opinion request input.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'second-opinion:' || p_revision_id::text || ':' || p_review_provider_id::text,
      0
    )
  );

  select * into revision_row
  from public.service_quote_revisions
  where id = p_revision_id;

  if revision_row.id is null then
    raise exception 'Quote revision does not exist.';
  end if;

  if exists (
    select 1
    from public.service_quote_revisions as newer
    where newer.quote_id = revision_row.quote_id
      and newer.revision_number > revision_row.revision_number
  ) then
    raise exception 'Second opinion cannot reference a stale quote revision.';
  end if;

  if p_review_provider_id = revision_row.provider_id
    or not exists (
      select 1 from public.service_providers as provider
      where provider.id = p_review_provider_id and provider.status = 'active'
    ) then
    raise exception 'Second opinion provider must be a different active provider.';
  end if;

  if not exists (
    select 1
    from public.quote_quality_assessments as assessment
    where assessment.id = p_eligibility_assessment_id
      and assessment.revision_id = revision_row.id
      and assessment.second_opinion_eligibility
      and assessment.id = (
        select latest.id
        from public.quote_quality_assessments as latest
        where latest.revision_id = revision_row.id
        order by latest.created_at desc, latest.id desc
        limit 1
      )
  ) then
    raise exception 'Latest quote assessment does not authorize second opinion eligibility.';
  end if;

  select * into existing_request
  from public.second_opinion_requests
  where idempotency_key = effective_key
     or (revision_id = p_revision_id and review_provider_id = p_review_provider_id)
  order by (idempotency_key = effective_key) desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.revision_id = p_revision_id
      and existing_request.review_provider_id = p_review_provider_id
      and existing_request.eligibility_assessment_id = p_eligibility_assessment_id
      and existing_request.eligibility_justification = normalized_justification
      and existing_request.request_reason = normalized_reason then
      return existing_request.id;
    end if;
    raise exception 'Second opinion idempotency key or revision participation conflicts with existing input.';
  end if;

  insert into public.second_opinion_requests (
    revision_id, service_request_id, review_provider_id,
    eligibility_assessment_id, eligibility_justification, request_reason,
    idempotency_key, requested_by
  ) values (
    revision_row.id, revision_row.service_request_id, p_review_provider_id,
    p_eligibility_assessment_id, normalized_justification, normalized_reason,
    effective_key, auth.uid()
  ) returning id into request_id;

  insert into public.second_opinion_events (
    request_id, sequence_number, event_type, actor_user_id, actor_role, idempotency_key
  ) values (
    request_id, 1, 'requested', auth.uid(), operational_role,
    'second-opinion:' || request_id::text || ':requested'
  );

  insert into public.service_request_events (
    service_request_id, event_type, actor_user_id, actor_role,
    channel, audience, payload, idempotency_key
  ) values (
    revision_row.service_request_id, 'second_opinion.requested', auth.uid(), operational_role,
    'app', 'operations',
    pg_catalog.jsonb_build_object('second_opinion_request_id', request_id, 'revision_id', revision_row.id),
    'second-opinion-timeline:' || request_id::text || ':requested'
  ) on conflict (idempotency_key) do nothing;

  return request_id;
end;
$$;

create or replace function public.respond_to_second_opinion(
  p_request_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_provider_id uuid := (select public.current_verah_provider_id());
  effective_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  normalized_note text := nullif(pg_catalog.btrim(p_note), '');
  request_row public.second_opinion_requests%rowtype;
  latest_event text;
  existing_event public.second_opinion_events%rowtype;
  event_id uuid;
begin
  if operational_role <> 'provider' or auth.uid() is null or effective_provider_id is null then
    raise exception 'Only the participating provider can answer a second opinion request.';
  end if;
  if p_decision is null or p_decision not in ('accepted', 'declined')
    or effective_key is null or pg_catalog.length(effective_key) > 200
    or (p_decision = 'declined' and normalized_note is null)
    or pg_catalog.length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'Invalid second opinion response input.';
  end if;

  select * into request_row
  from public.second_opinion_requests
  where id = p_request_id
  for share;

  if request_row.id is null or request_row.review_provider_id <> effective_provider_id then
    raise exception 'Second opinion request is unavailable to this provider.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('second-opinion-state:' || request_row.id::text, 0)
  );

  select * into existing_event
  from public.second_opinion_events
  where idempotency_key = effective_key;
  if existing_event.id is not null then
    if existing_event.request_id = request_row.id
      and existing_event.event_type = p_decision
      and existing_event.note is not distinct from normalized_note then
      return existing_event.id;
    end if;
    raise exception 'Second opinion response idempotency key conflicts with existing input.';
  end if;

  select event_type into latest_event
  from public.second_opinion_events
  where request_id = request_row.id
  order by sequence_number desc
  limit 1;
  if latest_event <> 'requested' then
    raise exception 'Second opinion request has already been answered.';
  end if;

  insert into public.second_opinion_events (
    request_id, sequence_number, event_type, note, actor_user_id, actor_role, idempotency_key
  ) values (
    request_row.id, 2, p_decision, normalized_note, auth.uid(), 'provider', effective_key
  ) returning id into event_id;

  insert into public.service_request_events (
    service_request_id, event_type, actor_user_id, actor_role,
    channel, audience, payload, idempotency_key
  ) values (
    request_row.service_request_id, 'second_opinion.' || p_decision,
    auth.uid(), 'provider', 'app', 'operations',
    pg_catalog.jsonb_build_object('second_opinion_request_id', request_row.id),
    'second-opinion-timeline:' || event_id::text
  ) on conflict (idempotency_key) do nothing;

  return event_id;
end;
$$;

create or replace function public.submit_second_opinion_result(
  p_request_id uuid,
  p_result_outcome text,
  p_result_summary text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_provider_id uuid := (select public.current_verah_provider_id());
  effective_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  normalized_summary text := nullif(pg_catalog.btrim(p_result_summary), '');
  request_row public.second_opinion_requests%rowtype;
  latest_event text;
  existing_event public.second_opinion_events%rowtype;
  event_id uuid;
begin
  if operational_role <> 'provider' or auth.uid() is null or effective_provider_id is null then
    raise exception 'Only the participating provider can submit a second opinion result.';
  end if;
  if p_result_outcome is null
    or p_result_outcome not in ('supports_scope', 'questions_scope', 'professional_assessment_required')
    or normalized_summary is null or pg_catalog.length(normalized_summary) > 1000
    or effective_key is null or pg_catalog.length(effective_key) > 200 then
    raise exception 'Invalid second opinion result input.';
  end if;

  select * into request_row
  from public.second_opinion_requests
  where id = p_request_id
  for share;
  if request_row.id is null or request_row.review_provider_id <> effective_provider_id then
    raise exception 'Second opinion request is unavailable to this provider.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('second-opinion-state:' || request_row.id::text, 0)
  );

  select * into existing_event
  from public.second_opinion_events
  where idempotency_key = effective_key;
  if existing_event.id is not null then
    if existing_event.request_id = request_row.id
      and existing_event.event_type = 'result_submitted'
      and existing_event.result_outcome = p_result_outcome
      and existing_event.note = normalized_summary then
      return existing_event.id;
    end if;
    raise exception 'Second opinion result idempotency key conflicts with existing input.';
  end if;

  select event_type into latest_event
  from public.second_opinion_events
  where request_id = request_row.id
  order by sequence_number desc
  limit 1;
  if latest_event <> 'accepted' then
    raise exception 'Second opinion result requires an accepted request.';
  end if;

  insert into public.second_opinion_events (
    request_id, sequence_number, event_type, result_outcome, note,
    actor_user_id, actor_role, idempotency_key
  ) values (
    request_row.id, 3, 'result_submitted', p_result_outcome, normalized_summary,
    auth.uid(), 'provider', effective_key
  ) returning id into event_id;

  insert into public.service_request_events (
    service_request_id, event_type, actor_user_id, actor_role,
    channel, audience, payload, idempotency_key
  ) values (
    request_row.service_request_id, 'second_opinion.result_submitted',
    auth.uid(), 'provider', 'app', 'operations',
    pg_catalog.jsonb_build_object(
      'second_opinion_request_id', request_row.id,
      'result_outcome', p_result_outcome
    ),
    'second-opinion-timeline:' || event_id::text
  ) on conflict (idempotency_key) do nothing;

  return event_id;
end;
$$;

create or replace function public.record_vehicle_movement_guidance(
  p_revision_id uuid,
  p_second_opinion_request_id uuid,
  p_guidance_code text,
  p_internal_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  normalized_reason text := nullif(pg_catalog.btrim(p_internal_reason), '');
  revision_row public.service_quote_revisions%rowtype;
  existing_guidance public.vehicle_movement_guidance%rowtype;
  customer_message_value text;
  guidance_id uuid;
begin
  if operational_role is null
    or operational_role not in ('concierge', 'admin')
    or auth.uid() is null then
    raise exception 'Vehicle movement guidance requires an authenticated human operator.';
  end if;
  if p_guidance_code is null
    or p_guidance_code not in ('do_not_move', 'tow_recommended', 'professional_assessment_required')
    or normalized_reason is null or pg_catalog.length(normalized_reason) > 1000
    or effective_key is null or pg_catalog.length(effective_key) > 200 then
    raise exception 'Invalid vehicle movement guidance input.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicle-movement:' || effective_key, 0)
  );

  select * into revision_row
  from public.service_quote_revisions
  where id = p_revision_id;
  if revision_row.id is null then
    raise exception 'Quote revision does not exist.';
  end if;
  if exists (
    select 1 from public.service_quote_revisions as newer
    where newer.quote_id = revision_row.quote_id
      and newer.revision_number > revision_row.revision_number
  ) then
    raise exception 'Vehicle movement guidance cannot reference a stale quote revision.';
  end if;

  if p_second_opinion_request_id is not null and not exists (
    select 1
    from public.second_opinion_requests as request
    where request.id = p_second_opinion_request_id
      and request.revision_id = revision_row.id
      and exists (
        select 1 from public.second_opinion_events as event
        where event.request_id = request.id and event.event_type = 'result_submitted'
      )
  ) then
    raise exception 'Linked second opinion must be completed for this revision.';
  end if;

  customer_message_value := case p_guidance_code
    when 'do_not_move' then 'Não movimente o veículo. Aguarde orientação de um profissional qualificado.'
    when 'tow_recommended' then 'Não conduza o veículo. Um profissional deve confirmar o transporte adequado; guincho é recomendado.'
    else 'Não há confirmação de segurança para circulação. Uma avaliação profissional presencial é obrigatória antes de qualquer movimentação.'
  end;

  select * into existing_guidance
  from public.vehicle_movement_guidance
  where idempotency_key = effective_key;
  if existing_guidance.id is not null then
    if existing_guidance.revision_id = revision_row.id
      and existing_guidance.second_opinion_request_id is not distinct from p_second_opinion_request_id
      and existing_guidance.guidance_code = p_guidance_code
      and existing_guidance.internal_reason = normalized_reason then
      return existing_guidance.id;
    end if;
    raise exception 'Vehicle movement guidance idempotency key conflicts with existing input.';
  end if;

  insert into public.vehicle_movement_guidance (
    revision_id, service_request_id, second_opinion_request_id,
    guidance_code, internal_reason, customer_message,
    human_confirmed_by, human_confirmed_at, idempotency_key
  ) values (
    revision_row.id, revision_row.service_request_id, p_second_opinion_request_id,
    p_guidance_code, normalized_reason, customer_message_value,
    auth.uid(), pg_catalog.now(), effective_key
  ) returning id into guidance_id;

  insert into public.service_request_events (
    service_request_id, event_type, actor_user_id, actor_role,
    channel, audience, payload, idempotency_key
  ) values (
    revision_row.service_request_id, 'vehicle_movement.guidance_recorded',
    auth.uid(), operational_role, 'app', 'customer',
    pg_catalog.jsonb_build_object(
      'guidance_id', guidance_id,
      'guidance_code', p_guidance_code,
      'message', customer_message_value,
      'human_confirmed', true
    ),
    'vehicle-movement-timeline:' || guidance_id::text
  ) on conflict (idempotency_key) do nothing;

  return guidance_id;
end;
$$;

create or replace function public.get_second_opinion_case(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_provider_id uuid := (select public.current_verah_provider_id());
  request_row public.second_opinion_requests%rowtype;
  current_state text;
  timeline jsonb;
  guidance jsonb;
begin
  select * into request_row
  from public.second_opinion_requests
  where id = p_request_id;
  if request_row.id is null then
    raise exception 'Second opinion case is unavailable.';
  end if;

  if operational_role = 'customer' then
    if not exists (
      select 1 from public.service_requests as request
      where request.id = request_row.service_request_id
        and (request.created_by = auth.uid() or request.customer_id = (select private.current_customer_id()))
    ) then
      raise exception 'Second opinion case is unavailable.';
    end if;
  elsif operational_role = 'provider' then
    if effective_provider_id is null or effective_provider_id <> request_row.review_provider_id then
      raise exception 'Second opinion case is unavailable.';
    end if;
  elsif operational_role is null or operational_role not in ('concierge', 'admin') then
    raise exception 'Second opinion case is unavailable.';
  end if;

  select event_type into current_state
  from public.second_opinion_events
  where request_id = request_row.id
  order by sequence_number desc
  limit 1;

  select pg_catalog.jsonb_agg(
    case
      when operational_role in ('concierge', 'admin') or operational_role = 'provider' then
        pg_catalog.jsonb_build_object(
          'event_type', event.event_type,
          'result_outcome', event.result_outcome,
          'note', event.note,
          'created_at', event.created_at
        )
      else
        pg_catalog.jsonb_build_object(
          'event_type', event.event_type,
          'result_available', event.event_type = 'result_submitted',
          'created_at', event.created_at
        )
    end
    order by event.sequence_number
  ) into timeline
  from public.second_opinion_events as event
  where event.request_id = request_row.id;

  select pg_catalog.jsonb_build_object(
    'guidance_code', movement.guidance_code,
    'message', movement.customer_message,
    'human_confirmed_at', movement.human_confirmed_at
  ) into guidance
  from public.vehicle_movement_guidance as movement
  join public.service_quote_revisions as revision on revision.id = movement.revision_id
  where movement.second_opinion_request_id = request_row.id
    and not exists (
      select 1 from public.service_quote_revisions as newer
      where newer.quote_id = revision.quote_id
        and newer.revision_number > revision.revision_number
    )
  order by movement.created_at desc, movement.id desc
  limit 1;

  if operational_role = 'customer' then
    return pg_catalog.jsonb_build_object(
      'request_id', request_row.id,
      'revision_id', request_row.revision_id,
      'status', current_state,
      'timeline', coalesce(timeline, '[]'::jsonb),
      'vehicle_movement', guidance
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'request_id', request_row.id,
    'revision_id', request_row.revision_id,
    'service_request_id', request_row.service_request_id,
    'review_provider_id', request_row.review_provider_id,
    'eligibility_assessment_id', request_row.eligibility_assessment_id,
    'eligibility_justification', request_row.eligibility_justification,
    'request_reason', request_row.request_reason,
    'status', current_state,
    'timeline', coalesce(timeline, '[]'::jsonb),
    'vehicle_movement', guidance
  );
end;
$$;

create or replace function public.get_vehicle_movement_guidance(p_service_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  effective_provider_id uuid := (select public.current_verah_provider_id());
  guidance_row public.vehicle_movement_guidance%rowtype;
begin
  if operational_role = 'customer' then
    if not exists (
      select 1 from public.service_requests as request
      where request.id = p_service_request_id
        and (request.created_by = auth.uid() or request.customer_id = (select private.current_customer_id()))
    ) then
      raise exception 'Vehicle movement guidance is unavailable.';
    end if;
  elsif operational_role = 'provider' then
    if not exists (
      select 1
      from public.second_opinion_requests as request
      where request.service_request_id = p_service_request_id
        and request.review_provider_id = effective_provider_id
    ) then
      raise exception 'Vehicle movement guidance is unavailable.';
    end if;
  elsif operational_role is null or operational_role not in ('concierge', 'admin') then
    raise exception 'Vehicle movement guidance is unavailable.';
  end if;

  select movement.* into guidance_row
  from public.vehicle_movement_guidance as movement
  join public.service_quote_revisions as revision on revision.id = movement.revision_id
  where movement.service_request_id = p_service_request_id
    and not exists (
      select 1 from public.service_quote_revisions as newer
      where newer.quote_id = revision.quote_id
        and newer.revision_number > revision.revision_number
    )
    and (
      operational_role <> 'provider'
      or exists (
        select 1 from public.second_opinion_requests as request
        where request.id = movement.second_opinion_request_id
          and request.review_provider_id = effective_provider_id
      )
    )
  order by movement.created_at desc, movement.id desc
  limit 1;
  if guidance_row.id is null then
    raise exception 'Vehicle movement guidance is unavailable.';
  end if;

  if operational_role in ('concierge', 'admin') then
    return pg_catalog.jsonb_build_object(
      'guidance_id', guidance_row.id,
      'revision_id', guidance_row.revision_id,
      'second_opinion_request_id', guidance_row.second_opinion_request_id,
      'guidance_code', guidance_row.guidance_code,
      'message', guidance_row.customer_message,
      'internal_reason', guidance_row.internal_reason,
      'human_confirmed_by', guidance_row.human_confirmed_by,
      'human_confirmed_at', guidance_row.human_confirmed_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'guidance_id', guidance_row.id,
    'revision_id', guidance_row.revision_id,
    'guidance_code', guidance_row.guidance_code,
    'message', guidance_row.customer_message,
    'human_confirmed_at', guidance_row.human_confirmed_at
  );
end;
$$;

revoke all on function public.request_second_opinion(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.respond_to_second_opinion(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_second_opinion_result(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_vehicle_movement_guidance(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_second_opinion_case(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_vehicle_movement_guidance(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.request_second_opinion(uuid, uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.respond_to_second_opinion(uuid, text, text, text)
  to authenticated;
grant execute on function public.submit_second_opinion_result(uuid, text, text, text)
  to authenticated;
grant execute on function public.record_vehicle_movement_guidance(uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.get_second_opinion_case(uuid)
  to authenticated;
grant execute on function public.get_vehicle_movement_guidance(uuid)
  to authenticated;
