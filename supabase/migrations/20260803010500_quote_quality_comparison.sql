create table public.service_quote_revisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.service_quotes(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  revision_number integer not null,
  commercial_scope text not null,
  snapshot jsonb not null,
  content_hash text not null,
  idempotency_key text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint service_quote_revisions_number_check check (revision_number > 0),
  constraint service_quote_revisions_scope_check check (
    commercial_scope in (
      'product_only',
      'service_only',
      'installation_only',
      'product_and_installation'
    )
  ),
  constraint service_quote_revisions_snapshot_object_check check (
    jsonb_typeof(snapshot) = 'object'
  ),
  constraint service_quote_revisions_hash_check check (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint service_quote_revisions_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint service_quote_revisions_quote_number_key unique (quote_id, revision_number),
  constraint service_quote_revisions_quote_id_id_key unique (quote_id, id),
  constraint service_quote_revisions_idempotency_key unique (idempotency_key)
);

create table public.quote_quality_assessments (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  assessment_version text not null default 'quote-quality-alpha-1',
  normalized_scope_key text not null,
  scope_completeness smallint not null,
  evidence_quality smallint not null,
  diagnosis_quality smallint not null,
  parts_detail_quality smallint not null,
  labor_detail_quality smallint not null,
  warranty_quality smallint not null,
  price_breakdown_quality smallint not null,
  second_opinion_eligibility boolean not null default false,
  classification text not null,
  missing_fields jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  caveats jsonb not null default '[]'::jsonb,
  human_confirmed_by uuid references auth.users(id) on delete restrict,
  human_confirmed_at timestamptz,
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint quote_quality_assessments_version_check check (btrim(assessment_version) <> ''),
  constraint quote_quality_assessments_scope_key_check check (
    normalized_scope_key ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
  ),
  constraint quote_quality_assessments_score_check check (
    scope_completeness between 0 and 100
    and evidence_quality between 0 and 100
    and diagnosis_quality between 0 and 100
    and parts_detail_quality between 0 and 100
    and labor_detail_quality between 0 and 100
    and warranty_quality between 0 and 100
    and price_breakdown_quality between 0 and 100
  ),
  constraint quote_quality_assessments_classification_check check (
    classification in (
      'insufficient',
      'weak',
      'usable_with_caveats',
      'comparison_ready',
      'technically_confirmed'
    )
  ),
  constraint quote_quality_assessments_arrays_check check (
    jsonb_typeof(missing_fields) = 'array'
    and jsonb_typeof(exclusions) = 'array'
    and jsonb_typeof(caveats) = 'array'
  ),
  constraint quote_quality_assessments_human_confirmation_check check (
    (
      classification = 'technically_confirmed'
      and human_confirmed_by is not null
      and human_confirmed_at is not null
    )
    or (
      classification <> 'technically_confirmed'
      and human_confirmed_by is null
      and human_confirmed_at is null
    )
  ),
  constraint quote_quality_assessments_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint quote_quality_assessments_idempotency_key unique (idempotency_key)
);

create table public.quote_comparison_sets (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  status text not null default 'draft',
  normalized_scope_key text not null,
  commercial_scope text not null,
  ranking_basis text not null,
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quote_comparison_sets_status_check check (
    status in ('draft', 'published', 'withdrawn')
  ),
  constraint quote_comparison_sets_scope_key_check check (
    normalized_scope_key ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
  ),
  constraint quote_comparison_sets_commercial_scope_check check (
    commercial_scope in (
      'product_only',
      'service_only',
      'installation_only',
      'product_and_installation'
    )
  ),
  constraint quote_comparison_sets_ranking_basis_check check (
    btrim(ranking_basis) <> ''
    and lower(btrim(ranking_basis)) not in ('lowest_price', 'price_only', 'menor_preco')
  ),
  constraint quote_comparison_sets_publication_check check (
    (status = 'draft' and reviewed_by is null and published_at is null and withdrawn_at is null)
    or (status = 'published' and reviewed_by is not null and published_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and reviewed_by is not null and published_at is not null and withdrawn_at is not null)
  ),
  constraint quote_comparison_sets_idempotency_check check (
    btrim(idempotency_key) <> '' and length(idempotency_key) <= 200
  ),
  constraint quote_comparison_sets_idempotency_key unique (idempotency_key)
);

create table public.quote_comparison_members (
  id uuid primary key default gen_random_uuid(),
  comparison_set_id uuid not null references public.quote_comparison_sets(id) on delete restrict,
  revision_id uuid not null references public.service_quote_revisions(id) on delete restrict,
  display_order integer not null,
  public_label text not null,
  differences jsonb not null,
  created_at timestamptz not null default now(),
  constraint quote_comparison_members_order_check check (display_order > 0),
  constraint quote_comparison_members_label_check check (
    public_label ~ '^Proposta [A-Z]$'
  ),
  constraint quote_comparison_members_differences_check check (
    jsonb_typeof(differences) = 'object'
    and differences ? 'commercial_scope'
    and differences ? 'parts'
    and differences ? 'warranty'
    and differences ? 'price_breakdown'
  ),
  constraint quote_comparison_members_set_revision_key unique (comparison_set_id, revision_id),
  constraint quote_comparison_members_set_order_key unique (comparison_set_id, display_order)
);

create index service_quote_revisions_request_created_idx
  on public.service_quote_revisions (service_request_id, created_at desc);
create index service_quote_revisions_provider_created_idx
  on public.service_quote_revisions (provider_id, created_at desc);
create index quote_quality_assessments_revision_created_idx
  on public.quote_quality_assessments (revision_id, created_at desc);
create index quote_quality_assessments_classification_idx
  on public.quote_quality_assessments (classification);
create index quote_comparison_sets_request_created_idx
  on public.quote_comparison_sets (service_request_id, created_at desc);
create index quote_comparison_sets_published_idx
  on public.quote_comparison_sets (service_request_id, published_at desc)
  where status = 'published';
create index quote_comparison_members_revision_idx
  on public.quote_comparison_members (revision_id);

alter table public.service_quotes
  add column approved_revision_id uuid;

alter table public.service_quotes
  add constraint service_quotes_approved_revision_same_quote_fk
  foreign key (id, approved_revision_id)
  references public.service_quote_revisions (quote_id, id)
  on delete restrict;

alter table public.service_quote_revisions enable row level security;
alter table public.quote_quality_assessments enable row level security;
alter table public.quote_comparison_sets enable row level security;
alter table public.quote_comparison_members enable row level security;

revoke all on table public.service_quote_revisions from public, anon, authenticated;
revoke all on table public.quote_quality_assessments from public, anon, authenticated;
revoke all on table public.quote_comparison_sets from public, anon, authenticated;
revoke all on table public.quote_comparison_members from public, anon, authenticated;

grant select on table public.service_quote_revisions to authenticated, service_role;
grant select on table public.quote_quality_assessments to authenticated, service_role;
grant select on table public.quote_comparison_sets to authenticated, service_role;
grant select on table public.quote_comparison_members to authenticated, service_role;

create policy "Providers read own quote revisions"
  on public.service_quote_revisions
  for select
  to authenticated
  using (
    (select public.current_verah_role()) = 'provider'
    and provider_id = (select public.current_verah_provider_id())
  );

create policy "Operations read quote revisions"
  on public.service_quote_revisions
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quote quality assessments"
  on public.quote_quality_assessments
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quote comparison sets"
  on public.quote_comparison_sets
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quote comparison members"
  on public.quote_comparison_members
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create or replace function private.reject_immutable_quote_artifact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Quote revision, assessment and comparison members are immutable.';
end;
$$;

revoke execute on function private.reject_immutable_quote_artifact_mutation()
  from public, anon, authenticated, service_role;

create trigger service_quote_revisions_immutable
before update or delete on public.service_quote_revisions
for each row execute function private.reject_immutable_quote_artifact_mutation();

create trigger quote_quality_assessments_immutable
before update or delete on public.quote_quality_assessments
for each row execute function private.reject_immutable_quote_artifact_mutation();

create trigger quote_comparison_members_immutable
before update or delete on public.quote_comparison_members
for each row execute function private.reject_immutable_quote_artifact_mutation();

create or replace function private.is_service_role_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

revoke execute on function private.is_service_role_session()
  from public, anon, authenticated, service_role;

create or replace function private.capture_service_quote_revision(
  p_quote_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  quote_row public.service_quotes%rowtype;
  revision_id uuid;
  revision_number integer;
  effective_key text;
  commercial_scope text;
  snapshot_payload jsonb;
  item_payload jsonb;
begin
  if p_quote_id is null then
    raise exception 'Quote id is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quote-revision:' || p_quote_id::text, 0)
  );

  select * into quote_row
  from public.service_quotes
  where id = p_quote_id
  for update;

  if quote_row.id is null or quote_row.status not in ('submitted', 'approved') then
    raise exception 'Only submitted or approved quotes can be revisioned.';
  end if;

  effective_key := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.btrim(p_idempotency_key), ''),
    'quote-revision:' || quote_row.id::text || ':' || quote_row.submitted_at::text
  );

  if pg_catalog.length(effective_key) > 200 then
    raise exception 'Idempotency key is too long.';
  end if;

  select id into revision_id
  from public.service_quote_revisions
  where idempotency_key = effective_key;

  if revision_id is not null then
    return revision_id;
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'item_type', item.item_type,
        'description', item.description,
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'total_price', item.total_price,
        'is_optional', item.is_optional
      ) order by item.created_at, item.id
    ),
    '[]'::jsonb
  ) into item_payload
  from public.service_quote_items as item
  where item.quote_id = quote_row.id;

  if pg_catalog.jsonb_array_length(item_payload) = 0 then
    raise exception 'A quote revision requires at least one item.';
  end if;

  select case
    when has_part and has_service then 'product_and_installation'
    when has_part then 'product_only'
    else 'service_only'
  end into commercial_scope
  from (
    select
      pg_catalog.bool_or(item_type = 'part') as has_part,
      pg_catalog.bool_or(item_type <> 'part') as has_service
    from public.service_quote_items
    where quote_id = quote_row.id
  ) as scope_flags;

  snapshot_payload := pg_catalog.jsonb_build_object(
    'quote_id', quote_row.id,
    'service_request_id', quote_row.service_request_id,
    'revision_source_status', quote_row.status,
    'commercial_scope', commercial_scope,
    'items', item_payload,
    'totals', pg_catalog.jsonb_build_object(
      'labor', quote_row.labor_total,
      'parts', quote_row.parts_total,
      'additional', quote_row.additional_total,
      'total', quote_row.total_amount
    ),
    'estimated_duration', quote_row.estimated_duration,
    'technical_notes', quote_row.technical_notes,
    'customer_summary', quote_row.customer_summary,
    'warranty_text', quote_row.warranty_text,
    'valid_until', quote_row.valid_until
  );

  select pg_catalog.coalesce(pg_catalog.max(existing.revision_number), 0) + 1
  into revision_number
  from public.service_quote_revisions as existing
  where existing.quote_id = quote_row.id;

  insert into public.service_quote_revisions (
    quote_id,
    service_request_id,
    provider_id,
    revision_number,
    commercial_scope,
    snapshot,
    content_hash,
    idempotency_key,
    author_user_id,
    submitted_at
  ) values (
    quote_row.id,
    quote_row.service_request_id,
    quote_row.provider_id,
    revision_number,
    commercial_scope,
    snapshot_payload,
    pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(snapshot_payload::text, 'UTF8'), 'sha256'),
      'hex'
    ),
    effective_key,
    auth.uid(),
    pg_catalog.coalesce(quote_row.submitted_at, pg_catalog.now())
  )
  returning id into revision_id;

  return revision_id;
end;
$$;

revoke execute on function private.capture_service_quote_revision(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.create_service_quote_revision(
  p_quote_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  profile_provider_id uuid := (select public.current_verah_provider_id());
begin
  if not (select private.is_service_role_session()) then
    if operational_role not in ('provider', 'concierge', 'admin') then
      raise exception 'Role is not authorized to create quote revisions.';
    end if;

    if operational_role = 'provider' and not exists (
      select 1
      from public.service_quotes as quote
      where quote.id = p_quote_id
        and quote.provider_id = profile_provider_id
    ) then
      raise exception 'Quote does not belong to the authenticated provider.';
    end if;
  end if;

  return private.capture_service_quote_revision(p_quote_id, p_idempotency_key);
end;
$$;

create or replace function public.assess_quote_revision(
  p_revision_id uuid,
  p_normalized_scope_key text,
  p_scope_completeness smallint,
  p_evidence_quality smallint,
  p_diagnosis_quality smallint,
  p_parts_detail_quality smallint,
  p_labor_detail_quality smallint,
  p_warranty_quality smallint,
  p_price_breakdown_quality smallint,
  p_second_opinion_eligibility boolean,
  p_classification text,
  p_missing_fields jsonb default '[]'::jsonb,
  p_exclusions jsonb default '[]'::jsonb,
  p_caveats jsonb default '[]'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  assessment_id uuid;
  effective_key text := pg_catalog.nullif(pg_catalog.btrim(p_idempotency_key), '');
  actor_id uuid := auth.uid();
  confirmed_by uuid;
  confirmed_at timestamptz;
begin
  if not (select private.is_service_role_session())
    and operational_role not in ('concierge', 'admin') then
    raise exception 'Only Concierge or Admin can assess quote quality.';
  end if;

  if p_revision_id is null
    or p_normalized_scope_key is null
    or p_normalized_scope_key !~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
    or effective_key is null
    or pg_catalog.length(effective_key) > 200
    or p_classification not in (
      'insufficient', 'weak', 'usable_with_caveats',
      'comparison_ready', 'technically_confirmed'
    )
    or pg_catalog.jsonb_typeof(p_missing_fields) <> 'array'
    or pg_catalog.jsonb_typeof(p_exclusions) <> 'array'
    or pg_catalog.jsonb_typeof(p_caveats) <> 'array' then
    raise exception 'Invalid quote quality assessment input.';
  end if;

  if not exists (
    select 1 from public.service_quote_revisions where id = p_revision_id
  ) then
    raise exception 'Quote revision does not exist.';
  end if;

  if p_classification = 'technically_confirmed' then
    if operational_role not in ('concierge', 'admin') or actor_id is null then
      raise exception 'Technical confirmation requires an authenticated human reviewer.';
    end if;
    confirmed_by := actor_id;
    confirmed_at := pg_catalog.now();
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quote-assessment:' || effective_key, 0)
  );

  select id into assessment_id
  from public.quote_quality_assessments
  where idempotency_key = effective_key;

  if assessment_id is not null then
    return assessment_id;
  end if;

  insert into public.quote_quality_assessments (
    revision_id,
    normalized_scope_key,
    scope_completeness,
    evidence_quality,
    diagnosis_quality,
    parts_detail_quality,
    labor_detail_quality,
    warranty_quality,
    price_breakdown_quality,
    second_opinion_eligibility,
    classification,
    missing_fields,
    exclusions,
    caveats,
    human_confirmed_by,
    human_confirmed_at,
    idempotency_key,
    created_by
  ) values (
    p_revision_id,
    p_normalized_scope_key,
    p_scope_completeness,
    p_evidence_quality,
    p_diagnosis_quality,
    p_parts_detail_quality,
    p_labor_detail_quality,
    p_warranty_quality,
    p_price_breakdown_quality,
    p_second_opinion_eligibility,
    p_classification,
    p_missing_fields,
    p_exclusions,
    p_caveats,
    confirmed_by,
    confirmed_at,
    effective_key,
    actor_id
  ) returning id into assessment_id;

  return assessment_id;
end;
$$;

create or replace function public.create_quote_comparison_set(
  p_service_request_id uuid,
  p_revision_ids uuid[],
  p_ranking_basis text,
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
  comparison_id uuid;
  effective_key text := pg_catalog.nullif(pg_catalog.btrim(p_idempotency_key), '');
  normalized_scope text;
  commercial_scope_value text;
  member_count integer;
  revision_row record;
begin
  if not (select private.is_service_role_session())
    and operational_role not in ('concierge', 'admin') then
    raise exception 'Only Concierge or Admin can create comparisons.';
  end if;

  if p_service_request_id is null
    or p_revision_ids is null
    or pg_catalog.array_length(p_revision_ids, 1) < 2
    or pg_catalog.array_length(p_revision_ids, 1) > 26
    or effective_key is null
    or pg_catalog.length(effective_key) > 200
    or pg_catalog.nullif(pg_catalog.btrim(p_ranking_basis), '') is null
    or pg_catalog.lower(pg_catalog.btrim(p_ranking_basis)) in (
      'lowest_price', 'price_only', 'menor_preco'
    ) then
    raise exception 'Invalid comparison input.';
  end if;

  if (
    select pg_catalog.count(distinct revision_id)
    from pg_catalog.unnest(p_revision_ids) as revision_id
  ) <> pg_catalog.array_length(p_revision_ids, 1) then
    raise exception 'Comparison revisions must be distinct.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quote-comparison:' || effective_key, 0)
  );

  select id into comparison_id
  from public.quote_comparison_sets
  where idempotency_key = effective_key;

  if comparison_id is not null then
    return comparison_id;
  end if;

  with selected as (
    select
      revision.id,
      revision.commercial_scope,
      assessment.normalized_scope_key,
      assessment.classification
    from pg_catalog.unnest(p_revision_ids) as requested(revision_id)
    join public.service_quote_revisions as revision
      on revision.id = requested.revision_id
    join lateral (
      select candidate.normalized_scope_key, candidate.classification
      from public.quote_quality_assessments as candidate
      where candidate.revision_id = revision.id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) as assessment on true
    where revision.service_request_id = p_service_request_id
  )
  select
    pg_catalog.count(*),
    pg_catalog.min(selected.normalized_scope_key),
    pg_catalog.min(selected.commercial_scope)
  into member_count, normalized_scope, commercial_scope_value
  from selected
  where selected.classification in ('comparison_ready', 'technically_confirmed');

  if member_count <> pg_catalog.array_length(p_revision_ids, 1) then
    raise exception 'Every revision must be comparison ready for this request.';
  end if;

  if (
    select pg_catalog.count(distinct latest.normalized_scope_key)
    from pg_catalog.unnest(p_revision_ids) as requested(revision_id)
    join lateral (
      select candidate.normalized_scope_key
      from public.quote_quality_assessments as candidate
      where candidate.revision_id = requested.revision_id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) as latest on true
  ) <> 1 then
    raise exception 'Technical scopes are not comparable.';
  end if;

  if (
    select pg_catalog.count(distinct revision.commercial_scope)
    from public.service_quote_revisions as revision
    where revision.id = any(p_revision_ids)
  ) <> 1 then
    raise exception 'Commercial scopes are not comparable.';
  end if;

  insert into public.quote_comparison_sets (
    service_request_id,
    normalized_scope_key,
    commercial_scope,
    ranking_basis,
    idempotency_key,
    created_by
  ) values (
    p_service_request_id,
    normalized_scope,
    commercial_scope_value,
    pg_catalog.btrim(p_ranking_basis),
    effective_key,
    auth.uid()
  ) returning id into comparison_id;

  for revision_row in
    select revision.*, requested.ordinality::integer as display_order
    from pg_catalog.unnest(p_revision_ids) with ordinality as requested(revision_id, ordinality)
    join public.service_quote_revisions as revision on revision.id = requested.revision_id
    order by requested.ordinality
  loop
    insert into public.quote_comparison_members (
      comparison_set_id,
      revision_id,
      display_order,
      public_label,
      differences
    ) values (
      comparison_id,
      revision_row.id,
      revision_row.display_order,
      'Proposta ' || pg_catalog.chr(64 + revision_row.display_order),
      pg_catalog.jsonb_build_object(
        'commercial_scope', revision_row.commercial_scope,
        'parts', pg_catalog.coalesce(revision_row.snapshot -> 'items', '[]'::jsonb),
        'warranty', revision_row.snapshot -> 'warranty_text',
        'price_breakdown', revision_row.snapshot -> 'totals'
      )
    );
  end loop;

  return comparison_id;
end;
$$;

create or replace function public.publish_quote_comparison_set(
  p_comparison_set_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  comparison_row public.quote_comparison_sets%rowtype;
  member_count integer;
begin
  if operational_role not in ('concierge', 'admin') or auth.uid() is null then
    raise exception 'Publishing requires an authenticated human reviewer.';
  end if;

  select * into comparison_row
  from public.quote_comparison_sets
  where id = p_comparison_set_id
  for update;

  if comparison_row.id is null then
    raise exception 'Comparison set does not exist.';
  end if;

  if comparison_row.status = 'published' then
    return comparison_row.id;
  end if;

  if comparison_row.status <> 'draft' then
    raise exception 'Comparison set cannot be published.';
  end if;

  select pg_catalog.count(*) into member_count
  from public.quote_comparison_members
  where comparison_set_id = comparison_row.id;

  if member_count < 2 then
    raise exception 'Comparison requires at least two proposals.';
  end if;

  update public.quote_comparison_sets
  set
    status = 'published',
    reviewed_by = auth.uid(),
    published_at = pg_catalog.now()
  where id = comparison_row.id;

  insert into public.service_request_events (
    service_request_id,
    event_type,
    actor_user_id,
    actor_role,
    channel,
    audience,
    payload,
    idempotency_key
  ) values (
    comparison_row.service_request_id,
    'quote.comparison_published',
    auth.uid(),
    operational_role,
    'app',
    array['customer', 'operations']::text[],
    pg_catalog.jsonb_build_object(
      'comparison_set_id', comparison_row.id,
      'member_count', member_count
    ),
    'quote-comparison:' || comparison_row.id::text || ':published'
  ) on conflict (idempotency_key) do nothing;

  return comparison_row.id;
end;
$$;

create or replace function public.get_published_quote_comparison(
  p_comparison_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  operational_role text := (select public.current_verah_role());
  comparison_row public.quote_comparison_sets%rowtype;
  proposals jsonb;
begin
  select * into comparison_row
  from public.quote_comparison_sets
  where id = p_comparison_set_id
    and status = 'published';

  if comparison_row.id is null then
    raise exception 'Published comparison is unavailable.';
  end if;

  if operational_role = 'customer' then
    if not exists (
      select 1
      from public.service_requests as request
      where request.id = comparison_row.service_request_id
        and (
          request.created_by = auth.uid()
          or request.customer_id = (select private.current_customer_id())
        )
    ) then
      raise exception 'Published comparison is unavailable.';
    end if;
  elsif operational_role not in ('concierge', 'admin') then
    raise exception 'Role is not authorized to read published comparisons.';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'option_id', member.id,
      'label', member.public_label,
      'commercial_scope', comparison_row.commercial_scope,
      'items', revision.snapshot -> 'items',
      'totals', revision.snapshot -> 'totals',
      'estimated_duration', revision.snapshot -> 'estimated_duration',
      'warranty_text', revision.snapshot -> 'warranty_text',
      'valid_until', revision.snapshot -> 'valid_until',
      'caveats', assessment.caveats,
      'differences', member.differences
    ) order by member.display_order
  ) into proposals
  from public.quote_comparison_members as member
  join public.service_quote_revisions as revision on revision.id = member.revision_id
  join lateral (
    select candidate.caveats
    from public.quote_quality_assessments as candidate
    where candidate.revision_id = revision.id
    order by candidate.created_at desc, candidate.id desc
    limit 1
  ) as assessment on true
  where member.comparison_set_id = comparison_row.id;

  return pg_catalog.jsonb_build_object(
    'comparison_set_id', comparison_row.id,
    'service_request_id', comparison_row.service_request_id,
    'status', comparison_row.status,
    'scope', comparison_row.commercial_scope,
    'ranking_basis', comparison_row.ranking_basis,
    'published_at', comparison_row.published_at,
    'proposals', pg_catalog.coalesce(proposals, '[]'::jsonb)
  );
end;
$$;

alter function public.submit_service_quote(uuid)
  rename to submit_service_quote_quality_impl;

revoke all on function public.submit_service_quote_quality_impl(uuid)
  from public, anon, authenticated, service_role;

create function public.submit_service_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  submitted_quote_id uuid;
begin
  submitted_quote_id := public.submit_service_quote_quality_impl(p_quote_id);
  perform private.capture_service_quote_revision(submitted_quote_id, null);
  return submitted_quote_id;
end;
$$;

alter function public.approve_service_quote(uuid, text)
  rename to approve_service_quote_quality_impl;

revoke all on function public.approve_service_quote_quality_impl(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.approve_service_quote_revision(
  p_quote_id uuid,
  p_revision_id uuid,
  p_customer_decision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  approved_quote_id uuid;
  latest_revision_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quote-approval:' || p_quote_id::text, 0)
  );

  select revision.id into latest_revision_id
  from public.service_quote_revisions as revision
  where revision.quote_id = p_quote_id
  order by revision.revision_number desc
  limit 1;

  if latest_revision_id is null then
    latest_revision_id := private.capture_service_quote_revision(p_quote_id, null);
  end if;

  if latest_revision_id is distinct from p_revision_id then
    raise exception 'Quote revision is stale or does not belong to this quote.';
  end if;

  approved_quote_id := public.approve_service_quote_quality_impl(
    p_quote_id,
    p_customer_decision_note
  );

  update public.service_quotes
  set approved_revision_id = latest_revision_id
  where id = approved_quote_id;

  return approved_quote_id;
end;
$$;

create function public.approve_service_quote(
  p_quote_id uuid,
  p_customer_decision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  latest_revision_id uuid;
begin
  select revision.id into latest_revision_id
  from public.service_quote_revisions as revision
  where revision.quote_id = p_quote_id
  order by revision.revision_number desc
  limit 1;

  if latest_revision_id is null then
    latest_revision_id := private.capture_service_quote_revision(p_quote_id, null);
  end if;

  return public.approve_service_quote_revision(
    p_quote_id,
    latest_revision_id,
    p_customer_decision_note
  );
end;
$$;

revoke all on function public.create_service_quote_revision(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.assess_quote_revision(
  uuid, text, smallint, smallint, smallint, smallint, smallint, smallint,
  smallint, boolean, text, jsonb, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_quote_comparison_set(uuid, uuid[], text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.publish_quote_comparison_set(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_published_quote_comparison(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_service_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_service_quote_revision(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_service_quote(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_service_quote_revision(uuid, text)
  to authenticated, service_role;
grant execute on function public.assess_quote_revision(
  uuid, text, smallint, smallint, smallint, smallint, smallint, smallint,
  smallint, boolean, text, jsonb, jsonb, jsonb, text
) to authenticated, service_role;
grant execute on function public.create_quote_comparison_set(uuid, uuid[], text, text)
  to authenticated, service_role;
grant execute on function public.publish_quote_comparison_set(uuid)
  to authenticated;
grant execute on function public.get_published_quote_comparison(uuid)
  to authenticated;
grant execute on function public.submit_service_quote(uuid)
  to authenticated;
grant execute on function public.approve_service_quote_revision(uuid, uuid, text)
  to authenticated;
grant execute on function public.approve_service_quote(uuid, text)
  to authenticated;
