\set ON_ERROR_STOP on

begin;

create schema vehicle_expenses_test;
create function vehicle_expenses_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;
grant usage on schema vehicle_expenses_test to authenticated;
grant execute on function vehicle_expenses_test.expect_error(text) to authenticated;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'expense.one@example.invalid', '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'expense.two@example.invalid', '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'expense.provider@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;

-- Customer one: canonical identity, basic onboarding and own confirmed vehicle.

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select public.start_customer_onboarding('Cliente Expense Um');
select public.complete_customer_basic_onboarding('Cliente Expense Um', 'pilot-alpha-onboarding-v1');
create temporary table vehicle_expenses_customer_one as
select public.confirm_customer_vehicle(
  'EXP1A23', 'Volkswagen', 'Polo', 2022, '1.0 MPI', null, 'Manual',
  'manual', null, null, false, true
) as result;

-- Customer two: separate canonical identity and vehicle for isolation checks.

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select public.start_customer_onboarding('Cliente Expense Dois');
select public.complete_customer_basic_onboarding('Cliente Expense Dois', 'pilot-alpha-onboarding-v1');
create temporary table vehicle_expenses_customer_two as
select public.confirm_customer_vehicle(
  'EXP2B34', 'Chevrolet', 'Onix', 2023, '1.0 LT', null, 'Manual',
  'manual', null,null,false,true
) as result;

-- Provider: no garage access at all..

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
select public.start_provider_application('Oficina Expense Teste Ltda', 'Oficina Expense Teste', 'Franca');

-- Back to customer one for the happy path. 
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,description,amount_cents,occurred_on,odometer_km)
values
  ('b1000000-0000-4000-8000-000000000001',(select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),'combustivel','Abastecimento posto',25000,'2026-09-02',10000),
  ('b1000000-0000-4000-8000-000000000001',(select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),'manutencao','Troca de oleo',120000,'2026-09-03',10400),
  ('b1000000-0000-4000-8000-000000000001',(select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),'outros','Estacionamento',5000,'2026-09-04',null),
  ('b1000000-0000-4000-8000-000000000001',(select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),'combustivel','Abastecimento viagem',8000,'2026-09-05',10600);

do $$ begin
  if (select count(*) from public.vehicle_expenses) <> 4 then
    raise exception 'Customer one could not insert their own expenses';
  end if;
end $$;

-- Deterministic canonical summary: totals, breakdown and cost-per-km with valid odometer base.

do $$ begin
  if (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'total_cents')::integer <> 158000
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'fuel_cents')::integer <> 33000
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'maintenance_cents')::integer <> 120000
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'other_cents')::integer <> 5000
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'distance_km')::integer <> 600
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'cost_per_km_cents')::numeric <> 263.33 then
    raise exception 'Summary mismatch over full period';
  end if;
end $$;

do $$ begin
  if (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
        '2026-09-03'::date,'2026-09-05'::date)) ->> 'total_cents')::integer <> 133000
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
        '2026-09-03'::date,'2026-09-05'::date)) ->> 'cost_per_km_cents')::numeric <> 665.00 then
    raise exception 'Summary mismatch over filtered period';
  end if;
end $$;

-- Without a valid odometer base the cost-per-km must remain NULL (never invented.

do $$ begin
  if (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
        '2026-09-05'::date,null)) ->> 'cost_per_km_cents')is not null then
    raise exception 'Cost-per-km was invented without a valid odometer base';
  end if;
  if (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
        '2027-01-01'::date,'2027-01-31'::date)) ->> 'total_cents')::integer <> 0 then
    raise exception 'Empty period was not reported as zero total';
  end if;
end $$;

-- Cross-customer isolation: reads, writes, updates and deletes must all fail closed



set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);

do $$ begin
  if (select count(*) from public.vehicle_expenses) <> 0 then
    raise exception 'Customer two leaked customer one expenses through RLS';
  end if;
end $$;

select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,description,amount_cents,occurred_on,odometer_km)
  values (
    'b1000000-0000-4000-8000-000000000002',
    (select private.current_customer_id()),
    (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'combustivel', 'Invadindo', 1, '2026-09-02', null
  )
$statement$);

select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,description,amount_cents,occurred_on,odometer_km)
  values (
    'b1000000-0000-4000-8000-000000000002',
    (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_two limit 1),
    (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'outros', 'Identidade trocada', 1, '2026-09-02', null
  )
$statement$);

do $$
declare affected integer;
begin
  update public.vehicle_expenses set amount_cents = 1
  where owner_id = 'b1000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-customer expense update was allowed'; end if;
end $$;

do $$
declare affected integer;
begin
  delete from public.vehicle_expenses where owner_id = 'b1000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-customer expense delete was allowed'; end if;
end $$;

-- The summary RPC is security invoker: another customer sees only zeros.

do $$ begin
  if (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'total_cents')::integer <> 0
    or (select (public.vehicle_expense_summary(
        (select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1))) ->> 'cost_per_km_cents')is not null then

    raise exception 'Summary RPC leaked cross-customer expense data';
  end if;
end $$;

-- Provider has no expense access either. 
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
do $$ begin
  if (select count(*) from public.vehicle_expenses) <> 0 then
    raise exception 'Provider gained expense garage access';
  end if;
end $$;

-- Validations reject malformed manual entries

 
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,amount_cents,occurred_on) values (
    'b1000000-0000-4000-8000-000000000001',
    (select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'combustivel', 0, '2026-09-06')
$statement$);
select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,amount_cents,occurred_on) values (
    'b1000000-0000-4000-8000-000000000001',
    (select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'combustivel', -10,'2026-09-06')
$statement$);
select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,amount_cents,occurred_on) values (
    'b1000000-0000-4000-8000-000000000001',
    (select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'reforma', 10,'2026-09-06')
$statement$);
select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,amount_cents,occurred_on,odometer_km) values (
    'b1000000-0000-4000-8000-000000000001',
    (select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'outros', 10,'2026-09-06',-5)
$statement$);
select vehicle_expenses_test.expect_error($statement$
  insert into public.vehicle_expenses(owner_id,customer_id,vehicle_id,category,description,amount_cents,occurred_on) values (
    'b1000000-0000-4000-8000-000000000001',
    (select private.current_customer_id()),(select (result->>'vehicle_id')::uuid from vehicle_expenses_customer_one limit 1),
    'outros', repeat('x', 161), 10,'2026-09-06')
$statement$);

-- Anon and public execute on the table are revoked; the rls_catalog registry covers grants.

rollback;