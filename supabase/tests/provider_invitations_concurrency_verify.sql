\set ON_ERROR_STOP on
do $$
declare resolved_invitation_id uuid;
begin
  select id into resolved_invitation_id from public.provider_invitations
  where idempotency_key = 'provider-invitation-concurrency';
  if resolved_invitation_id is null
    or (select count(*) from public.provider_invitations where idempotency_key = 'provider-invitation-concurrency') <> 1
    or (select count(*) from public.provider_invitation_events where invitation_id = resolved_invitation_id and event_type = 'invited') <> 1 then
    raise exception 'Concurrent provider invitation was not deduplicated';
  end if;
  if (select count(*) from public.provider_invitation_responses where idempotency_key = 'provider-response-concurrency') <> 1
    or (select count(*) from public.provider_invitation_events where idempotency_key = 'event:provider-response-concurrency') <> 1 then
    raise exception 'Concurrent provider response was not deduplicated';
  end if;
  if (select count(*) from public.provider_invitation_events where idempotency_key = 'provider-revocation-concurrency') <> 1 then
    raise exception 'Concurrent provider revocation was not deduplicated';
  end if;
  if (select count(*) from public.provider_selections where idempotency_key = 'provider-selection-concurrency') <> 1
    or (select count(*) from public.provider_invitation_events where idempotency_key = 'event:provider-selection-concurrency') <> 1
    or not exists (
      select 1 from public.service_requests
      where id = 'e6666666-6666-4666-8666-666666666661'
        and provider_id = 'e5555555-5555-4555-8555-555555555555'
    ) then
    raise exception 'Concurrent provider selection was not deduplicated';
  end if;
end;
$$;
