-- WhatsApp Pilot Alpha readiness. No external workflow or production secret is configured here.

alter table public.customer_channels
  add column consent_source text,
  add column consent_recorded_by uuid references auth.users(id) on delete set null;

create table public.whatsapp_unbound_contacts (
  id uuid primary key default gen_random_uuid(),
  channel_address text not null unique,
  status text not null default 'pending_identity'
    check (status in ('pending_identity', 'bound', 'blocked')),
  bound_customer_id uuid references public.customers(id) on delete restrict,
  bound_customer_channel_id uuid references public.customer_channels(id) on delete restrict,
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel_address ~ '^\+[1-9][0-9]{7,14}$'),
  check (
    status <> 'bound'
    or (bound_customer_id is not null and bound_customer_channel_id is not null
        and resolved_by is not null and resolved_at is not null)
  )
);

create table public.whatsapp_unbound_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.whatsapp_unbound_contacts(id) on delete restrict,
  external_message_id text not null unique,
  message_type text not null check (message_type in ('text', 'image', 'video', 'audio', 'document', 'interactive')),
  body text check (body is null or char_length(body) <= 10000),
  provider_timestamp timestamptz,
  sanitized_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(sanitized_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.whatsapp_outbound_control (
  singleton boolean primary key default true check (singleton),
  outbound_enabled boolean not null default false,
  reason text not null default 'Fail closed until Pilot Alpha human GO',
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
insert into public.whatsapp_outbound_control (singleton) values (true);

create table public.whatsapp_outbound_control_events (
  id uuid primary key default gen_random_uuid(),
  outbound_enabled boolean not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now()
);

create table public.whatsapp_message_templates (
  template_key text primary key,
  purpose text not null,
  required_variables text[] not null default '{}',
  allowed_audience text not null default 'customer' check (allowed_audience = 'customer'),
  sensitive_data_rules text not null,
  allowed_origins text[] not null default '{human,system}',
  requires_service_request boolean not null default true,
  requires_human boolean not null default false,
  active boolean not null default true,
  check (template_key ~ '^[a-z0-9_]{1,80}$'),
  check (allowed_origins <@ array['human', 'system']::text[])
);

insert into public.whatsapp_message_templates (
  template_key, purpose, required_variables, sensitive_data_rules,
  requires_service_request, requires_human
) values
  ('intake_acknowledgement', 'Confirmar recebimento do relato', '{}', 'Sem diagnóstico, documentos, credenciais ou dados financeiros.', false, false),
  ('information_needed', 'Solicitar informação necessária', '{requested_information}', 'Sem diagnóstico, documentos, credenciais ou dados financeiros.', false, false),
  ('quote_available', 'Avisar que o orçamento está disponível', '{service_reference}', 'Não incluir composição interna, credenciais ou dados de cartão.', true, false),
  ('approval_request', 'Solicitar decisão explícita', '{service_reference}', 'Não interpretar resposta como pagamento ou autorização automática.', true, true),
  ('vehicle_status', 'Atualizar marco do atendimento', '{service_reference,status}', 'Sem localização privada, diagnóstico ou evidência privada.', true, false),
  ('pickup_scheduled', 'Confirmar retirada programada', '{service_reference,window}', 'Sem endereço completo fora do escopo da conversa.', true, true),
  ('provider_dropoff', 'Confirmar entrega ao prestador', '{service_reference}', 'Sem ranking ou dados internos do prestador.', true, false),
  ('service_completed', 'Informar conclusão revisada', '{service_reference}', 'Conclusão depende de revisão humana canônica.', true, true),
  ('return_scheduled', 'Confirmar devolução programada', '{service_reference,window}', 'Sem endereço completo fora do escopo da conversa.', true, true),
  ('incident_human_contact', 'Solicitar contato humano em incidente', '{service_reference}', 'Sem diagnóstico, culpa ou encerramento automático de incidente.', true, true);

alter table public.whatsapp_unbound_contacts enable row level security;
alter table public.whatsapp_unbound_messages enable row level security;
alter table public.whatsapp_outbound_control enable row level security;
alter table public.whatsapp_outbound_control_events enable row level security;
alter table public.whatsapp_message_templates enable row level security;

revoke all on table public.whatsapp_unbound_contacts from public, anon, authenticated, service_role;
revoke all on table public.whatsapp_unbound_messages from public, anon, authenticated, service_role;
revoke all on table public.whatsapp_outbound_control from public, anon, authenticated, service_role;
revoke all on table public.whatsapp_outbound_control_events from public, anon, authenticated, service_role;
revoke all on table public.whatsapp_message_templates from public, anon, authenticated, service_role;
grant select on table public.whatsapp_unbound_contacts to authenticated;
grant select on table public.whatsapp_unbound_messages to authenticated;
grant select on table public.whatsapp_outbound_control to authenticated;
grant select on table public.whatsapp_outbound_control_events to authenticated;
grant select on table public.whatsapp_message_templates to authenticated;

create policy "Operations read unbound WhatsApp contacts"
  on public.whatsapp_unbound_contacts for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read unbound WhatsApp messages"
  on public.whatsapp_unbound_messages for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read WhatsApp outbound control"
  on public.whatsapp_outbound_control for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read WhatsApp outbound control history"
  on public.whatsapp_outbound_control_events for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));
create policy "Operations read WhatsApp templates"
  on public.whatsapp_message_templates for select to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create or replace function private.reject_whatsapp_readiness_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'WhatsApp readiness history is append-only';
end;
$$;
revoke execute on function private.reject_whatsapp_readiness_history_mutation()
  from public, anon, authenticated, service_role;
create trigger whatsapp_unbound_messages_immutable
before update or delete on public.whatsapp_unbound_messages
for each row execute function private.reject_whatsapp_readiness_history_mutation();
create trigger whatsapp_outbound_control_events_immutable
before update or delete on public.whatsapp_outbound_control_events
for each row execute function private.reject_whatsapp_readiness_history_mutation();

create or replace function public.persist_whatsapp_inbound_message_safe(
  p_phone text,
  p_external_message_id text,
  p_message_type text,
  p_body text default null,
  p_provider_timestamp timestamptz default null,
  p_sanitized_metadata jsonb default '{}'::jsonb
) returns table (conversation_id uuid, message_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''
  );
  normalized_phone text;
  channel_id uuid;
  contact_id uuid;
  resolved_conversation_id uuid;
  resolved_message_id uuid;
begin
  if request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Server-side authorization required';
  end if;
  normalized_phone := pg_catalog.regexp_replace(pg_catalog.btrim(p_phone), '[[:space:]().-]', '', 'g');
  if normalized_phone is null or normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'A valid E.164 phone number is required';
  end if;
  if nullif(pg_catalog.btrim(p_external_message_id), '') is null
    or p_message_type not in ('text', 'image', 'video', 'audio', 'document', 'interactive')
    or (p_body is not null and pg_catalog.char_length(p_body) > 10000)
    or p_sanitized_metadata is null or pg_catalog.jsonb_typeof(p_sanitized_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid inbound WhatsApp message';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('whatsapp-safe-inbound:' || pg_catalog.btrim(p_external_message_id), 0)
  );
  select message.conversation_id, message.id into resolved_conversation_id, resolved_message_id
  from public.service_messages message
  where message.external_message_id = pg_catalog.btrim(p_external_message_id);
  if resolved_message_id is not null then
    return query select resolved_conversation_id, resolved_message_id, false;
    return;
  end if;
  select message.id into resolved_message_id from public.whatsapp_unbound_messages message
  where message.external_message_id = pg_catalog.btrim(p_external_message_id);
  if resolved_message_id is not null then
    return query select null::uuid, resolved_message_id, false;
    return;
  end if;

  select channel.id into channel_id from public.customer_channels channel
  where channel.channel_type = 'whatsapp' and channel.channel_address = normalized_phone;
  if channel_id is not null then
    return query select * from public.persist_whatsapp_inbound_message(
      normalized_phone, p_external_message_id, p_message_type, p_body,
      p_provider_timestamp, p_sanitized_metadata
    );
    return;
  end if;

  insert into public.whatsapp_unbound_contacts (channel_address)
  values (normalized_phone)
  on conflict (channel_address) do update set updated_at = pg_catalog.now()
  returning id into contact_id;
  insert into public.whatsapp_unbound_messages (
    contact_id, external_message_id, message_type, body, provider_timestamp, sanitized_metadata
  ) values (
    contact_id, pg_catalog.btrim(p_external_message_id), p_message_type,
    p_body, p_provider_timestamp, p_sanitized_metadata
  ) returning id into resolved_message_id;
  return query select null::uuid, resolved_message_id, true;
end;
$$;

create or replace function public.bind_whatsapp_unbound_contact(
  p_contact_id uuid, p_customer_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); contact public.whatsapp_unbound_contacts%rowtype; channel_id uuid;
begin
  if actor_id is null or (select public.current_verah_role()) not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Human operations authorization required';
  end if;
  select * into contact from public.whatsapp_unbound_contacts where id = p_contact_id for update;
  if contact.id is null or contact.status <> 'pending_identity' then
    raise exception using errcode = '22023', message = 'Pending WhatsApp contact not found';
  end if;
  if not exists (select 1 from public.customers customer where customer.id = p_customer_id) then
    raise exception using errcode = '22023', message = 'Customer not found';
  end if;
  insert into public.customer_channels (customer_id, channel_type, channel_address, is_primary)
  values (
    p_customer_id, 'whatsapp', contact.channel_address,
    not exists (
      select 1 from public.customer_channels existing
      where existing.customer_id = p_customer_id and existing.channel_type = 'whatsapp' and existing.is_primary
    )
  )
  on conflict (channel_type, channel_address) do nothing
  returning id into channel_id;
  if channel_id is null then
    select channel.id into channel_id from public.customer_channels channel
    where channel.channel_type = 'whatsapp' and channel.channel_address = contact.channel_address
      and channel.customer_id = p_customer_id;
  end if;
  if channel_id is null then
    raise exception using errcode = '23505', message = 'WhatsApp channel is already bound to another customer';
  end if;
  update public.whatsapp_unbound_contacts
  set status = 'bound', bound_customer_id = p_customer_id,
      bound_customer_channel_id = channel_id, resolved_by = actor_id,
      resolved_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = contact.id;
  return channel_id;
end;
$$;

create or replace function public.record_whatsapp_consent(
  p_customer_id uuid, p_consent_status text, p_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); role_name text := (select public.current_verah_role()); channel_id uuid;
begin
  if actor_id is null or (
    role_name not in ('concierge', 'admin')
    and not (role_name = 'customer' and p_customer_id = (select private.current_customer_id()))
  ) then raise exception using errcode = '42501', message = 'Consent authorization required'; end if;
  if p_consent_status not in ('granted', 'revoked')
    or p_source not in ('customer_opt_in', 'customer_opt_out', 'meta_user_action', 'pilot_onboarding') then
    raise exception using errcode = '22023', message = 'Explicit consent status and source are required';
  end if;
  update public.customer_channels
  set consent_status = p_consent_status, consent_source = p_source,
      consent_recorded_by = actor_id, consent_updated_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where customer_id = p_customer_id and channel_type = 'whatsapp' and is_primary
  returning id into channel_id;
  if channel_id is null then raise exception using errcode = '22023', message = 'Primary WhatsApp channel not found'; end if;
  return channel_id;
end;
$$;

create or replace function public.set_whatsapp_outbound_enabled(
  p_enabled boolean, p_reason text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or (select public.current_verah_role()) <> 'admin' then
    raise exception using errcode = '42501', message = 'Human Admin authorization required';
  end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Control reason is required';
  end if;
  update public.whatsapp_outbound_control
  set outbound_enabled = p_enabled, reason = pg_catalog.btrim(p_reason),
      updated_by = actor_id, updated_at = pg_catalog.now()
  where singleton;
  insert into public.whatsapp_outbound_control_events (outbound_enabled, actor_user_id, reason)
  values (p_enabled, actor_id, pg_catalog.btrim(p_reason));
  return p_enabled;
end;
$$;

create or replace function public.queue_whatsapp_outbound_message_gated(
  p_conversation_id uuid, p_body text, p_idempotency_key text,
  p_template_key text, p_template_variables jsonb,
  p_message_basis text, p_origin text
) returns table (message_id uuid, outbox_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  role_name text := (select public.current_verah_role());
  conversation public.service_conversations%rowtype;
  channel public.customer_channels%rowtype;
  template public.whatsapp_message_templates%rowtype;
  queued record;
begin
  if auth.uid() is null or role_name not in ('concierge', 'admin') then
    raise exception using errcode = '42501', message = 'Human operations authorization required';
  end if;
  if p_origin <> 'human' then
    raise exception using errcode = '42501', message = 'Agent and system proposals require human enqueue';
  end if;
  if not exists (select 1 from public.whatsapp_outbound_control control where control.singleton and control.outbound_enabled) then
    raise exception using errcode = '55000', message = 'WhatsApp outbound kill switch is active';
  end if;
  select * into conversation from public.service_conversations where id = p_conversation_id and status = 'open';
  if conversation.id is null or conversation.customer_channel_id is null then
    raise exception using errcode = '22023', message = 'Bound open conversation required';
  end if;
  select * into channel from public.customer_channels
  where id = conversation.customer_channel_id and channel_type = 'whatsapp'
    and customer_id = conversation.customer_id;
  if channel.id is null then raise exception using errcode = '22023', message = 'Customer channel scope mismatch'; end if;
  select * into template from public.whatsapp_message_templates
  where template_key = p_template_key and active;
  if template.template_key is null or p_template_variables is null
    or pg_catalog.jsonb_typeof(p_template_variables) <> 'object'
    or not template.required_variables <@ array(select pg_catalog.jsonb_object_keys(p_template_variables)) then
    raise exception using errcode = '22023', message = 'Valid WhatsApp template variables are required';
  end if;
  if template.requires_service_request and conversation.service_request_id is null then
    raise exception using errcode = '22023', message = 'Template requires service request scope';
  end if;
  if p_message_basis not in ('transactional', 'consent') then
    raise exception using errcode = '22023', message = 'Valid message basis is required';
  end if;
  if p_message_basis = 'consent' and (
    channel.consent_status <> 'granted' or channel.consent_source is null
  ) then raise exception using errcode = '42501', message = 'Explicit WhatsApp consent is required'; end if;
  if p_template_variables::text ~* '(bearer|authorization|access[_-]?token|cvv|pan|[0-9]{16})' then
    raise exception using errcode = '22023', message = 'Sensitive template variables are forbidden';
  end if;
  select * into queued from public.queue_whatsapp_outbound_message(
    p_conversation_id, p_body, p_idempotency_key
  );
  update public.service_messages
  set sanitized_metadata = pg_catalog.jsonb_build_object(
    'schema_version', 1, 'template_key', p_template_key,
    'message_basis', p_message_basis, 'origin', p_origin
  ) where id = queued.message_id;
  return query select queued.message_id, queued.outbox_id, queued.created;
end;
$$;

create or replace function public.whatsapp_readiness_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'private_media_bucket', exists (
      select 1 from storage.buckets bucket where bucket.id = 'service-attachments' and not bucket.public
    ),
    'outbox_contract', pg_catalog.to_regprocedure('public.claim_whatsapp_outbox(integer,integer)') is not null,
    'outbound_enabled', coalesce((select control.outbound_enabled from public.whatsapp_outbound_control control where control.singleton), false),
    'sanitized_observability', not exists (
      select 1 from public.integration_outbox outbox
      where outbox.destination = 'meta_whatsapp'
        and outbox.payload ?| array['body', 'phone', 'token', 'authorization', 'document', 'pan', 'cvv']
    )
  )
$$;

revoke execute on function public.persist_whatsapp_inbound_message_safe(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.bind_whatsapp_unbound_contact(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.record_whatsapp_consent(uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.set_whatsapp_outbound_enabled(boolean, text) from public, anon, authenticated, service_role;
revoke execute on function public.queue_whatsapp_outbound_message_gated(uuid, text, text, text, jsonb, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.whatsapp_readiness_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.persist_whatsapp_inbound_message_safe(text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.bind_whatsapp_unbound_contact(uuid, uuid) to authenticated;
grant execute on function public.record_whatsapp_consent(uuid, text, text) to authenticated;
grant execute on function public.set_whatsapp_outbound_enabled(boolean, text) to authenticated;
grant execute on function public.queue_whatsapp_outbound_message_gated(uuid, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.whatsapp_readiness_snapshot() to service_role;
