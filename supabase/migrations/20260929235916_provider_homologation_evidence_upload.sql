-- Repository-only. Apply through the separately authorized migration gate.
-- Reuse the canonical attachment parent, private bucket and append-only events.
create policy "Homologation attachments require Admin"
on public.service_attachments as restrictive for select to authenticated
using (homologation_provider_id is null or (select public.current_verah_role()) = 'admin');

create policy "Admins upload reserved homologation objects"
on storage.objects for insert to authenticated with check (
  bucket_id = 'service-attachments'
  and (select public.current_verah_role()) = 'admin'
  and exists (
    select 1 from public.service_attachments a
    where a.storage_bucket = bucket_id and a.storage_path = name
      and a.homologation_provider_id is not null
      and a.conversation_id is null and a.service_request_id is null and a.message_id is null
      and a.created_by = (select auth.uid()) and a.status = 'pending'
      and a.visibility = 'operations'
  )
);
-- No UPDATE/DELETE policies: uploads cannot replace or remove evidence.

create or replace function public.reserve_provider_homologation_evidence(
  p_provider_id uuid, p_mime_type text, p_size_bytes bigint, p_checksum text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := private.require_homologation_admin();
  attachment_id uuid := gen_random_uuid();
  object_path text;
begin
  if p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp')
    or p_size_bytes is null or p_size_bytes not between 1 and 10485760
    or p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_reason), '') is null or length(p_reason) > 500 then
    raise exception using errcode = '22023', message = 'Invalid evidence metadata.';
  end if;
  if not exists (select 1 from public.provider_homologation_profiles where provider_id = p_provider_id)
    or not exists (select 1 from storage.buckets where id = 'service-attachments' and not public) then
    raise exception using errcode = 'P0001', message = 'Private evidence destination unavailable.';
  end if;
  object_path := 'provider-homologation/' || p_provider_id::text || '/' || attachment_id::text;
  insert into public.service_attachments (
    id, homologation_provider_id, storage_path, media_type, declared_mime_type,
    size_bytes, checksum_sha256, visibility, status, created_by
  ) values (
    attachment_id, p_provider_id, object_path,
    case when p_mime_type = 'application/pdf' then 'document' else 'image' end,
    p_mime_type, p_size_bytes, p_checksum, 'operations', 'pending', actor_id
  );
  perform private.append_provider_homologation_event(p_provider_id, 'evidence_reserved', actor_id,
    p_reason, null, jsonb_build_object('attachment_id',attachment_id,'status','pending','checksum_sha256',p_checksum));
  return jsonb_build_object('id',attachment_id,'storage_path',object_path);
end;
$$;

create or replace function public.finish_provider_homologation_evidence(
  p_provider_id uuid, p_attachment_id uuid, p_available boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := private.require_homologation_admin();
  attachment public.service_attachments%rowtype;
begin
  select * into attachment from public.service_attachments
  where id = p_attachment_id and homologation_provider_id = p_provider_id
    and created_by = actor_id for update;
  if not found or p_available is null or attachment.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'Pending evidence reservation required.';
  end if;
  if p_available and not exists (
    select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
    where o.bucket_id = attachment.storage_bucket and o.name = attachment.storage_path
      and not b.public and o.owner_id = actor_id::text
      and (o.metadata->>'size')::bigint = attachment.size_bytes
      and o.metadata->>'mimetype' = attachment.declared_mime_type
  ) then
    raise exception using errcode = 'P0001', message = 'Private uploaded object not confirmed.';
  end if;
  update public.service_attachments
  set status = case when p_available then 'available' else 'rejected' end, updated_at = now()
  where id = p_attachment_id;
  perform private.append_provider_homologation_event(p_provider_id,
    case when p_available then 'evidence_available' else 'evidence_rejected' end, actor_id,
    case when p_available then 'Private upload confirmed; human checklist review still required.' else 'Upload or read confirmation failed.' end,
    jsonb_build_object('attachment_id',p_attachment_id,'status','pending'),
    jsonb_build_object('attachment_id',p_attachment_id,'status',case when p_available then 'available' else 'rejected' end));
  return p_attachment_id;
end;
$$;
revoke all on function public.reserve_provider_homologation_evidence(uuid,text,bigint,text,text) from public, anon, authenticated, service_role;
revoke all on function public.finish_provider_homologation_evidence(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.reserve_provider_homologation_evidence(uuid,text,bigint,text,text) to authenticated;
grant execute on function public.finish_provider_homologation_evidence(uuid,uuid,boolean) to authenticated;

-- Shared physical availability predicate for review, approval and eligibility.
create or replace function private.homologation_evidence_available(p_provider_id uuid, p_attachment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_attachments a
    join storage.objects o on o.bucket_id = a.storage_bucket and o.name = a.storage_path
    join storage.buckets b on b.id = o.bucket_id
    where a.id = p_attachment_id and a.homologation_provider_id = p_provider_id
      and a.storage_bucket = 'service-attachments' and not b.public
      and a.visibility = 'operations' and a.status = 'available'
      and a.conversation_id is null and a.service_request_id is null and a.message_id is null
  );
$$;
revoke all on function private.homologation_evidence_available(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.provider_is_eligible_for_service(
  p_provider_id uuid,
  p_service_category text,
  p_operation_context text default 'pilot_alpha'
) returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_operation_context = 'demo' then exists (
      select 1 from public.service_providers provider
      where provider.id = p_provider_id and provider.status = 'active' and provider.is_synthetic
    )
    when p_operation_context <> 'pilot_alpha' or nullif(btrim(p_service_category), '') is null then false
    else exists (
      select 1
      from public.service_providers provider
      join public.provider_homologation_profiles profile on profile.provider_id = provider.id
      join public.provider_category_authorizations category on category.provider_id = provider.id
      where provider.id = p_provider_id
        and provider.status = 'active'
        and profile.homologation_status in ('pilot_approved', 'approved')
        and not profile.critical_operational_block
        and (profile.next_review_at is null or profile.next_review_at > pg_catalog.now())
        and category.category_code = p_service_category
        and category.authorization_status in ('pilot_approved', 'approved')
        and (category.valid_until is null or category.valid_until > pg_catalog.now())
        and not exists (
          select 1 from public.provider_homologation_checklist_items item
          where item.provider_id = provider.id
            and item.is_required_for_pilot
            and (item.review_status <> 'verified' or (item.valid_until is not null and item.valid_until <= pg_catalog.now()) or (item.evidence_required and not private.homologation_evidence_available(item.provider_id, item.evidence_ref)))
        )
        and exists (
          select 1 from public.provider_homologation_checklist_items item
          where item.provider_id = provider.id and item.is_required_for_pilot
        )
    )
  end
$$;

create or replace function public.review_provider_checklist_item(
  p_provider_id uuid, p_item_code text, p_status text,
  p_evidence_ref uuid default null, p_valid_until timestamptz default null,
  p_note text default null, p_required_for_pilot boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select private.require_homologation_admin());
  old_row jsonb;
  result_id uuid;
  item_evidence_required boolean;
begin
  select to_jsonb(item) into old_row from public.provider_homologation_checklist_items item
  where item.provider_id = p_provider_id and item.item_code = p_item_code;
  select coalesce(item.evidence_required, true) into item_evidence_required
  from public.provider_homologation_checklist_items item
  where item.provider_id = p_provider_id and item.item_code = p_item_code;
  item_evidence_required := coalesce(item_evidence_required, true);
  if p_status = 'verified' and p_required_for_pilot and item_evidence_required
     and p_evidence_ref is null then
    raise exception using errcode = 'P0001', message = 'Verified mandatory checklist item requires private evidence.';
  end if;
  if p_evidence_ref is not null and not private.homologation_evidence_available(p_provider_id, p_evidence_ref) then
    raise exception using errcode = 'P0001', message = 'Checklist evidence is unavailable or belongs to another provider.';
  end if;
  insert into public.provider_homologation_checklist_items (
    provider_id, item_code, is_required_for_pilot, review_status, reviewer_id,
    reviewed_at, evidence_ref, valid_until, note
  ) values (
    p_provider_id, p_item_code, p_required_for_pilot, p_status, actor_id,
    pg_catalog.now(), p_evidence_ref, p_valid_until, p_note
  ) on conflict (provider_id, item_code) do update set
    is_required_for_pilot = excluded.is_required_for_pilot,
    review_status = excluded.review_status, reviewer_id = excluded.reviewer_id,
    reviewed_at = excluded.reviewed_at, evidence_ref = excluded.evidence_ref,
    valid_until = excluded.valid_until, note = excluded.note, updated_at = pg_catalog.now()
  returning id into result_id;
  perform private.append_provider_homologation_event(
    p_provider_id, 'checklist_reviewed', actor_id, p_note, old_row,
    (select to_jsonb(item) from public.provider_homologation_checklist_items item where item.id = result_id)
  );
  return result_id;
end;
$$;

create or replace function public.set_provider_homologation_status(
  p_provider_id uuid, p_status text, p_reason text default null,
  p_next_review_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select private.require_homologation_admin()); old_row jsonb;
begin
  select to_jsonb(profile) into old_row from public.provider_homologation_profiles profile
  where profile.provider_id = p_provider_id for update;
  if p_status in ('pilot_approved', 'approved') and (
    not exists (
      select 1 from public.provider_homologation_checklist_items item
      where item.provider_id = p_provider_id and item.is_required_for_pilot
    ) or exists (
      select 1 from public.provider_homologation_checklist_items item
      where item.provider_id = p_provider_id and item.is_required_for_pilot
        and (item.review_status <> 'verified' or (item.valid_until is not null and item.valid_until <= pg_catalog.now()) or (item.evidence_required and not private.homologation_evidence_available(item.provider_id, item.evidence_ref)))
    )
  ) then
    raise exception using errcode = 'P0001', message = 'Mandatory provider checklist is not valid.';
  end if;
  insert into public.provider_homologation_profiles (
    provider_id, homologation_status, homologated_at, homologated_by, next_review_at, status_reason
  ) values (
    p_provider_id, p_status,
    case when p_status in ('pilot_approved', 'approved') then pg_catalog.now() end,
    case when p_status in ('pilot_approved', 'approved') then actor_id end,
    p_next_review_at, p_reason
  ) on conflict (provider_id) do update set
    homologation_status = excluded.homologation_status,
    homologated_at = case when excluded.homologation_status in ('pilot_approved', 'approved') then pg_catalog.now() else provider_homologation_profiles.homologated_at end,
    homologated_by = case when excluded.homologation_status in ('pilot_approved', 'approved') then actor_id else provider_homologation_profiles.homologated_by end,
    next_review_at = excluded.next_review_at, status_reason = excluded.status_reason,
    updated_at = pg_catalog.now();
  perform private.append_provider_homologation_event(
    p_provider_id, 'homologation_status_changed', actor_id, p_reason, old_row,
    (select to_jsonb(profile) from public.provider_homologation_profiles profile where profile.provider_id = p_provider_id)
  );
  return p_provider_id;
end;
$$;
