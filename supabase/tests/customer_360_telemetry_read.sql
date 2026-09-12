\set ON_ERROR_STOP on

-- #241 umbrella repository-safe: leitura isolável da futura Cliente 360° telemetria.
-- Sem migration, sem fonte paralela, sem banco remoto. Roda no banco isolado do runner
-- (scripts/ci/test-database.sh, bloco 1 e bloco 2) e não toca os arquivos da Draft #236.
-- Contratos canônicos #233 exigidos: mileage, fuel, charging, maintenance, documents, expenses.
-- Integration refresh: revalidar esta fatia contra a main consolidada após #240; sem mudança de contrato.

begin;

create schema customer_360_test;

create function customer_360_test.expect_error(statement text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Expected statement to fail: %', statement;
end;
$$;

grant usage on schema customer_360_test to authenticated, anon;
grant execute on function customer_360_test.expect_error(text) to authenticated, anon;

-- Unique fixtures por teste, para não colidir com demais suítes já registradas no CI.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('7a360000-0000-4000-8000-000000000001','authenticated','authenticated','c360.one@example.invalid','{}','{}',now(),now()),
 ('7a360000-0000-4000-8000-000000000002','authenticated','authenticated','c360.two@example.invalid','{}','{}',now(),now()),
 ('7a360000-0000-4000-8000-000000000003','authenticated','authenticated','c360.admin@example.invalid','{}','{}',now(),now());

insert into public.user_profiles(user_id,role,display_name) values
 ('7a360000-0000-4000-8000-000000000001','customer','Cliente 360 Um'),
 ('7a360000-0000-4000-8000-000000000002','customer','Cliente 360 Dois'),
 ('7a360000-0000-4000-8000-000000000003','admin','Admin 360')
on conflict(user_id) do nothing;

-- Cliente um: identidade canônica, onboarding completo e veículo confirmado (fixture #233).
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.sub','7a360000-0000-4000-8000-000000000001',true);
select public.start_customer_onboarding('Cliente 360 Um');
select public.complete_customer_basic_onboarding('Cliente 360 Um','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('CZA1B23','Volkswagen','ID.4',2023,'Pro',null,'Automatico','manual',null,null,false,true)->>'vehicle_id' as vehicle_one \gset
select pg_catalog.set_config('customer_360_test.vehicle_one',:'vehicle_one',true);

-- Telemetria canônica via RPCs (todas pertencentes ao dono, idempotência própria).
select public.register_vehicle_mileage(:'vehicle_one',15000,'2026-08-01T12:00:00Z',null,'c360-m1');
select public.register_vehicle_fuel(:'vehicle_one','2026-08-02T12:00:00Z',15200,30.5,250.00,'gasolina',null,'c360-f1');
select public.register_vehicle_charging(:'vehicle_one','2026-08-03T12:00:00Z',15400,28.5,90.00,82,'recarga_publica',null,'c360-c1');
select public.register_vehicle_maintenance(:'vehicle_one','oleo','Troca de oleo','2026-08-04',15600,'c360-mt1',25000,'2026-10-04',25000,true);
select public.register_vehicle_document(:'vehicle_one','nota_fiscal','2026-08-05','nota.pdf','application/pdf',4096,'c360-d1','NFS-360','Nota sintetica');

-- Cliente dois: identidade e veículo distintos para isolamento; vínculo por IDs canônicos.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.sub','7a360000-0000-4000-8000-000000000002',true);
select public.start_customer_onboarding('Cliente 360 Dois');
select public.complete_customer_basic_onboarding('Cliente 360 Dois','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('FRA2C34','Chevrolet','Onix',2022,'1.0',null,'Manual','manual',null,null,false,true)->>'vehicle_id' as vehicle_two \gset
select pg_catalog.set_config('customer_360_test.vehicle_two',:'vehicle_two',true);
select public.register_vehicle_mileage(:'vehicle_two',20000,'2026-08-10T12:00:00Z',null,'c360-m2');

-- 1) Admin projection: leitura ampla das fontes telemetria com binding canônico só
-- (política admin existente para mileage/fuel/charging; maintenance/expenses/documents
-- permanecem SEM política admin e devem falhar/0 linhas — fail-closed documentado).
reset role;
update public.customer_vehicles set active=false where id=:'vehicle_two';
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.sub','7a360000-0000-4000-8000-000000000003',true);

do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 2 then
    raise exception 'Admin 360 não vê todos os logs de quilometragem (mileage)';
  end if;
  if (select count(*) from public.vehicle_fuel_logs) <> 1 then
    raise exception 'Admin 360 não vê abastecimentos (fuel)';
  end if;
  if (select count(*) from public.vehicle_charging_logs) <> 1 then
    raise exception 'Admin 360 não vê recargas (charging)';
  end if;
end
$$;

-- 2) Falha-fechada para fontes SEM política admin: manutenção, despesas e documentos.
do $$
begin
  if (select count(*) from public.vehicle_maintenance_records) <> 0 then
    raise exception 'Manutenção vazou para admin (sem política admin)';
  end if;
  if (select count(*) from public.vehicle_expenses) <> 0 then
    raise exception 'Despesas vazaram para admin (sem política admin)';
  end if;
  if (select count(*) from public.vehicle_documents) <> 0 then
    raise exception 'Documentos vazaram para admin (sem política admin)';
  end if;
end
$$;

-- 3) O vínculo NUNCA é por placa/nome/telefone: só customer_vehicles.customer_id
-- aponta para o cliente da ficha; vehicle_id é a única ponte para telemetria.

-- 4) Binding canônico de leitura por ficha: veículo de outro dono não é alcançável
-- nem por km nem por recarga (mesmo admin por política, leitura permanece por ficha no pós-#236).
do $$
begin
  if exists (
    select 1
    from public.vehicle_mileage_logs log
    join public.customer_vehicles v on v.id = log.vehicle_id
    where v.customer_id = (select private.current_customer_id())
  ) then
    raise exception 'Admin 360 alcançou leitura por ficha indevida';
  end if;
end
$$;

-- 5) Fonte indisponível: erro/count nulo gere null, nunca zero nem invenção
-- (semântica #236 available/unavailable; aqui via RLS/grants).
set local role anon;
select customer_360_test.expect_error('select * from public.vehicle_mileage_logs');
select customer_360_test.expect_error('select * from public.vehicle_documents');
select customer_360_test.expect_error('select * from public.vehicle_expenses');
reset role;

-- 6) Provider nunca vê telemetria (sem garage access — invariante #233/#236).
-- Provider nasce de usuário sem perfil (mesmo caminho do vehicle_maintenance_security).
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('7a360000-0000-4000-8000-000000000005','authenticated','authenticated','c360.provider@example.invalid','{}','{}',now(),now());
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.sub','7a360000-0000-4000-8000-000000000005',true);
select public.start_provider_application('Oficina 360 Ltda','Oficina 360','Franca');
select customer_360_test.expect_error($s$select public.register_vehicle_mileage(current_setting('customer_360_test.vehicle_one')::uuid,1,'2026-09-01T12:00:00Z',null,'c360-provider-write')$s$);
select customer_360_test.expect_error($s$select public.register_vehicle_fuel(current_setting('customer_360_test.vehicle_one')::uuid,'2026-09-01T12:00:00Z',1,1,1,'gasolina',null,'c360-provider-fuel')$s$);
select customer_360_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('customer_360_test.vehicle_one')::uuid,'a','b','2026-09-01',1,'c360-provider-mnt')$s$);
do $$
begin
  if (select count(*) from public.vehicle_mileage_logs) <> 0 then
    raise exception 'Provider leu telemetria de cliente';
  end if;
  if (select count(*) from public.vehicle_fuel_logs) <> 0 then
    raise exception 'Provider leu abastecimentos de cliente';
  end if;
end
$$;

-- 7) Não há mutação administrativa: nem admin nem provider registram telemetria (grants).
select customer_360_test.expect_error($s$select public.register_vehicle_mileage(current_setting('customer_360_test.vehicle_one')::uuid,1,'2026-09-01T12:00:00Z',null,'c360-admin-write')$s$);
select customer_360_test.expect_error($s$select public.register_vehicle_fuel(current_setting('customer_360_test.vehicle_one')::uuid,'2026-09-01T12:00:00Z',1,1,1,'gasolina',null,'c360-admin-fuel')$s$);
select customer_360_test.expect_error($s$select public.register_vehicle_maintenance(current_setting('customer_360_test.vehicle_one')::uuid,'a','b','2026-09-01',1,'c360-admin-mnt')$s$);

-- 8) Umbrella registrado no CI: sem tocar arquivos da #236; fixture isolada por
-- prefixo c360 e usuários únicos (nenhuma colisão com demais suítes do runner).
rollback;
