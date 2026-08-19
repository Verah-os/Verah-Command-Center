\set ON_ERROR_STOP on
do $$
declare resolved_invitation_id uuid;
begin
  select id into resolved_invitation_id from public.provider_invitations
  where idempotency_key = 'provider-invitation-concurrency';
  if resolved_invitation_id is null
    or (select count(*) from public.provider_invitations where service_request_id = 'e6666666-6666-4666-8666-666666666661') <> 1
    or (select count(*) from public.provider_invitation_events where invitation_id = resolved_invitation_id and event_type = 'invited') <> 1 then
    raise exception 'Concurrent provider invitation was not deduplicated';
  end if;
end;
$$;
