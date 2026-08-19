create table public.provider_invitations (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  version integer not null,
  status text not null default 'pending',
  briefing jsonb not null,
  expires_at timestamptz not null,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_invitations_version_check check (version > 0),
  constraint provider_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'revoked', 'expired', 'selected')
  ),
  constraint provider_invitations_briefing_check check (
    jsonb_typeof(briefing) = 'object'
    and length(briefing::text) between 2 and 4000
    and briefing::text !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
  ),
  constraint provider_invitations_expiry_check check (expires_at > created_at),
  constraint provider_invitations_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint provider_invitations_version_key unique (service_request_id, provider_id, version),
  constraint provider_invitations_idempotency_key unique (idempotency_key)
);

create unique index provider_invitations_open_provider_uidx
  on public.provider_invitations (service_request_id, provider_id)
  where status in ('pending', 'accepted');
create index provider_invitations_provider_expiry_idx
  on public.provider_invitations (provider_id, expires_at desc);
create index provider_invitations_request_created_idx
  on public.provider_invitations (service_request_id, created_at desc);

create table public.provider_invitation_responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.provider_invitations(id) on delete restrict,
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  decision text not null,
  note text,
  idempotency_key text not null,
  responded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint provider_invitation_responses_decision_check check (decision in ('accepted', 'declined')),
  constraint provider_invitation_responses_note_check check (
    (decision = 'accepted' or nullif(btrim(note), '') is not null)
    and (note is null or (
      length(note) <= 1000
      and note !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
    ))
  ),
  constraint provider_invitation_responses_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint provider_invitation_responses_invitation_key unique (invitation_id),
  constraint provider_invitation_responses_idempotency_key unique (idempotency_key)
);

create table public.provider_invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.provider_invitations(id) on delete restrict,
  sequence_number integer not null,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint provider_invitation_events_sequence_check check (sequence_number > 0),
  constraint provider_invitation_events_type_check check (
    event_type in ('invited', 'accepted', 'declined', 'revoked', 'expired', 'selected')
  ),
  constraint provider_invitation_events_actor_role_check check (
    actor_role in ('concierge', 'provider', 'admin', 'system')
  ),
  constraint provider_invitation_events_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint provider_invitation_events_sequence_key unique (invitation_id, sequence_number),
  constraint provider_invitation_events_idempotency_key unique (idempotency_key)
);

create index provider_invitation_events_invitation_idx
  on public.provider_invitation_events (invitation_id, sequence_number);

create table public.provider_selections (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  invitation_id uuid not null references public.provider_invitations(id) on delete restrict,
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  rationale text not null,
  idempotency_key text not null,
  selected_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint provider_selections_rationale_check check (
    btrim(rationale) <> '' and length(rationale) <= 1000
    and rationale !~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
  ),
  constraint provider_selections_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint provider_selections_request_key unique (service_request_id),
  constraint provider_selections_invitation_key unique (invitation_id),
  constraint provider_selections_idempotency_key unique (idempotency_key)
);

alter table public.provider_invitations enable row level security;
alter table public.provider_invitation_responses enable row level security;
alter table public.provider_invitation_events enable row level security;
alter table public.provider_selections enable row level security;

revoke all on table public.provider_invitations from public, anon, authenticated, service_role;
revoke all on table public.provider_invitation_responses from public, anon, authenticated, service_role;
revoke all on table public.provider_invitation_events from public, anon, authenticated, service_role;
revoke all on table public.provider_selections from public, anon, authenticated, service_role;

grant select on table public.provider_invitations to authenticated;
grant select on table public.provider_invitation_responses to authenticated;
grant select on table public.provider_invitation_events to authenticated;
grant select on table public.provider_selections to authenticated;

create policy "Providers read only their valid invitations"
  on public.provider_invitations for select to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and provider_id = (select public.current_verah_provider_id())
    and (
      status = 'selected'
      or (status in ('pending', 'accepted') and expires_at > pg_catalog.clock_timestamp())
    )
  );
create policy "Operations read provider invitations"
  on public.provider_invitations for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Providers read only their invitation response"
  on public.provider_invitation_responses for select to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and exists (
      select 1 from public.provider_invitations as invitation
      where invitation.id = provider_invitation_responses.invitation_id
        and invitation.provider_id = (select public.current_verah_provider_id())
        and (
          invitation.status = 'selected'
          or (invitation.status = 'accepted' and invitation.expires_at > pg_catalog.clock_timestamp())
        )
    )
  );
create policy "Operations read provider invitation responses"
  on public.provider_invitation_responses for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read provider invitation events"
  on public.provider_invitation_events for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read provider selections"
  on public.provider_selections for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create or replace function private.guard_provider_invitation_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Provider invitations cannot be deleted.';
  end if;
  if row(old.id, old.service_request_id, old.revision_id, old.provider_id, old.version,
         old.briefing, old.expires_at, old.idempotency_key, old.created_by, old.created_at)
     is distinct from
     row(new.id, new.service_request_id, new.revision_id, new.provider_id, new.version,
         new.briefing, new.expires_at, new.idempotency_key, new.created_by, new.created_at) then
    raise exception 'Provider invitation identity is immutable.';
  end if;
  if not (
    (old.status = 'pending' and new.status in ('accepted', 'declined', 'revoked', 'expired'))
    or (old.status = 'accepted' and new.status in ('selected', 'revoked', 'expired'))
  ) then
    raise exception 'Invalid provider invitation state transition.';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.reject_provider_invitation_artifact_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Provider invitation audit records are append-only.';
end;
$$;

revoke execute on function private.guard_provider_invitation_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_provider_invitation_artifact_mutation()
  from public, anon, authenticated, service_role;

create trigger provider_invitations_guard
before update or delete on public.provider_invitations
for each row execute function private.guard_provider_invitation_mutation();
create trigger provider_invitation_responses_immutable
before update or delete on public.provider_invitation_responses
for each row execute function private.reject_provider_invitation_artifact_mutation();
create trigger provider_invitation_events_immutable
before update or delete on public.provider_invitation_events
for each row execute function private.reject_provider_invitation_artifact_mutation();
create trigger provider_selections_immutable
before update or delete on public.provider_selections
for each row execute function private.reject_provider_invitation_artifact_mutation();

create or replace function private.append_provider_invitation_event(
  p_invitation_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_idempotency_key text
) returns uuid language plpgsql set search_path = '' as $$
declare event_id uuid;
begin
  insert into public.provider_invitation_events (
    invitation_id, sequence_number, event_type, actor_user_id, actor_role, idempotency_key
  ) values (
    p_invitation_id,
    coalesce((select max(event.sequence_number) + 1 from public.provider_invitation_events as event where event.invitation_id = p_invitation_id), 1),
    p_event_type, p_actor_user_id, p_actor_role, p_idempotency_key
  ) returning id into event_id;
  return event_id;
end;
$$;
revoke execute on function private.append_provider_invitation_event(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.invite_service_provider(
  p_service_request_id uuid,
  p_revision_id uuid,
  p_provider_id uuid,
  p_briefing jsonb,
  p_expires_at timestamptz,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := (select public.current_verah_role());
  request_row public.service_requests%rowtype;
  revision_row public.service_quote_revisions%rowtype;
  existing_row public.provider_invitations%rowtype;
  next_version integer;
  invitation_id uuid;
begin
  if actor_id is null or actor_role not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Provider invitation requires Concierge or Admin.';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200
    or p_briefing is null or jsonb_typeof(p_briefing) <> 'object'
    or length(p_briefing::text) > 4000
    or p_briefing::text ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
    or p_expires_at <= pg_catalog.clock_timestamp()
    or p_expires_at > pg_catalog.clock_timestamp() + interval '30 days' then
    raise exception using errcode = '22023', message = 'Invalid provider invitation input.';
  end if;

  select * into request_row from public.service_requests where id = p_service_request_id for update;
  if not found or request_row.service_stage in ('concluido', 'cancelado') then
    raise exception using errcode = 'P0002', message = 'Service request is unavailable for invitations.';
  end if;
  select * into existing_row from public.provider_invitations where idempotency_key = btrim(p_idempotency_key);
  if found then
    if existing_row.service_request_id = p_service_request_id
      and existing_row.revision_id = p_revision_id
      and existing_row.provider_id = p_provider_id
      and existing_row.briefing = p_briefing
      and existing_row.expires_at = p_expires_at then
      return existing_row.id;
    end if;
    raise exception using errcode = '23505', message = 'Provider invitation idempotency conflict.';
  end if;
  select * into revision_row from public.service_quote_revisions where id = p_revision_id;
  if not found or revision_row.service_request_id <> request_row.id
    or exists (
      select 1 from public.service_quote_revisions as newer
      where newer.quote_id = revision_row.quote_id
        and newer.revision_number > revision_row.revision_number
    ) then
    raise exception using errcode = '22023', message = 'Invitation must reference the latest revision for this request.';
  end if;
  if revision_row.provider_id = p_provider_id or not exists (
    select 1 from public.service_providers as provider
    where provider.id = p_provider_id and provider.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Review provider is invalid.';
  end if;

  select * into existing_row
  from public.provider_invitations
  where service_request_id = p_service_request_id and provider_id = p_provider_id
    and status in ('pending', 'accepted')
  for update;
  if found and existing_row.expires_at > pg_catalog.clock_timestamp() then
    raise exception using errcode = '23505', message = 'Provider already has an active invitation.';
  elsif found then
    update public.provider_invitations set status = 'expired' where id = existing_row.id;
    perform private.append_provider_invitation_event(
      existing_row.id, 'expired', actor_id, actor_role,
      'provider-invitation-expired:' || existing_row.id::text
    );
  end if;

  select coalesce(max(invitation.version), 0) + 1 into next_version
  from public.provider_invitations as invitation
  where invitation.service_request_id = p_service_request_id and invitation.provider_id = p_provider_id;

  insert into public.provider_invitations (
    service_request_id, revision_id, provider_id, version, briefing,
    expires_at, idempotency_key, created_by
  ) values (
    p_service_request_id, p_revision_id, p_provider_id, next_version, p_briefing,
    p_expires_at, btrim(p_idempotency_key), actor_id
  ) returning id into invitation_id;
  perform private.append_provider_invitation_event(
    invitation_id, 'invited', actor_id, actor_role, 'event:' || btrim(p_idempotency_key)
  );
  return invitation_id;
end;
$$;

create or replace function public.respond_to_provider_invitation(
  p_invitation_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  provider_id uuid := (select public.current_verah_provider_id());
  invitation_row public.provider_invitations%rowtype;
  existing_response public.provider_invitation_responses%rowtype;
  response_id uuid;
begin
  if actor_id is null or (select public.current_verah_role()) <> 'provider' or provider_id is null then
    raise exception using errcode = '42501', message = 'Provider authentication is required.';
  end if;
  if p_decision not in ('accepted', 'declined')
    or (p_decision = 'declined' and nullif(btrim(p_note), '') is null)
    or (p_note is not null and (length(p_note) > 1000 or p_note ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'))
    or p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid provider invitation response.';
  end if;

  select * into existing_response from public.provider_invitation_responses where idempotency_key = btrim(p_idempotency_key);
  if found then
    select * into invitation_row from public.provider_invitations where id = existing_response.invitation_id;
    if invitation_row.provider_id = provider_id and existing_response.invitation_id = p_invitation_id
      and existing_response.decision = p_decision and existing_response.note is not distinct from nullif(btrim(p_note), '') then
      return existing_response.id;
    end if;
    raise exception using errcode = '23505', message = 'Provider response idempotency conflict.';
  end if;

  select * into invitation_row from public.provider_invitations where id = p_invitation_id for update;
  if not found or invitation_row.provider_id <> provider_id
    or invitation_row.status <> 'pending'
    or invitation_row.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501', message = 'Provider invitation is not valid.';
  end if;

  insert into public.provider_invitation_responses (
    invitation_id, revision_id, decision, note, idempotency_key, responded_by
  ) values (
    invitation_row.id, invitation_row.revision_id, p_decision, nullif(btrim(p_note), ''),
    btrim(p_idempotency_key), actor_id
  ) returning id into response_id;
  update public.provider_invitations set status = p_decision where id = invitation_row.id;
  perform private.append_provider_invitation_event(
    invitation_row.id, p_decision, actor_id, 'provider', 'event:' || btrim(p_idempotency_key)
  );
  return response_id;
end;
$$;

create or replace function public.revoke_provider_invitation(
  p_invitation_id uuid,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := (select public.current_verah_role());
  invitation_row public.provider_invitations%rowtype;
  event_row public.provider_invitation_events%rowtype;
begin
  if actor_id is null or actor_role not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Invitation revocation requires Concierge or Admin.';
  end if;
  select * into event_row from public.provider_invitation_events where idempotency_key = btrim(p_idempotency_key);
  if found then
    if event_row.invitation_id = p_invitation_id and event_row.event_type = 'revoked' then return p_invitation_id; end if;
    raise exception using errcode = '23505', message = 'Invitation revocation idempotency conflict.';
  end if;
  select * into invitation_row from public.provider_invitations where id = p_invitation_id for update;
  if not found or invitation_row.status not in ('pending', 'accepted')
    or invitation_row.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'Invitation cannot be revoked.';
  end if;
  update public.provider_invitations set status = 'revoked' where id = invitation_row.id;
  perform private.append_provider_invitation_event(
    invitation_row.id, 'revoked', actor_id, actor_role, btrim(p_idempotency_key)
  );
  return invitation_row.id;
end;
$$;

create or replace function public.select_provider_invitation(
  p_invitation_id uuid,
  p_rationale text,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := (select public.current_verah_role());
  invitation_row public.provider_invitations%rowtype;
  request_row public.service_requests%rowtype;
  existing_selection public.provider_selections%rowtype;
  competing_row record;
  selection_id uuid;
begin
  if actor_id is null or actor_role not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Provider selection requires Concierge or Admin.';
  end if;
  if p_rationale is null or btrim(p_rationale) = '' or length(p_rationale) > 1000
    or p_rationale ~* '([[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|bearer[[:space:]]+|authorization|service[_-]?role|[0-9]{7,})'
    or p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'Invalid provider selection input.';
  end if;
  select * into existing_selection from public.provider_selections where idempotency_key = btrim(p_idempotency_key);
  if found then
    if existing_selection.invitation_id = p_invitation_id and existing_selection.rationale = btrim(p_rationale) then
      return existing_selection.id;
    end if;
    raise exception using errcode = '23505', message = 'Provider selection idempotency conflict.';
  end if;
  select * into invitation_row from public.provider_invitations where id = p_invitation_id;
  if not found then raise exception using errcode = 'P0002', message = 'Provider invitation not found.'; end if;
  select * into request_row from public.service_requests where id = invitation_row.service_request_id for update;
  select * into invitation_row from public.provider_invitations where id = p_invitation_id for update;
  if invitation_row.status <> 'accepted'
    or invitation_row.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'Only a valid accepted invitation can be selected.';
  end if;
  if request_row.service_stage in ('concluido', 'cancelado')
    or exists (select 1 from public.provider_selections where service_request_id = request_row.id) then
    raise exception using errcode = '23505', message = 'Service request already has a final provider selection.';
  end if;

  insert into public.provider_selections (
    service_request_id, invitation_id, revision_id, provider_id,
    rationale, idempotency_key, selected_by
  ) values (
    invitation_row.service_request_id, invitation_row.id, invitation_row.revision_id,
    invitation_row.provider_id, btrim(p_rationale), btrim(p_idempotency_key), actor_id
  ) returning id into selection_id;
  update public.provider_invitations set status = 'selected' where id = invitation_row.id;
  perform private.append_provider_invitation_event(
    invitation_row.id, 'selected', actor_id, actor_role, 'event:' || btrim(p_idempotency_key)
  );

  for competing_row in
    select id from public.provider_invitations
    where service_request_id = invitation_row.service_request_id
      and id <> invitation_row.id and status in ('pending', 'accepted')
    for update
  loop
    update public.provider_invitations set status = 'revoked' where id = competing_row.id;
    perform private.append_provider_invitation_event(
      competing_row.id, 'revoked', actor_id, actor_role,
      'selection-revoked:' || selection_id::text || ':' || competing_row.id::text
    );
  end loop;

  update public.service_requests set
    provider_id = invitation_row.provider_id,
    provider_assigned_at = pg_catalog.now(),
    provider_assigned_by = actor_id,
    service_stage = 'prestador_indicado',
    updated_at = pg_catalog.now()
  where id = invitation_row.service_request_id;

  insert into public.service_request_events (
    service_request_id, event_type, actor_user_id, actor_role,
    channel, audience, idempotency_key, payload
  ) values (
    invitation_row.service_request_id, 'provider.selected', actor_id, actor_role,
    'app', 'operations', 'provider-selection:' || btrim(p_idempotency_key),
    pg_catalog.jsonb_build_object('selection_id', selection_id, 'invitation_id', invitation_row.id)
  );
  return selection_id;
end;
$$;

revoke all on function public.invite_service_provider(uuid, uuid, uuid, jsonb, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.respond_to_provider_invitation(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_provider_invitation(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.select_provider_invitation(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.invite_service_provider(uuid, uuid, uuid, jsonb, timestamptz, text) to authenticated;
grant execute on function public.respond_to_provider_invitation(uuid, text, text, text) to authenticated;
grant execute on function public.revoke_provider_invitation(uuid, text) to authenticated;
grant execute on function public.select_provider_invitation(uuid, text, text) to authenticated;
