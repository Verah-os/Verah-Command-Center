\set ON_ERROR_STOP on

begin;

create schema provider_invitation_test;
create function provider_invitation_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema provider_invitation_test to anon, authenticated, service_role;
grant execute on function provider_invitation_test.expect_error(text) to anon, authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'provider_invitations', 'provider_invitation_responses',
    'provider_invitation_events', 'provider_selections'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name and relation.relrowsecurity
    ) then raise exception 'RLS is disabled for public.%', table_name; end if;
    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe grants on public.%', table_name;
    end if;
  end loop;
  if pg_catalog.has_function_privilege('anon', 'public.invite_service_provider(uuid,uuid,uuid,jsonb,timestamptz,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.select_provider_invitation(uuid,text,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.respond_to_provider_invitation(uuid,text,text,text)', 'execute') then
    raise exception 'Provider invitation function grants are unsafe';
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'invite.customer@example.invalid', '{}', '{}', now(), now()),
  ('d2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'invite.source@example.invalid', '{}', '{}', now(), now()),
  ('d2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'invite.provider1@example.invalid', '{}', '{}', now(), now()),
  ('d2222222-2222-4222-8222-222222222223', 'authenticated', 'authenticated', 'invite.provider2@example.invalid', '{}', '{}', now(), now()),
  ('d3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'invite.concierge@example.invalid', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'invite.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating, is_synthetic)
values
  ('d5555555-5555-4555-8555-555555555551', 'Invitation Source', 'Invitation Source', 'Test City', '["maintenance"]', 'active', 5, true),
  ('d5555555-5555-4555-8555-555555555552', 'Invitation Provider One', 'Invitation Provider One', 'Test City', '["maintenance"]', 'active', 5, true),
  ('d5555555-5555-4555-8555-555555555553', 'Invitation Provider Two', 'Invitation Provider Two', 'Test City', '["maintenance"]', 'active', 5, true)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('d1111111-1111-4111-8111-111111111111', 'customer', 'Invitation Customer', null),
  ('d2222222-2222-4222-8222-222222222221', 'provider', 'Invitation Source', 'd5555555-5555-4555-8555-555555555551'),
  ('d2222222-2222-4222-8222-222222222222', 'provider', 'Invitation Provider One', 'd5555555-5555-4555-8555-555555555552'),
  ('d2222222-2222-4222-8222-222222222223', 'provider', 'Invitation Provider Two', 'd5555555-5555-4555-8555-555555555553'),
  ('d3333333-3333-4333-8333-333333333333', 'concierge', 'Invitation Concierge', null),
  ('d4444444-4444-4444-8444-444444444444', 'admin', 'Invitation Admin', null)
on conflict (user_id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year,
  city, customer_report, perceived_urgency, service_stage, origin, created_by,
  operation_context, service_category_code
) values (
  'd6666666-6666-4666-8666-666666666661', 'VERAH-INVITE-001', 'Invitation Customer',
  'Honda', 'Fit', 2018, 'Test City', 'Synthetic invitation request.', 'media',
  'aguardando_aprovacao', 'concierge', 'd1111111-1111-4111-8111-111111111111',
  'demo', 'maintenance'
);
insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
) values (
  'd7777777-7777-4777-8777-777777777771', 'd6666666-6666-4666-8666-666666666661',
  'd5555555-5555-4555-8555-555555555551', 'submitted', 100, 0, 0, 100,
  '1 hora', 'Escopo sintético', '30 dias', current_date + 7, now(),
  'd2222222-2222-4222-8222-222222222221'
);
insert into public.service_quote_revisions (
  id, quote_id, service_request_id, provider_id, revision_number,
  commercial_scope, snapshot, content_hash, idempotency_key, author_user_id, submitted_at
) values (
  'd8888888-8888-4888-8888-888888888881', 'd7777777-7777-4777-8777-777777777771',
  'd6666666-6666-4666-8666-666666666661', 'd5555555-5555-4555-8555-555555555551',
  1, 'service_only', '{"items":[],"totals":{"total":100}}', repeat('b', 64),
  'provider-invitation-security-revision', 'd2222222-2222-4222-8222-222222222221', now()
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'd3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d3333333-3333-4333-8333-333333333333"}', true);

select provider_invitation_test.expect_error(
  pg_catalog.format(
    'select public.invite_service_provider(%L,%L,%L,%L::jsonb,%L::timestamptz,%L)',
    'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
    'd5555555-5555-4555-8555-555555555552', '{"contact":"Ligar para (11) 99999-8888"}',
    now() + interval '1 day', 'provider-invite-formatted-phone'
  )
);

select public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555552', '{"summary":"Revisar escopo sintético","vehicle":"Honda Fit 2018"}',
  now() + interval '1 day', 'provider-invite-one'
) as invitation_one \gset
select public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555553', '{"summary":"Revisar escopo sintético","vehicle":"Honda Fit 2018"}',
  now() + interval '1 day', 'provider-invite-two'
) as invitation_two \gset

select public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555552', '{"summary":"Revisar escopo sintético","vehicle":"Honda Fit 2018"}',
  (select expires_at from public.provider_invitations where id = :'invitation_one'), 'provider-invite-one'
);
do $$ begin
  if (select count(*) from public.provider_invitations) <> 2
    or (select count(*) from public.provider_invitation_events where event_type = 'invited') <> 2 then
    raise exception 'Invitation replay created duplicates';
  end if;
end $$;
select provider_invitation_test.expect_error(
  pg_catalog.format(
    'select public.invite_service_provider(%L,%L,%L,%L::jsonb,%L::timestamptz,%L)',
    'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
    'd5555555-5555-4555-8555-555555555552', '{"summary":"Changed"}', now() + interval '1 day', 'provider-invite-one'
  )
);

select pg_catalog.set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222221', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d2222222-2222-4222-8222-222222222221"}', true);
do $$ begin
  if exists (select 1 from public.provider_invitations)
    or exists (select 1 from public.provider_invitation_responses)
    or exists (select 1 from public.provider_invitation_events)
    or exists (select 1 from public.provider_selections) then
    raise exception 'Uninvited provider discovered invitation artifacts';
  end if;
end $$;
select provider_invitation_test.expect_error(
  pg_catalog.format('select public.respond_to_provider_invitation(%L,%L,null,%L)', :'invitation_one', 'accepted', 'wrong-provider-response')
);

select pg_catalog.set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d2222222-2222-4222-8222-222222222222"}', true);
do $$ begin
  if (select count(*) from public.provider_invitations) <> 1
    or exists (select 1 from public.provider_invitations where provider_id <> 'd5555555-5555-4555-8555-555555555552')
    or exists (select 1 from public.provider_invitation_events)
    or exists (select 1 from public.provider_selections) then
    raise exception 'Invited provider visibility leaked competitors or audit data';
  end if;
end $$;
select public.respond_to_provider_invitation(:'invitation_one', 'accepted', null, 'provider-response-one') as response_one \gset
select public.respond_to_provider_invitation(:'invitation_one', 'accepted', null, 'provider-response-one');
do $$ begin
  if (select count(*) from public.provider_invitation_responses) <> 1 then
    raise exception 'Provider response replay created duplicates';
  end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', 'd3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d3333333-3333-4333-8333-333333333333"}', true);
select public.revoke_provider_invitation(:'invitation_two', 'provider-revoke-two');
select public.revoke_provider_invitation(:'invitation_two', 'provider-revoke-two');

select public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555553', '{"summary":"Convite sintético curto"}',
  now() + interval '500 milliseconds', 'provider-invite-expiring'
) as expiring_invitation \gset
select pg_catalog.pg_sleep(0.7);

select pg_catalog.set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222223', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d2222222-2222-4222-8222-222222222223"}', true);
do $$ begin
  if exists (select 1 from public.provider_invitations) then
    raise exception 'Expired invitation remained visible';
  end if;
end $$;
select provider_invitation_test.expect_error(
  pg_catalog.format('select public.respond_to_provider_invitation(%L,%L,null,%L)', :'expiring_invitation', 'accepted', 'expired-response')
);

select pg_catalog.set_config('request.jwt.claim.sub', 'd3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d3333333-3333-4333-8333-333333333333"}', true);
select public.select_provider_invitation(
  :'invitation_one', 'Seleção humana após revisão da resposta.', 'provider-selection-one'
) as selection_one \gset
select public.select_provider_invitation(
  :'invitation_one', 'Seleção humana após revisão da resposta.', 'provider-selection-one'
);
do $$ begin
  if (select count(*) from public.provider_selections) <> 1
    or (select count(*) from public.provider_invitation_events where event_type = 'selected') <> 1
    or not exists (
      select 1 from public.service_requests
      where id = 'd6666666-6666-4666-8666-666666666661'
        and provider_id = 'd5555555-5555-4555-8555-555555555552'
        and service_stage = 'prestador_indicado'
    ) then raise exception 'Human provider selection was not atomic or idempotent';
  end if;
end $$;
select provider_invitation_test.expect_error(
  pg_catalog.format('select public.revoke_provider_invitation(%L,%L)', :'invitation_one', 'late-revoke')
);
select provider_invitation_test.expect_error(
  pg_catalog.format('update public.provider_invitation_responses set note=%L where id=%L', 'Mutated', :'response_one')
);
select provider_invitation_test.expect_error(
  pg_catalog.format('delete from public.provider_selections where id=%L', :'selection_one')
);

reset role;
update public.service_quotes
set status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
where id = 'd7777777-7777-4777-8777-777777777771';
insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
) values (
  'd7777777-7777-4777-8777-777777777772', 'd6666666-6666-4666-8666-666666666661',
  'd5555555-5555-4555-8555-555555555552', 'submitted', 120, 0, 0, 120,
  '2 horas', 'Escopo substituto sintético', '30 dias', current_date + 7,
  pg_catalog.clock_timestamp(), 'd2222222-2222-4222-8222-222222222222'
);
insert into public.service_quote_revisions (
  id, quote_id, service_request_id, provider_id, revision_number,
  commercial_scope, snapshot, content_hash, idempotency_key,
  author_user_id, submitted_at, created_at
) values (
  'd8888888-8888-4888-8888-888888888882', 'd7777777-7777-4777-8777-777777777772',
  'd6666666-6666-4666-8666-666666666661', 'd5555555-5555-4555-8555-555555555552',
  1, 'service_only', '{"items":[],"totals":{"total":120}}', repeat('d', 64),
  'provider-invitation-replacement-revision', 'd2222222-2222-4222-8222-222222222222',
  pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'd3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d3333333-3333-4333-8333-333333333333"}', true);
create temporary table provider_invitation_replay_results (
  replay_kind text primary key,
  invitation_id uuid not null
);
select provider_invitation_test.expect_error(
  pg_catalog.format(
    'select public.invite_service_provider(%L,%L,%L,%L::jsonb,%L::timestamptz,%L)',
    'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
    'd5555555-5555-4555-8555-555555555553', '{"summary":"Revisão antiga"}',
    now() + interval '1 day', 'provider-invite-stale-request-revision'
  )
);
insert into provider_invitation_replay_results (replay_kind, invitation_id)
select 'expired', public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555553', '{"summary":"Convite sintético curto"}',
  (select expires_at from public.provider_invitations where id = :'expiring_invitation'),
  'provider-invite-expiring'
);

reset role;
update public.service_requests set service_stage = 'cancelado'
where id = 'd6666666-6666-4666-8666-666666666661';
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'd3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"d3333333-3333-4333-8333-333333333333"}', true);
insert into provider_invitation_replay_results (replay_kind, invitation_id)
select 'closed', public.invite_service_provider(
  'd6666666-6666-4666-8666-666666666661', 'd8888888-8888-4888-8888-888888888881',
  'd5555555-5555-4555-8555-555555555553', '{"summary":"Convite sintético curto"}',
  (select expires_at from public.provider_invitations where id = :'expiring_invitation'),
  'provider-invite-expiring'
) ;
do $$ begin
  if exists (
    select 1 from provider_invitation_replay_results as replay
    where replay.invitation_id <> (
      select invitation.id from public.provider_invitations as invitation
      where invitation.idempotency_key = 'provider-invite-expiring'
    )
  ) or (select count(*) from provider_invitation_replay_results) <> 2 then
    raise exception 'Late invitation replay did not return the original result';
  end if;
end $$;

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select provider_invitation_test.expect_error(
  pg_catalog.format('select public.select_provider_invitation(%L,%L,%L)', :'invitation_one', 'Automated selection.', 'service-role-selection')
);

rollback;
