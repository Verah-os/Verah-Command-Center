create table private.work_items (
  id uuid primary key default gen_random_uuid(),
  repository text not null,
  issue_number bigint not null,
  issue_updated_at timestamptz not null,
  title text not null,
  body_sha256 text not null,
  state text not null default 'queued',
  dry_run boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_repository_format_check
    check (repository ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  constraint work_items_issue_number_check check (issue_number > 0),
  constraint work_items_title_check check (char_length(title) between 1 and 256),
  constraint work_items_body_sha256_check check (body_sha256 ~ '^[0-9a-f]{64}$'),
  constraint work_items_state_check check (
    state in (
      'queued', 'planning', 'waiting_approval', 'implementing', 'testing',
      'fixing', 'pr_open', 'blocked', 'completed', 'failed', 'cancelled'
    )
  ),
  constraint work_items_dry_run_only_check check (dry_run is true),
  constraint work_items_repository_issue_key unique (repository, issue_number)
);

create index work_items_state_created_at_idx
  on private.work_items (state, created_at);

create table private.execution_runs (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references private.work_items(id),
  run_number integer not null,
  state text not null default 'queued',
  active boolean not null default true,
  checkpoint text,
  resume_count integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint execution_runs_number_check check (run_number > 0),
  constraint execution_runs_resume_count_check check (resume_count >= 0),
  constraint execution_runs_state_check check (
    state in (
      'queued', 'planning', 'waiting_approval', 'implementing', 'testing',
      'fixing', 'pr_open', 'blocked', 'completed', 'failed', 'cancelled'
    )
  ),
  constraint execution_runs_completion_check check (
    (active is true and completed_at is null)
    or (active is false)
  ),
  constraint execution_runs_work_item_number_key unique (work_item_id, run_number)
);

create unique index execution_runs_one_active_per_work_item_idx
  on private.execution_runs (work_item_id)
  where active is true;

create table private.events (
  id bigint generated always as identity primary key,
  work_item_id uuid not null references private.work_items(id),
  execution_run_id uuid references private.execution_runs(id),
  sequence integer,
  external_event_id text,
  event_type text not null,
  actor text,
  from_state text,
  to_state text,
  channel text not null default 'synthetic_webhook',
  audience text not null default 'internal',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint events_sequence_shape_check check (
    (execution_run_id is null and sequence is null)
    or (execution_run_id is not null and sequence is not null and sequence > 0)
  ),
  constraint events_external_event_id_check check (
    external_event_id is null
    or external_event_id ~ '^[A-Za-z0-9_.:-]{1,200}$'
  ),
  constraint events_type_check check (char_length(event_type) between 1 and 100),
  constraint events_channel_check check (channel = 'synthetic_webhook'),
  constraint events_audience_check check (audience = 'internal'),
  constraint events_run_sequence_key unique (execution_run_id, sequence),
  constraint events_external_event_key unique (external_event_id)
);

create index events_work_item_created_at_idx
  on private.events (work_item_id, created_at, id);

create table private.locks (
  resource_key text primary key,
  work_item_id uuid not null references private.work_items(id),
  execution_run_id uuid references private.execution_runs(id),
  acquired_at timestamptz not null,
  heartbeat_at timestamptz not null,
  lease_expires_at timestamptz not null,
  constraint locks_single_resource_check check (resource_key = 'control-plane:global'),
  constraint locks_lease_check check (lease_expires_at > acquired_at)
);

create index locks_work_item_id_idx on private.locks (work_item_id);
create index locks_execution_run_id_idx on private.locks (execution_run_id);

create table private.approvals (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references private.work_items(id),
  source_event_id text not null,
  maintainer_login text not null,
  decision text not null,
  evidence_sha256 text not null,
  decided_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint approvals_source_event_check
    check (source_event_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  constraint approvals_maintainer_check
    check (maintainer_login ~ '^[a-z0-9](?:[a-z0-9-]{0,38})$'),
  constraint approvals_decision_check check (decision in ('approved', 'rejected')),
  constraint approvals_evidence_sha256_check
    check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint approvals_work_item_source_key unique (work_item_id, source_event_id)
);

create index approvals_work_item_decided_at_idx
  on private.approvals (work_item_id, decided_at desc);

create table private.budgets (
  id uuid primary key default gen_random_uuid(),
  execution_run_id uuid not null unique references private.execution_runs(id),
  max_duration_ms integer not null,
  max_steps integer not null,
  max_cost_microunits bigint not null,
  estimated_steps integer not null,
  estimated_cost_microunits bigint not null,
  consumed_steps integer not null default 0,
  consumed_cost_microunits bigint not null default 0,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_duration_check check (max_duration_ms between 1000 and 300000),
  constraint budgets_steps_check check (
    max_steps between 1 and 100
    and estimated_steps >= 0
    and consumed_steps >= 0
  ),
  constraint budgets_cost_check check (
    max_cost_microunits between 0 and 1000000
    and estimated_cost_microunits >= 0
    and consumed_cost_microunits >= 0
  )
);

alter table private.work_items enable row level security;
alter table private.execution_runs enable row level security;
alter table private.events enable row level security;
alter table private.locks enable row level security;
alter table private.approvals enable row level security;
alter table private.budgets enable row level security;

revoke all on table private.work_items from public, anon, authenticated, service_role;
revoke all on table private.execution_runs from public, anon, authenticated, service_role;
revoke all on table private.events from public, anon, authenticated, service_role;
revoke all on table private.locks from public, anon, authenticated, service_role;
revoke all on table private.approvals from public, anon, authenticated, service_role;
revoke all on table private.budgets from public, anon, authenticated, service_role;
revoke all on sequence private.events_id_seq from public, anon, authenticated, service_role;

create or replace function private.reject_control_plane_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'control plane events are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function private.reject_control_plane_event_mutation()
  from public, anon, authenticated, service_role;

create trigger control_plane_events_immutable
before update or delete on private.events
for each row execute function private.reject_control_plane_event_mutation();

create or replace function public.process_control_plane_dry_run(
  p_delivery_id text,
  p_repository text,
  p_issue_number bigint,
  p_issue_updated_at timestamptz,
  p_title text,
  p_body_sha256 text,
  p_maintainer_login text,
  p_approved boolean,
  p_approval_evidence_sha256 text,
  p_plan jsonb,
  p_max_duration_ms integer,
  p_max_steps integer,
  p_max_cost_microunits bigint,
  p_estimated_steps integer,
  p_estimated_cost_microunits bigint,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_claims jsonb;
  v_work_item private.work_items%rowtype;
  v_run private.execution_runs%rowtype;
  v_lock private.locks%rowtype;
  v_existing_event private.events%rowtype;
  v_report jsonb;
  v_sequence integer;
  v_resumed boolean := false;
  v_budget_exceeded boolean;
  v_previous_issue_updated_at timestamptz;
  v_deadline_at timestamptz;
begin
  begin
    v_claims := coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    raise exception 'invalid signed session claims' using errcode = '22023';
  end;

  if coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_delivery_id is null
    or p_delivery_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_repository is null
    or p_repository !~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'
    or p_issue_number is null
    or p_issue_number <= 0
    or p_issue_updated_at is null
    or p_title is null
    or char_length(p_title) not between 1 and 256
    or p_body_sha256 is null
    or p_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_max_duration_ms is null
    or p_max_duration_ms not between 1000 and 300000
    or p_max_steps is null
    or p_max_steps not between 1 and 100
    or p_max_cost_microunits is null
    or p_max_cost_microunits not between 0 and 1000000
    or p_estimated_steps is null
    or p_estimated_steps < 0
    or p_estimated_cost_microunits is null
    or p_estimated_cost_microunits < 0
  then
    raise exception 'invalid control plane parameters' using errcode = '22023';
  end if;

  if p_approved is true and (
    p_maintainer_login is null
    or p_maintainer_login !~ '^[a-z0-9](?:[a-z0-9-]{0,38})$'
    or p_approval_evidence_sha256 is null
    or p_approval_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_plan is null
    or jsonb_typeof(p_plan) <> 'object'
    or pg_catalog.octet_length(p_plan::text) > 65536
  ) then
    raise exception 'invalid approval or plan' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('control-plane:' || p_repository || ':' || p_issue_number::text, 0)
  );

  select event.*
    into v_existing_event
    from private.events as event
    where event.external_event_id = p_delivery_id;

  if found then
    select item.* into v_work_item
      from private.work_items as item
      where item.id = v_existing_event.work_item_id;
    if v_existing_event.execution_run_id is not null then
      select run.* into v_run
        from private.execution_runs as run
        where run.id = v_existing_event.execution_run_id;
    end if;
    return coalesce(nullif(v_run.report, '{}'::jsonb), pg_catalog.jsonb_build_object(
      'status', 'duplicate',
      'workItemId', v_work_item.id,
      'executionRunId', v_existing_event.execution_run_id,
      'state', v_work_item.state,
      'resumed', false,
      'plan', null,
      'budget', pg_catalog.jsonb_build_object(
        'maxDurationMs', p_max_duration_ms,
        'maxSteps', p_max_steps,
        'maxCostMicrounits', p_max_cost_microunits,
        'estimatedSteps', p_estimated_steps,
        'estimatedCostMicrounits', p_estimated_cost_microunits
      ),
      'repositoryMutations', '[]'::jsonb,
      'productionMutations', '[]'::jsonb,
      'externalEffects', '[]'::jsonb
    ));
  end if;

  select item.* into v_work_item
    from private.work_items as item
    where item.repository = p_repository
      and item.issue_number = p_issue_number
    for update;

  if not found then
    insert into private.work_items (
      repository, issue_number, issue_updated_at, title, body_sha256
    ) values (
      p_repository, p_issue_number, p_issue_updated_at, p_title, p_body_sha256
    ) returning * into v_work_item;
  elsif p_issue_updated_at < v_work_item.issue_updated_at then
    insert into private.events (
      work_item_id, external_event_id, event_type, actor, payload, created_at
    ) values (
      v_work_item.id,
      p_delivery_id,
      'delivery_ignored_out_of_order',
      p_maintainer_login,
      pg_catalog.jsonb_build_object('issueUpdatedAt', p_issue_updated_at),
      p_now
    );
    return pg_catalog.jsonb_build_object(
      'status', 'ignored_out_of_order',
      'workItemId', v_work_item.id,
      'executionRunId', null,
      'state', v_work_item.state,
      'resumed', false,
      'plan', null,
      'budget', pg_catalog.jsonb_build_object(
        'maxDurationMs', p_max_duration_ms,
        'maxSteps', p_max_steps,
        'maxCostMicrounits', p_max_cost_microunits,
        'estimatedSteps', p_estimated_steps,
        'estimatedCostMicrounits', p_estimated_cost_microunits
      ),
      'repositoryMutations', '[]'::jsonb,
      'productionMutations', '[]'::jsonb,
      'externalEffects', '[]'::jsonb
    );
  else
    v_previous_issue_updated_at := v_work_item.issue_updated_at;
    update private.work_items
      set issue_updated_at = p_issue_updated_at,
          title = p_title,
          body_sha256 = p_body_sha256,
          updated_at = p_now
      where id = v_work_item.id
      returning * into v_work_item;
  end if;

  if p_approved is not true then
    update private.work_items
      set state = 'waiting_approval', updated_at = p_now
      where id = v_work_item.id
      returning * into v_work_item;
    insert into private.events (
      work_item_id, external_event_id, event_type, to_state, payload, created_at
    ) values (
      v_work_item.id,
      p_delivery_id,
      'issue_waiting_approval',
      'waiting_approval',
      '{}'::jsonb,
      p_now
    );
    return pg_catalog.jsonb_build_object(
      'status', 'waiting_approval',
      'workItemId', v_work_item.id,
      'executionRunId', null,
      'state', 'waiting_approval',
      'resumed', false,
      'plan', null,
      'budget', pg_catalog.jsonb_build_object(
        'maxDurationMs', p_max_duration_ms,
        'maxSteps', p_max_steps,
        'maxCostMicrounits', p_max_cost_microunits,
        'estimatedSteps', p_estimated_steps,
        'estimatedCostMicrounits', p_estimated_cost_microunits
      ),
      'repositoryMutations', '[]'::jsonb,
      'productionMutations', '[]'::jsonb,
      'externalEffects', '[]'::jsonb
    );
  end if;

  insert into private.approvals (
    work_item_id, source_event_id, maintainer_login, decision,
    evidence_sha256, decided_at, created_at
  ) values (
    v_work_item.id, p_delivery_id, lower(p_maintainer_login), 'approved',
    p_approval_evidence_sha256, p_now, p_now
  ) on conflict (work_item_id, source_event_id) do nothing;

  select run.* into v_run
    from private.execution_runs as run
    where run.work_item_id = v_work_item.id
      and run.active is false
      and run.state = 'completed'
    order by run.run_number desc
    limit 1;

  if found and p_issue_updated_at = v_previous_issue_updated_at then
    select coalesce(max(event.sequence), 0) + 1 into v_sequence
      from private.events as event
      where event.execution_run_id = v_run.id;
    insert into private.events (
      work_item_id, execution_run_id, sequence, external_event_id,
      event_type, actor, from_state, to_state, payload, created_at
    ) values (
      v_work_item.id, v_run.id, v_sequence, p_delivery_id,
      'delivery_deduplicated', p_maintainer_login, 'completed', 'completed',
      '{}'::jsonb, p_now
    );
    return v_run.report || pg_catalog.jsonb_build_object('status', 'duplicate');
  end if;

  select lock_row.* into v_lock
    from private.locks as lock_row
    where lock_row.resource_key = 'control-plane:global'
    for update;

  if found and v_lock.lease_expires_at > p_now and v_lock.work_item_id <> v_work_item.id then
    update private.work_items
      set state = 'blocked', updated_at = p_now
      where id = v_work_item.id;
    insert into private.events (
      work_item_id, external_event_id, event_type, actor, to_state, payload, created_at
    ) values (
      v_work_item.id, p_delivery_id, 'global_lock_occupied', p_maintainer_login,
      'blocked', '{}'::jsonb, p_now
    );
    return pg_catalog.jsonb_build_object(
      'status', 'blocked',
      'workItemId', v_work_item.id,
      'executionRunId', null,
      'state', 'blocked',
      'resumed', false,
      'plan', p_plan,
      'budget', pg_catalog.jsonb_build_object(
        'maxDurationMs', p_max_duration_ms,
        'maxSteps', p_max_steps,
        'maxCostMicrounits', p_max_cost_microunits,
        'estimatedSteps', p_estimated_steps,
        'estimatedCostMicrounits', p_estimated_cost_microunits
      ),
      'repositoryMutations', '[]'::jsonb,
      'productionMutations', '[]'::jsonb,
      'externalEffects', '[]'::jsonb
    );
  end if;

  if found then
    delete from private.locks where resource_key = 'control-plane:global';
  end if;

  select run.* into v_run
    from private.execution_runs as run
    where run.work_item_id = v_work_item.id and run.active is true
    for update;

  if found then
    v_resumed := true;
    update private.execution_runs
      set resume_count = resume_count + 1,
          state = 'planning',
          checkpoint = 'plan_validated',
          updated_at = p_now
      where id = v_run.id
      returning * into v_run;
  else
    insert into private.execution_runs (
      work_item_id, run_number, state, active, checkpoint, started_at, updated_at
    ) values (
      v_work_item.id,
      coalesce((select max(run_number) + 1 from private.execution_runs where work_item_id = v_work_item.id), 1),
      'planning', true, 'plan_validated', p_now, p_now
    ) returning * into v_run;
  end if;

  insert into private.locks (
    resource_key, work_item_id, execution_run_id,
    acquired_at, heartbeat_at, lease_expires_at
  ) values (
    'control-plane:global', v_work_item.id, v_run.id,
    p_now, p_now, p_now + interval '60 seconds'
  );

  insert into private.budgets (
    execution_run_id, max_duration_ms, max_steps, max_cost_microunits,
    estimated_steps, estimated_cost_microunits, deadline_at, created_at, updated_at
  ) values (
    v_run.id, p_max_duration_ms, p_max_steps, p_max_cost_microunits,
    p_estimated_steps, p_estimated_cost_microunits,
    p_now + (p_max_duration_ms * interval '1 millisecond'), p_now, p_now
  ) on conflict (execution_run_id) do update
    set estimated_steps = excluded.estimated_steps,
        estimated_cost_microunits = excluded.estimated_cost_microunits,
        updated_at = excluded.updated_at;

  select budget.deadline_at into v_deadline_at
    from private.budgets as budget
    where budget.execution_run_id = v_run.id;

  select coalesce(max(event.sequence), 0) + 1 into v_sequence
    from private.events as event
    where event.execution_run_id = v_run.id;
  insert into private.events (
    work_item_id, execution_run_id, sequence, external_event_id,
    event_type, actor, from_state, to_state, payload, created_at
  ) values (
    v_work_item.id, v_run.id, v_sequence, p_delivery_id,
    case when v_resumed then 'dry_run_resumed' else 'dry_run_started' end,
    p_maintainer_login, v_work_item.state, 'planning', '{}'::jsonb, p_now
  );

  update private.work_items
    set state = 'planning', updated_at = p_now
    where id = v_work_item.id;

  v_budget_exceeded :=
    p_estimated_steps > p_max_steps
    or p_estimated_cost_microunits > p_max_cost_microunits
    or p_now >= v_deadline_at;

  v_report := pg_catalog.jsonb_build_object(
    'status', case when v_budget_exceeded then 'blocked' else 'completed' end,
    'workItemId', v_work_item.id,
    'executionRunId', v_run.id,
    'state', case when v_budget_exceeded then 'blocked' else 'completed' end,
    'resumed', v_resumed,
    'plan', p_plan,
    'budget', pg_catalog.jsonb_build_object(
      'maxDurationMs', p_max_duration_ms,
      'maxSteps', p_max_steps,
      'maxCostMicrounits', p_max_cost_microunits,
      'estimatedSteps', p_estimated_steps,
      'estimatedCostMicrounits', p_estimated_cost_microunits
    ),
    'repositoryMutations', '[]'::jsonb,
    'productionMutations', '[]'::jsonb,
    'externalEffects', '[]'::jsonb
  );

  update private.execution_runs
    set state = case when v_budget_exceeded then 'blocked' else 'completed' end,
        active = false,
        checkpoint = case when v_budget_exceeded then 'budget_blocked' else 'report_complete' end,
        report = v_report,
        completed_at = p_now,
        updated_at = p_now
    where id = v_run.id;
  update private.budgets
    set consumed_steps = case when v_budget_exceeded then consumed_steps else p_estimated_steps end,
        consumed_cost_microunits = case
          when v_budget_exceeded then consumed_cost_microunits
          else p_estimated_cost_microunits
        end,
        updated_at = p_now
    where execution_run_id = v_run.id;
  update private.work_items
    set state = case when v_budget_exceeded then 'blocked' else 'completed' end,
        updated_at = p_now
    where id = v_work_item.id;

  select coalesce(max(event.sequence), 0) + 1 into v_sequence
    from private.events as event
    where event.execution_run_id = v_run.id;
  insert into private.events (
    work_item_id, execution_run_id, sequence, event_type, actor,
    from_state, to_state, payload, created_at
  ) values (
    v_work_item.id, v_run.id, v_sequence,
    case when v_budget_exceeded then 'budget_exceeded' else 'dry_run_completed' end,
    p_maintainer_login, 'planning',
    case when v_budget_exceeded then 'blocked' else 'completed' end,
    '{}'::jsonb, p_now
  );

  delete from private.locks
    where resource_key = 'control-plane:global'
      and execution_run_id = v_run.id;

  return v_report;
end;
$$;

revoke execute on function public.process_control_plane_dry_run(
  text, text, bigint, timestamptz, text, text, text, boolean, text, jsonb,
  integer, integer, bigint, integer, bigint, timestamptz
) from public, anon, authenticated;

grant execute on function public.process_control_plane_dry_run(
  text, text, bigint, timestamptz, text, text, text, boolean, text, jsonb,
  integer, integer, bigint, integer, bigint, timestamptz
) to service_role;
