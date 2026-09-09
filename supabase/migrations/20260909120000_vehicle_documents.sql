-- #217: repository-only. Apply remotely only after the human database gate.
-- Canonical owner-scoped vehicle document/note metadata. No OCR in this step.
-- Storage access is private owner-based only; never a predictable public URL.

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.customer_vehicles(id) on delete cascade,
  document_kind text not null
    check (document_kind in ('nota_fiscal', 'garantia', 'manual', 'laudo', 'seguro', 'licenciamento', 'outro')),
  document_date date not null
    check (isfinite(document_date) and document_date <= current_date),
  reference text
    check (reference is null or char_length(btrim(reference)) between 1 and 80),
  note text
    check (note is null or char_length(btrim(note)) between 1 and 160),
  file_name text not null
    check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null
    check (size_bytes between 1 and 10485760),
  storage_bucket text not null default 'vehicle-documents'
    check (storage_bucket = 'vehicle-documents'),
  storage_path text not null
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  status text not null default 'active'
    check (status in ('active', 'removed')),
  removed_at timestamptz,
  idempotency_key text not null
    check (char_length(btrim(idempotency_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check (removed_at is null or removed_at >= created_at),
  check (not (status = 'removed') or removed_at is not null),
  check (not (status = 'active') or removed_at is null)
);

comment on table public.vehicle_documents is
  'Canonical append-only owner-scoped vehicle documents. Logical removal only; storage objects keep private owner-scoped access.';

create index vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id, document_date desc, created_at desc) where status = 'active';
create index vehicle_documents_owner_idx on public.vehicle_documents (owner_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-documents', 'vehicle-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.vehicle_documents enable row level security;
revoke all on table public.vehicle_documents from public, anon, authenticated, service_role;
grant select on table public.vehicle_documents to authenticated;

create policy "Owners read active vehicle documents" on public.vehicle_documents
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and status = 'active'
    and exists (
      select 1
      from public.customer_vehicles vehicle
      where vehicle.id = vehicle_documents.vehicle_id
        and vehicle.active
        and vehicle.owner_id = (select auth.uid())
    )
  );

create function private.protect_vehicle_document_mutation() returns trigger
language plpgsql set search_path = '' as $$
declare
  mutation_signal text := pg_catalog.current_setting('vehicle_documents.allow_mutation', true);
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Vehicle documents are immutable.';
  end if;

  if coalesce(mutation_signal, '') <> '1'
    or (old.status, new.status) not in (('active', 'removed'), ('removed', 'active'))
    or new.id <> old.id
    or new.owner_id <> old.owner_id
    or new.customer_id <> old.customer_id
    or new.vehicle_id <> old.vehicle_id
    or new.document_kind <> old.document_kind
    or new.document_date <> old.document_date
    or new.reference is distinct from old.reference
    or new.note is distinct from old.note
    or new.file_name <> old.file_name
    or new.mime_type <> old.mime_type
    or new.size_bytes <> old.size_bytes
    or new.storage_bucket <> old.storage_bucket
    or new.storage_path <> old.storage_path
    or new.idempotency_key <> old.idempotency_key
    or new.created_at <> old.created_at
    or (new.status = 'active') is distinct from (new.removed_at is null)
    or (old.status = 'active') is distinct from (old.removed_at is null) then
    raise exception using errcode = '42501', message = 'Vehicle documents are immutable.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_vehicle_document_mutation() from public, anon, authenticated, service_role;

create trigger protect_vehicle_document_mutation
before update or delete on public.vehicle_documents
for each row execute function private.protect_vehicle_document_mutation();

create policy "Owners read vehicle document objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and exists (
      select 1
      from public.vehicle_documents document
      where document.storage_bucket = storage.objects.bucket_id
        and document.storage_path = storage.objects.name
        and document.status = 'active'
        and document.owner_id = (select auth.uid())
    )
  );

create policy "Owners insert vehicle document objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and storage.objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.vehicle_documents document
      where document.storage_bucket = storage.objects.bucket_id
        and document.storage_path = storage.objects.name
        and document.status = 'active'
        and document.owner_id = (select auth.uid())
    )
  );

create policy "Owners update vehicle document objects" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and exists (
      select 1
      from public.vehicle_documents document
      where document.storage_bucket = storage.objects.bucket_id
        and document.storage_path = storage.objects.name
        and document.status = 'active'
        and document.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'vehicle-documents'
    and storage.objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.vehicle_documents document
      where document.storage_bucket = storage.objects.bucket_id
        and document.storage_path = storage.objects.name
        and document.status = 'active'
        and document.owner_id = (select auth.uid())
    )
  );

create function public.register_vehicle_document(
  p_vehicle_id uuid,
  p_document_kind text,
  p_document_date date,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text,
  p_reference text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
set statement_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  vehicle public.customer_vehicles%rowtype;
  document public.vehicle_documents%rowtype;
  storage_path text;
begin
  if actor is null or public.current_verah_role() is distinct from 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required.';
  end if;

  select * into vehicle from public.customer_vehicles
    where id = p_vehicle_id and owner_id = actor and active for update;

  if not found then
    raise exception using errcode = '42501', message = 'Vehicle authorization required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || ':' || p_idempotency_key, 0)
  );

  select * into document from public.vehicle_documents
    where owner_id = actor
      and idempotency_key = p_idempotency_key;

  if found then
    if row(
      document.vehicle_id,
      document.document_kind,
      document.document_date,
      document.reference,
      document.note,
      document.file_name,
      document.mime_type,
      document.size_bytes
    ) is distinct from row(
      p_vehicle_id,
      lower(btrim(p_document_kind)),
      p_document_date,
      nullif(btrim(p_reference), ''),
      nullif(btrim(p_note), ''),
      btrim(p_file_name),
      p_mime_type,
      p_size_bytes
    ) then
      raise exception using errcode = '23505', message = 'Vehicle document idempotency key collision.';
    end if;

    if document.status = 'removed' then
      perform pg_catalog.set_config('vehicle_documents.allow_mutation', '1', true);
      update public.vehicle_documents
        set status = 'active', removed_at = null
        where id = document.id;
    end if;
  else
    storage_path := gen_random_uuid()::text;

    insert into public.vehicle_documents(
      owner_id,
      customer_id,
      vehicle_id,
      document_kind,
      document_date,
      reference,
      note,
      file_name,
      mime_type,
      size_bytes,
      storage_bucket,
      storage_path,
      status,
      removed_at,
      idempotency_key
    ) values (
      actor,
      vehicle.customer_id,
      vehicle.id,
      lower(btrim(p_document_kind)),
      p_document_date,
      nullif(btrim(p_reference), ''),
      nullif(btrim(p_note), ''),
      btrim(p_file_name),
      p_mime_type,
      p_size_bytes,
      'vehicle-documents',
      storage_path,
      'active',
      null,
      p_idempotency_key
    ) returning * into document;
  end if;

  return jsonb_build_object(
    'document_id', document.id,
    'storage_bucket', document.storage_bucket,
    'storage_path', document.storage_path,
    'file_name', document.file_name,
    'mime_type', document.mime_type,
    'size_bytes', document.size_bytes
  );
end;
$$;

revoke all on function public.register_vehicle_document(uuid,text,date,text,text,bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_vehicle_document(uuid,text,date,text,text,bigint,text,text,text)
  to authenticated;

create function public.remove_vehicle_document(p_document_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
set statement_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  document public.vehicle_documents%rowtype;
begin
  if actor is null or public.current_verah_role() is distinct from 'customer' then
    raise exception using errcode = '42501', message = 'Customer authorization required.';
  end if;

  select * into document from public.vehicle_documents
    where id = p_document_id
      and owner_id = actor
      for update;

  if not found then
    raise exception using errcode = '42501', message = 'Vehicle document authorization required.';
  end if;

  if document.status = 'active' then
    perform pg_catalog.set_config('vehicle_documents.allow_mutation', '1', true);
    update public.vehicle_documents
      set status = 'removed', removed_at = now()
      where id = document.id;
  end if;

  return jsonb_build_object('document_id', document.id, 'removed', true);
end;
$$;

revoke all on function public.remove_vehicle_document(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_vehicle_document(uuid)
  to authenticated;
