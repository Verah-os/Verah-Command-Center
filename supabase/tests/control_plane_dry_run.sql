begin;

create temporary table control_plane_results (
  name text primary key,
  result jsonb not null
);

grant all on table control_plane_results to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'work_items', 'execution_runs', 'events', 'locks', 'approvals', 'budgets'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'private'
        and relation.relname = table_name
        and relation.relkind = 'r'
        and relation.relrowsecurity is true
    ) then
      raise exception 'private.% is missing or RLS is disabled', table_name;
    end if;
  end loop;
end;
$$;

do $$
declare
  role_name text;
  table_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    foreach table_name in array array[
      'work_items', 'execution_runs', 'events', 'locks', 'approvals', 'budgets'
    ] loop
      if pg_catalog.has_table_privilege(
        role_name,
        pg_catalog.format('private.%I', table_name),
        'SELECT,INSERT,UPDATE,DELETE'
      ) then
        raise exception '% has direct access to private.%', role_name, table_name;
      end if;
    end loop;
  end loop;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.process_control_plane_dry_run(text,text,bigint,timestamptz,text,text,text,boolean,text,jsonb,integer,integer,bigint,integer,bigint,timestamptz)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.process_control_plane_dry_run(text,text,bigint,timestamptz,text,text,text,boolean,text,jsonb,integer,integer,bigint,integer,bigint,timestamptz)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.process_control_plane_dry_run(text,text,bigint,timestamptz,text,text,text,boolean,text,jsonb,integer,integer,bigint,integer,bigint,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'control plane RPC grants are not minimal';
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

do $$
begin
  perform public.process_control_plane_dry_run(
    'synthetic.denied', 'Verah-os/Verah-Command-Center', 1,
    '2026-07-31T20:00:00Z', 'Denied', repeat('a', 64),
    'verah-maintainer', true, repeat('b', 64), '{"steps":[]}'::jsonb,
    30000, 20, 10000, 1, 100
  );
  raise exception 'authenticated role executed the control plane RPC';
exception
  when insufficient_privilege then null;
end;
$$;

reset role;
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into control_plane_results (name, result)
select 'first', public.process_control_plane_dry_run(
  'synthetic.issue.67.delivery.1', 'Verah-os/Verah-Command-Center', 67,
  '2026-07-31T20:00:00Z', 'Control Plane 001', repeat('a', 64),
  'verah-maintainer', true, repeat('b', 64),
  '{"objective":"dry-run","steps":["plan"],"acceptanceCriteria":["safe"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:00Z'
);

insert into control_plane_results (name, result)
select 'duplicate', public.process_control_plane_dry_run(
  'synthetic.issue.67.delivery.1', 'Verah-os/Verah-Command-Center', 67,
  '2026-07-31T20:00:00Z', 'Control Plane 001', repeat('a', 64),
  'verah-maintainer', true, repeat('b', 64),
  '{"objective":"dry-run","steps":["plan"],"acceptanceCriteria":["safe"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:01Z'
);

insert into control_plane_results (name, result)
select 'stale', public.process_control_plane_dry_run(
  'synthetic.issue.67.delivery.stale', 'Verah-os/Verah-Command-Center', 67,
  '2026-07-30T20:00:00Z', 'Control Plane 001 stale', repeat('c', 64),
  'verah-maintainer', true, repeat('d', 64),
  '{"objective":"stale","steps":["ignore"],"acceptanceCriteria":["safe"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:02Z'
);

insert into control_plane_results (name, result)
select 'waiting', public.process_control_plane_dry_run(
  'synthetic.issue.68.waiting', 'Verah-os/Verah-Command-Center', 68,
  '2026-07-31T20:00:00Z', 'Waiting approval', repeat('e', 64),
  null, false, null, null,
  30000, 20, 10000, 1, 0,
  '2026-07-31T20:02:03Z'
);

reset role;

do $$
begin
  if (select count(*) from private.work_items where issue_number = 67) <> 1
    or (select count(*) from private.execution_runs as run join private.work_items as item on item.id = run.work_item_id where item.issue_number = 67) <> 1
  then
    raise exception 'duplicate delivery created duplicate persistent state';
  end if;
  if (select result ->> 'status' from control_plane_results where name = 'first') <> 'completed'
    or (select result ->> 'status' from control_plane_results where name = 'stale') <> 'ignored_out_of_order'
    or (select result ->> 'status' from control_plane_results where name = 'waiting') <> 'waiting_approval'
  then
    raise exception 'unexpected intake status';
  end if;
  if (select result -> 'externalEffects' from control_plane_results where name = 'first') <> '[]'::jsonb
    or (select result -> 'repositoryMutations' from control_plane_results where name = 'first') <> '[]'::jsonb
    or (select result -> 'productionMutations' from control_plane_results where name = 'first') <> '[]'::jsonb
  then
    raise exception 'dry-run report declares an external effect';
  end if;
end;
$$;

insert into private.work_items (
  repository, issue_number, issue_updated_at, title, body_sha256, state
) values (
  'Verah-os/Verah-Command-Center', 900,
  '2026-07-31T20:00:00Z', 'Lock holder', repeat('f', 64), 'planning'
);
insert into private.locks (
  resource_key, work_item_id, acquired_at, heartbeat_at, lease_expires_at
)
select 'control-plane:global', id,
  '2026-07-31T20:00:00Z', '2026-07-31T20:00:00Z', '2026-07-31T21:00:00Z'
from private.work_items where issue_number = 900;

select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into control_plane_results (name, result)
select 'lock_blocked', public.process_control_plane_dry_run(
  'synthetic.issue.69.blocked', 'Verah-os/Verah-Command-Center', 69,
  '2026-07-31T20:00:00Z', 'Blocked', repeat('1', 64),
  'verah-maintainer', true, repeat('2', 64),
  '{"objective":"blocked","steps":["wait"],"acceptanceCriteria":["safe"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:04Z'
);
reset role;

update private.locks set lease_expires_at = '2026-07-31T20:01:00Z';

select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into control_plane_results (name, result)
select 'lock_reclaimed', public.process_control_plane_dry_run(
  'synthetic.issue.69.retry', 'Verah-os/Verah-Command-Center', 69,
  '2026-07-31T20:00:00Z', 'Reclaimed', repeat('1', 64),
  'verah-maintainer', true, repeat('3', 64),
  '{"objective":"retry","steps":["plan"],"acceptanceCriteria":["safe"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:05Z'
);
reset role;

do $$
begin
  if (select result ->> 'status' from control_plane_results where name = 'lock_blocked') <> 'blocked'
    or (select result ->> 'status' from control_plane_results where name = 'lock_reclaimed') <> 'completed'
  then
    raise exception 'global lock lease behavior failed';
  end if;
end;
$$;

insert into private.work_items (
  repository, issue_number, issue_updated_at, title, body_sha256, state
) values (
  'Verah-os/Verah-Command-Center', 70,
  '2026-07-31T20:00:00Z', 'Interrupted', repeat('4', 64), 'planning'
);
insert into private.execution_runs (
  work_item_id, run_number, state, active, checkpoint, started_at, updated_at
)
select id, 1, 'planning', true, 'plan_validated',
  '2026-07-31T20:00:00Z', '2026-07-31T20:00:00Z'
from private.work_items where issue_number = 70;
insert into private.budgets (
  execution_run_id, max_duration_ms, max_steps, max_cost_microunits,
  estimated_steps, estimated_cost_microunits, deadline_at, created_at, updated_at
)
select run.id, 30000, 20, 10000, 5, 500,
  '2026-07-31T20:01:00Z', '2026-07-31T20:00:00Z', '2026-07-31T20:00:00Z'
from private.execution_runs as run
join private.work_items as item on item.id = run.work_item_id
where item.issue_number = 70;
insert into private.locks (
  resource_key, work_item_id, execution_run_id,
  acquired_at, heartbeat_at, lease_expires_at
)
select 'control-plane:global', item.id, run.id,
  '2026-07-31T20:00:00Z', '2026-07-31T20:00:00Z', '2026-07-31T20:01:00Z'
from private.work_items as item
join private.execution_runs as run on run.work_item_id = item.id
where item.issue_number = 70;

select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into control_plane_results (name, result)
select 'resumed', public.process_control_plane_dry_run(
  'synthetic.issue.70.resume', 'Verah-os/Verah-Command-Center', 70,
  '2026-07-31T20:00:00Z', 'Interrupted', repeat('4', 64),
  'verah-maintainer', true, repeat('5', 64),
  '{"objective":"resume","steps":["finish"],"acceptanceCriteria":["same run"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 20, 10000, 5, 500,
  '2026-07-31T20:02:06Z'
);

insert into control_plane_results (name, result)
select 'budget', public.process_control_plane_dry_run(
  'synthetic.issue.71.budget', 'Verah-os/Verah-Command-Center', 71,
  '2026-07-31T20:00:00Z', 'Budget', repeat('6', 64),
  'verah-maintainer', true, repeat('7', 64),
  '{"objective":"budget","steps":["stop"],"acceptanceCriteria":["blocked"],"constraints":["no mutation"],"risks":[],"gates":[]}'::jsonb,
  30000, 1, 1, 5, 500,
  '2026-07-31T20:02:07Z'
);
reset role;

do $$
begin
  if (select result ->> 'resumed' from control_plane_results where name = 'resumed') <> 'true'
    or (select result ->> 'status' from control_plane_results where name = 'resumed') <> 'blocked'
    or (select count(*) from private.execution_runs as run join private.work_items as item on item.id = run.work_item_id where item.issue_number = 70) <> 1
    or (select resume_count from private.execution_runs as run join private.work_items as item on item.id = run.work_item_id where item.issue_number = 70) <> 1
  then
    raise exception 'interrupted run was not resumed idempotently';
  end if;
  if (select result ->> 'status' from control_plane_results where name = 'budget') <> 'blocked' then
    raise exception 'budget excess did not block the run';
  end if;
end;
$$;

do $$
declare
  event_id bigint;
begin
  select min(id) into event_id from private.events;
  begin
    update private.events set payload = '{"tampered":true}'::jsonb where id = event_id;
    raise exception 'control plane event update was allowed';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from private.events where id = event_id;
    raise exception 'control plane event delete was allowed';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

rollback;
