\set ON_ERROR_STOP on
begin;
create schema maintenance_test;
create function maintenance_test.expect_error(statement text, expected_state text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'Expected failure: %', statement;
end;
$$;
grant usage on schema maintenance_test to authenticated, anon;
grant execute on function maintenance_test.expect_error(text,text) to authenticated, anon;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('c2160000-0000-4000-8000-000000000001','authenticated','authenticated','maintenance1@example.invalid','{}','{}',now(),now()),
 ('c2160000-0000-4000-8000-000000000002','authenticated','authenticated','maintenance2@example.invalid','{}','{}',now(),now()),
 ('c2160000-0000-4000-8000-000000000003','authenticated','authenticated','maintenance3@example.invalid','{}','{}',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2160000-0000-4000-8000-000000000001',true);
select public.start_customer_onboarding('Maintenance One');
select public.complete_customer_basic_onboarding('Maintenance One','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('MNT1A23','Volkswagen','Polo',2022,'1.0',null,'Manual','manual',null,null,false,true)->>'vehicle_id' as vehicle_id \gset
select set_config('maintenance_test.vehicle', :'vehicle_id',true);
select public.register_vehicle_maintenance(:'vehicle_id',' Óleo ','Troca de óleo','2026-08-01',10000,'first',12345,'2026-09-30',15000,true)->>'record_id' as record_id \gset
select set_config('maintenance_test.record', :'record_id',true);
-- Exact replay, including normalized type, is a no-op.
select public.register_vehicle_maintenance(:'vehicle_id','óleo','Troca de óleo','2026-08-01',10000,'first',12345,'2026-09-30',15000,true);
do $$ begin
  if (select count(*) from public.vehicle_maintenance_records) <> 1
    or (select count(*) from public.vehicle_expenses) <> 1
    or (public.vehicle_expense_summary(current_setting('maintenance_test.vehicle')::uuid)->>'total_cents')::integer <> 12345 then
    raise exception 'Maintenance retry duplicated expense value';
  end if;
  if exists(select 1 from public.vehicle_maintenance_records m join public.vehicle_expenses e on e.maintenance_record_id=m.id
    where e.owner_id<>m.owner_id or e.customer_id<>m.customer_id or e.vehicle_id<>m.vehicle_id or e.amount_cents<>m.amount_cents) then
    raise exception 'Canonical maintenance expense relationship diverged';
  end if;
end $$;
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,
 'óleo','Different','2026-08-01',10000,'first',12345,'2026-09-30',15000,true)$s$,'23505');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,
 'óleo','Troca de óleo','2026-08-01',10000,'first',12345,'2026-09-30',15000,false)$s$,'23505');
select maintenance_test.expect_error($s$update public.vehicle_expenses set amount_cents=1 where maintenance_record_id=current_setting('maintenance_test.record')::uuid$s$,'42501');
select maintenance_test.expect_error($s$delete from public.vehicle_expenses where maintenance_record_id=current_setting('maintenance_test.record')::uuid$s$,'42501');
select maintenance_test.expect_error($s$update public.vehicle_maintenance_records set description='changed'$s$,'42501');
select maintenance_test.expect_error($s$delete from public.vehicle_maintenance_records$s$,'42501');
select maintenance_test.expect_error($s$insert into public.vehicle_maintenance_records default values$s$,'42501');
select maintenance_test.expect_error($s$insert into public.vehicle_expenses(maintenance_record_id) values(current_setting('maintenance_test.record')::uuid)$s$,'42501');
-- Optional cost remains informational unless explicitly opted in; zero is allowed without expense.
select public.register_vehicle_maintenance(:'vehicle_id','pneus','Inspeção','2026-08-02',10100,'no-cost');
select public.register_vehicle_maintenance(:'vehicle_id','freios','Garantia','2026-08-02',10100,'zero',0);
select public.register_vehicle_maintenance(:'vehicle_id','filtro','Já lançado manualmente','2026-08-02',10100,'informational',9000);
do $$ begin
 if (select count(*) from public.vehicle_expenses) <> 1 then raise exception 'Implicit expense created'; end if;
end $$;
-- Database validation cannot be bypassed by calling RPC directly.
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',-1,'bad-km')$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b',current_date+1,1,'future')$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','infinity',1,'infinite')$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,' ','b','2026-08-01',1,'blank')$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'bad-next',null,'2026-07-31')$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',2,'bad-next-km',null,null,1)$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'no-value',null,null,null,true)$s$,'23514');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'zero-value',0,null,null,true)$s$,'23514');
-- A distinct owner cannot read or write through another owner's vehicle or key.
select set_config('request.jwt.claim.sub','c2160000-0000-4000-8000-000000000002',true);
select public.start_customer_onboarding('Maintenance Two');
select public.complete_customer_basic_onboarding('Maintenance Two','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('MNT2B34','Chevrolet','Onix',2022,'1.0',null,'Manual','manual',null,null,false,true)->>'vehicle_id' as second_vehicle \gset
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'óleo','Troca de óleo','2026-08-01',10000,'first',12345,'2026-09-30',15000,true)$s$,'42501');
do $$ begin
 if exists(select 1 from public.vehicle_maintenance_records) or exists(select 1 from public.vehicle_expenses) then
   raise exception 'Cross-owner data leaked'; end if;
end $$;
select public.register_vehicle_maintenance(:'second_vehicle','óleo','Own key','2026-08-01',10000,'first');
do $$ begin
 if (select count(*) from public.vehicle_maintenance_records)<>1 then raise exception 'Owner-scoped key failed'; end if;
end $$;
-- Missing application role must not pass SECURITY DEFINER authorization.
select set_config('request.jwt.claim.sub','c2160000-0000-4000-8000-000000000003',true);
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'unprofiled')$s$,'42501');
select public.start_provider_application('Maintenance Provider Ltda','Maintenance Provider','Franca');
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'provider')$s$,'42501');
do $$ begin
 if exists(select 1 from public.vehicle_maintenance_records) then raise exception 'Provider leaked maintenance'; end if;
end $$;
select set_config('request.jwt.claim.sub','c2160000-0000-4000-8000-000000000001',true);
update public.customer_vehicles set active=false where id=:'vehicle_id';
select maintenance_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('maintenance_test.vehicle')::uuid,'a','b','2026-08-01',1,'inactive')$s$,'42501');
do $$ begin
 if exists(select 1 from public.vehicle_maintenance_records) then raise exception 'Inactive vehicle leaked reminders'; end if;
end $$;
reset role;
do $$ declare r text; begin
 foreach r in array array['anon','service_role'] loop
   if has_table_privilege(r,'public.vehicle_maintenance_records','SELECT')
     or has_function_privilege(r,'public.register_vehicle_maintenance(uuid,text,text,date,integer,text,integer,date,integer,boolean)','EXECUTE') then
     raise exception 'Unsafe maintenance privileges for %',r;
   end if;
 end loop;
 if has_table_privilege('authenticated','public.vehicle_maintenance_records','INSERT,UPDATE,DELETE')
   or not has_table_privilege('authenticated','public.vehicle_maintenance_records','SELECT') then raise exception 'Unsafe authenticated grants'; end if;
end $$;
set local role anon;
select maintenance_test.expect_error('select * from public.vehicle_maintenance_records','42501');
rollback;
