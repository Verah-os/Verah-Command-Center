\set ON_ERROR_STOP on
begin;
create schema vehicle_document_test;
create function vehicle_document_test.expect_error(statement text, expected_state text)
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
grant usage on schema vehicle_document_test to authenticated, anon;
grant execute on function vehicle_document_test.expect_error(text,text) to authenticated, anon;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('d2170000-0000-4000-8000-000000000001','authenticated','authenticated','doc.one@example.invalid','{}','{}',now(),now()),
 ('d2170000-0000-4000-8000-000000000002','authenticated','authenticated','doc.two@example.invalid','{}','{}',now(),now()),
 ('d2170000-0000-4000-8000-000000000003','authenticated','authenticated','doc.unprofiled@example.invalid','{}','{}',now(),now()),
 ('d2170000-0000-4000-8000-000000000004','authenticated','authenticated','doc.admin@example.invalid','{}','{}',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2170000-0000-4000-8000-000000000001',true);
select public.start_customer_onboarding('Document One');
select public.complete_customer_basic_onboarding('Document One','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('DOC1A23','Volkswagen','Gol',2021,'1.0',null,'Manual','manual',null,null,false,true)->>'vehicle_id' as vehicle_id \gset
select set_config('vehicle_document_test.vehicle', :'vehicle_id',true);
select public.register_vehicle_document(:'vehicle_id','nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','nota-entrada.pdf','application/pdf',245760,'doc-first')->>'document_id' as document_id \gset
select set_config('vehicle_document_test.document', :'document_id',true);
select storage_path from public.vehicle_documents where id = current_setting('vehicle_document_test.document')::uuid \gset storage_path
select set_config('vehicle_document_test.path', :'storage_path',true);
do $$ begin
  if (select count(*) from public.vehicle_documents) <> 1 then
    raise exception 'Document was not persisted canonically';
  end if;
  if not exists (select 1 from public.vehicle_documents
      where id = current_setting('vehicle_document_test.document')::uuid
        and owner_id = 'd2170000-0000-4000-8000-000000000001'
       and vehicle_id = current_setting('vehicle_document_test.vehicle')::uuid
       and document_kind = 'nota_fiscal'
       and document_date = '2026-08-01'
       and reference = 'Ref 123'
       and note = 'Nota fiscal de entrada'
       and file_name = 'nota-entrada.pdf'
       and mime_type = 'application/pdf'
       and size_bytes = 245760
       and status = 'active'
       and removed_at is null
       and storage_bucket = 'vehicle-documents'
       and storage_path = current_setting('vehicle_document_test.path')) then
    raise exception 'Document metadata diverged from canonical contract'; end if;
  end if;
  if not exists (select 1 from public.vehicle_documents where storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Storage path is not an unguessable UUID shape';
  end if;
end $$;

-- Exact replay, including normalized reference/note, is a no-op andre-uses the same unguessable path.
select public.register_vehicle_document(:'vehicle_id','nota_fiscal','2026-08-01',' Ref 123 ',' Nota fiscal de entrada ','nota-entrada.pdf','application/pdf',245760,'doc-first')->>'document_id' as replay_document_id \gset
do $$ begin
  if (select count(*) from public.vehicle_documents where idempotency_key = 'doc-first') <> 1 then
    raise exception 'Document idempotency replay duplicated the record';
  end if;
  if (select id from public.vehicle_documents where idempotency_key = 'doc-first') is distinct from current_setting('vehicle_document_test.document')::uuid then
    raise exception 'Document idempotency replay did not return the original';
  end if;
end $$;
-- Same key with a different payload (even file name) is rejected as collision. 
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','outra.pdf','application/pdf',245760,'doc-first')$s$,'23505');
-- Direct metadata mutation is impossible for clients; history stays append-only. 
select vehicle_document_test.expect_error($s$update public.vehicle_documents set note = 'x'$s$,'42501');
select vehicle_document_test.expect_error($s$delete from public.vehicle_documents$s$,'42501');
-- The owner can place the storage object into the private bucket with the minted unguessable path. 

select vehicle_document_test.expect_error($s$insert into storage.objects(bucket_id,name) values('vehicle-documents','nota-entrada.pdf')$s$,'42501');
insert into storage.objects(bucket_id,name) values('vehicle-documents', current_setting('vehicle_document_test.path'));
do $$ begin
  if (select count(*) from storage.objects where name = current_setting('vehicle_document_test.path')) <> 1 then
    raise exception 'Owner could not place the storage object';
  end if;
end $$;
-- Logical removal through the RPC preserves history,but hides the record from the app surface. 
select public.remove_vehicle_document(:'document_id')->>'removed' as removed_flag \gset
do $$ begin
  if :'removed_flag' <> 'true'
    or (select count(*) from public.vehicle_documents where id = current_setting('vehicle_document_test.document')::uuid) <> 1
    or (select status from public.vehicle_documents where id = current_setting('vehicle_document_test.document')::uuid) <> 'removed'
    then raise exception 'Logical removal did not preserve the canonical record'; end if;
end $$;
select vehicle_document_test.expect_error($s$update public.vehicle_documents set status = 'active' where id = current_setting('vehicle_document_test.document')::uuid$s$,'42501');
-- Re-registering with the same key reactivates the removed history and mints the same path. 
select public.register_vehicle_document(:'vehicle_id','nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','nota-entrada.pdf','application/pdf',245760,'doc-first')->>'document_id' as reactivated_id \gset
do $$ begin
  if (select status from public.vehicle_documents where id = current_setting('vehicle_document_test.document')::uuid) <> 'active'
    or (select count(*) from public.vehicle_documents where idempotency_key = 'doc-first') <> 1
    or :'reactivated_id' <> current_setting('vehicle_document_test.document')
  then raise exception 'Same-key re-registration did not reactivate history'; end if;
end $$;

-- A foreign owner cannot see the record nor the object through RLS. 
select set_config('request.jwt.claim.sub','d2170000-0000-4000-8000-000000000002',true);
select public.start_customer_onboarding('Document Two');
select public.complete_customer_basic_onboarding('Document Two','pilot-alpha-onboarding-v1');
select public.confirm_customer_vehicle('DOC2B34','Chevrolet','Onix',2022,'1.0',null,'Manual','manual',null,null,false,true)->>'vehicle_id' as second_vehicle \gset
do $$ begin
  if exists(select 1 from public.vehicle_documents) or exists(select 1 from storage.objects where name = current_setting('vehicle_document_test.path')) then
    raise exception 'Cross-owner document or object leaked through RLS'; end if;
end $$;
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','x.pdf','application/pdf',245760,'cross-owner-doc')$s$,'42501');
do $$ begin
  if exists(select 1 from public.vehicle_documents where idempotency_key = 'cross-owner-doc') then
    raise exception 'Cross-owner document write was persisted';
  end if;
end $$;
-- Missing application role must not pass SECURITY DEFINER authorization. 
select set_config('request.jwt.claim.sub','d2170000-0000-4000-8000-000000000003',true);
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','unprofiled.pdf','application/pdf',1024,'unprofiled-doc')$s$,'42501');
do $$ begin
  if exists(select 1 from public.vehicle_documents) then raise exception 'Unprofiled identity read vehicle documents'; end if;
end $$;
-- Service role cannot mutate history through the trigger
reset role;
set local role service_role;
select vehicle_document_test.expect_error($s$delete from public.vehicle_documents$s$,'42501');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
do $$ begin
  if exists(select 1 from public.vehicle_documents) then raise exception 'Anonymous read vehicle documents'; end if;
end $$;
reset role;
-- Strict type/size/date/blank-value limits reject the upload through the owner RPC. 
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2170000-0000-4000-8000-000000000001',true);
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','x.exe','application/octet-stream',1024,'bad-mime')$s$,'23514');
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','big.pdf','application/pdf',10485761,'too-big')$s$,'23514');
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal',current_date+1,'Ref 123','Nota fiscal de entrada','future.pdf','application/pdf',1024,'future-date')$s$,'23514');
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01','Ref 123','Nota fiscal de entrada','  ','application/pdf',1024,'blank-file')$s$,'23514');
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'invalido','2026-08-01','Ref 123','Nota fiscal de entrada','x.pdf','application/pdf',1024,'bad-kind')$s$,'23514');
select vehicle_document_test.expect_error($s$select public.register_vehicle_document(current_setting('vehicle_document_test.vehicle')::uuid,
 'nota_fiscal','2026-08-01',null, repeat('x',161),'x.pdf','application/pdf',1024,'long-note')$s$,'23514');
rollback;