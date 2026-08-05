\set ON_ERROR_STOP on

begin;

create schema second_opinion_test;

create function second_opinion_test.expect_error(statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema second_opinion_test to anon, authenticated, service_role;
grant execute on function second_opinion_test.expect_error(text) to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'second_opinion_requests',
    'second_opinion_events',
    'vehicle_movement_guidance'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is disabled for public.%', table_name;
    end if;

    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', table_name), 'select')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'insert')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'update')
      or pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'delete') then
      raise exception 'Unsafe grants on public.%', table_name;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon', 'public.request_second_opinion(uuid,uuid,uuid,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.request_second_opinion(uuid,uuid,uuid,text,text,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.request_second_opinion(uuid,uuid,uuid,text,text,text)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.get_second_opinion_case(uuid)', 'execute') then
    raise exception 'Second opinion function grants are unsafe';
  end if;

  if pg_catalog.has_function_privilege('authenticated', 'private.reject_second_opinion_artifact_mutation()', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'private.reject_second_opinion_artifact_mutation()', 'execute') then
    raise exception 'Private append-only helper is executable outside its owner';
  end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'movement.customer@example.invalid', '{}', '{}', now(), now()),
  ('b1111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'movement.other@example.invalid', '{}', '{}', now(), now()),
  ('b1111111-1111-4111-8111-111111111113', 'authenticated', 'authenticated', 'movement.unprofiled@example.invalid', '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222221', 'authenticated', 'authenticated', 'movement.provider1@example.invalid', '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'movement.provider2@example.invalid', '{}', '{}', now(), now()),
  ('b3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'movement.concierge@example.invalid', '{}', '{}', now(), now()),
  ('b4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'movement.admin@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.service_providers (id, name, trade_name, city, specialties, status, rating)
values
  ('b5555555-5555-4555-8555-555555555551', 'Movement Provider One', 'Movement Provider One', 'Test City', '["maintenance"]', 'active', 5),
  ('b5555555-5555-4555-8555-555555555552', 'Movement Provider Two', 'Movement Provider Two', 'Test City', '["maintenance"]', 'active', 4.5)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('b1111111-1111-4111-8111-111111111111', 'customer', 'Movement Customer', null),
  ('b1111111-1111-4111-8111-111111111112', 'customer', 'Other Customer', null),
  ('b2222222-2222-4222-8222-222222222221', 'provider', 'Movement Provider One', 'b5555555-5555-4555-8555-555555555551'),
  ('b2222222-2222-4222-8222-222222222222', 'provider', 'Movement Provider Two', 'b5555555-5555-4555-8555-555555555552'),
  ('b3333333-3333-4333-8333-333333333333', 'concierge', 'Movement Concierge', null),
  ('b4444444-4444-4444-8444-444444444444', 'admin', 'Movement Admin', null)
on conflict (user_id) do nothing;

insert into public.service_requests (
  id, reference_code, customer_name, vehicle_brand, vehicle_model, vehicle_year,
  city, customer_report, perceived_urgency, service_stage, origin, created_by
)
values (
  'b6666666-6666-4666-8666-666666666661', 'VERAH-SO-001', 'Movement Customer',
  'Honda', 'Fit', 2018, 'Test City', 'Synthetic movement request.', 'alta',
  'aguardando_aprovacao', 'concierge', 'b1111111-1111-4111-8111-111111111111'
);

insert into public.service_quotes (
  id, service_request_id, provider_id, status, labor_total, parts_total,
  additional_total, total_amount, estimated_duration, customer_summary,
  warranty_text, valid_until, submitted_at, created_by
)
values (
  'b7777777-7777-4777-8777-777777777771',
  'b6666666-6666-4666-8666-666666666661',
  'b5555555-5555-4555-8555-555555555551',
  'submitted', 100, 200, 0, 300, '2 horas', 'Escopo sintético',
  '90 dias', current_date + 7, now(), 'b2222222-2222-4222-8222-222222222221'
);

insert into public.service_quote_items (
  id, quote_id, item_type, description, quantity, unit_price, total_price, is_optional
)
values
  ('b8888888-8888-4888-8888-888888888881', 'b7777777-7777-4777-8777-777777777771', 'labor', 'Avaliação sintética', 1, 100, 100, false),
  ('b8888888-8888-4888-8888-888888888882', 'b7777777-7777-4777-8777-777777777771', 'part', 'Peça sintética', 1, 200, 200, false);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3333333-3333-4333-8333-333333333333"}', true);

select public.create_service_quote_revision(
  'b7777777-7777-4777-8777-777777777771', 'second-opinion-revision-one'
) as revision_id \gset

select public.assess_quote_revision(
  :'revision_id', 'maintenance.second-opinion.v1',
  80::smallint, 80::smallint, 70::smallint, 80::smallint, 80::smallint,
  80::smallint, 90::smallint, true, 'usable_with_caveats',
  '[]', '[]', '["Requer revisão humana"]', 'second-opinion-eligible-assessment'
) as assessment_id \gset

select public.request_second_opinion(
  :'revision_id',
  'b5555555-5555-4555-8555-555555555552',
  :'assessment_id',
  'Revisão elegível por divergência de escopo.',
  'Validar o escopo técnico sem concluir diagnóstico.',
  'second-opinion-request-one'
) as request_id \gset

select public.request_second_opinion(
  :'revision_id',
  'b5555555-5555-4555-8555-555555555552',
  :'assessment_id',
  'Revisão elegível por divergência de escopo.',
  'Validar o escopo técnico sem concluir diagnóstico.',
  'second-opinion-request-one'
);

do $$
begin
  if (select count(*) from public.second_opinion_requests) <> 1
    or (select count(*) from public.second_opinion_events where event_type = 'requested') <> 1 then
    raise exception 'Second opinion request redelivery created duplicates';
  end if;
end;
$$;

select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.request_second_opinion(%L,%L,%L,%L,%L,%L)',
    :'revision_id', 'b5555555-5555-4555-8555-555555555552', :'assessment_id',
    'Justificativa diferente.', 'Outro motivo.', 'second-opinion-request-one'
  )
);

select pg_catalog.set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222221', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222221"}', true);
do $$
begin
  if exists (select 1 from public.second_opinion_requests)
    or exists (select 1 from public.second_opinion_events)
    or exists (select 1 from public.vehicle_movement_guidance) then
    raise exception 'Non-participating provider can read second opinion artifacts';
  end if;
end;
$$;
select second_opinion_test.expect_error(
  pg_catalog.format('select public.respond_to_second_opinion(%L,%L,null,%L)', :'request_id', 'accepted', 'wrong-provider')
);

select pg_catalog.set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222"}', true);
do $$
begin
  if (select count(*) from public.second_opinion_requests) <> 1
    or (select count(*) from public.second_opinion_events) <> 1
    or exists (select 1 from public.vehicle_movement_guidance) then
    raise exception 'Participating provider visibility is not minimal';
  end if;
end;
$$;

select public.respond_to_second_opinion(
  :'request_id', 'accepted', 'Aceite registrado para a revisão.', 'second-opinion-accept-one'
) as accepted_event_id \gset
select public.respond_to_second_opinion(
  :'request_id', 'accepted', 'Aceite registrado para a revisão.', 'second-opinion-accept-one'
);
select public.submit_second_opinion_result(
  :'request_id', 'professional_assessment_required',
  'Avaliação presencial necessária antes de qualquer conclusão.',
  'second-opinion-result-one'
) as result_event_id \gset

select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.respond_to_second_opinion(%L,%L,%L,%L)',
    :'request_id', 'declined', 'Resposta tardia.', 'second-opinion-late-decline'
  )
);

select pg_catalog.set_config('request.jwt.claim.sub', 'b3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3333333-3333-4333-8333-333333333333"}', true);

select public.record_vehicle_movement_guidance(
  :'revision_id', :'request_id', 'tow_recommended',
  'O caso exige transporte conservador confirmado por profissional.',
  'vehicle-movement-guidance-one'
) as guidance_id \gset
select public.record_vehicle_movement_guidance(
  :'revision_id', :'request_id', 'tow_recommended',
  'O caso exige transporte conservador confirmado por profissional.',
  'vehicle-movement-guidance-one'
);

do $$
begin
  if (select count(*) from public.vehicle_movement_guidance) <> 1
    or not exists (
      select 1 from public.vehicle_movement_guidance
      where idempotency_key = 'vehicle-movement-guidance-one'
        and human_confirmed_by = 'b3333333-3333-4333-8333-333333333333'
        and human_confirmed_at is not null
        and customer_message !~* '(segur[oa] para|pode circular|autorizad[oa] a circular)'
    ) then
    raise exception 'Vehicle movement guidance is not idempotent, conservative and human-confirmed';
  end if;
end;
$$;

select second_opinion_test.expect_error(
  pg_catalog.format('update public.second_opinion_requests set request_reason = %L where id = %L', 'Mutated', :'request_id')
);
select second_opinion_test.expect_error(
  pg_catalog.format('delete from public.second_opinion_events where id = %L', :'result_event_id')
);
select second_opinion_test.expect_error(
  pg_catalog.format('update public.vehicle_movement_guidance set guidance_code = %L where id = %L', 'do_not_move', :'guidance_id')
);

reset role;
select pg_catalog.set_config('second_opinion_test.request_id', :'request_id', true);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111111', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1111111-1111-4111-8111-111111111111"}', true);
do $$
declare
  case_payload jsonb;
  movement_payload jsonb;
begin
  if exists (select 1 from public.second_opinion_requests)
    or exists (select 1 from public.second_opinion_events)
    or exists (select 1 from public.vehicle_movement_guidance) then
    raise exception 'Customer can directly read internal second opinion tables';
  end if;

  case_payload := public.get_second_opinion_case(pg_catalog.current_setting('second_opinion_test.request_id', true)::uuid);
  movement_payload := public.get_vehicle_movement_guidance('b6666666-6666-4666-8666-666666666661');
  if case_payload ->> 'status' <> 'result_submitted'
    or movement_payload ->> 'guidance_code' <> 'tow_recommended'
    or movement_payload ->> 'message' is null
    or (case_payload::text || movement_payload::text) ~* '(review_provider_id|provider one|provider two|internal_reason|eligibility_justification|result_summary|pode circular|segur[oa] para|autorizad[oa] a circular)' then
    raise exception 'Customer projection is incomplete, unsafe or leaks internal/provider data';
  end if;
end;
$$;

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111112', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1111111-1111-4111-8111-111111111112"}', true);
select second_opinion_test.expect_error(
  pg_catalog.format('select public.get_second_opinion_case(%L)', :'request_id')
);
select second_opinion_test.expect_error(
  $$select public.get_vehicle_movement_guidance('b6666666-6666-4666-8666-666666666661')$$
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1111111-1111-4111-8111-111111111113', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1111111-1111-4111-8111-111111111113"}', true);
select second_opinion_test.expect_error(
  pg_catalog.format('select public.get_second_opinion_case(%L)', :'request_id')
);
select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.request_second_opinion(%L,%L,%L,%L,%L,%L)',
    :'revision_id', 'b5555555-5555-4555-8555-555555555552', :'assessment_id',
    'Sem perfil.', 'Não autorizado.', 'unprofiled-request'
  )
);

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b3333333-3333-4333-8333-333333333333', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3333333-3333-4333-8333-333333333333"}', true);
select public.create_service_quote_revision(
  'b7777777-7777-4777-8777-777777777771', 'second-opinion-revision-two'
) as newer_revision_id \gset
select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.request_second_opinion(%L,%L,%L,%L,%L,%L)',
    :'revision_id', 'b5555555-5555-4555-8555-555555555552', :'assessment_id',
    'Revisão antiga.', 'Tentativa obsoleta.', 'second-opinion-stale-request'
  )
);
select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.record_vehicle_movement_guidance(%L,%L,%L,%L,%L)',
    :'revision_id', :'request_id', 'do_not_move', 'Revisão antiga.', 'vehicle-movement-stale'
  )
);
select second_opinion_test.expect_error(
  $$select public.get_vehicle_movement_guidance('b6666666-6666-4666-8666-666666666661')$$
);

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
select second_opinion_test.expect_error(
  pg_catalog.format(
    'select public.record_vehicle_movement_guidance(%L,%L,%L,%L,%L)',
    :'newer_revision_id', null, 'do_not_move', 'Automated decision.', 'service-role-guidance'
  )
);

rollback;
