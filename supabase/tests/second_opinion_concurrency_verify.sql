\set ON_ERROR_STOP on

do $$
declare
  resolved_request_id uuid;
begin
  select id into resolved_request_id
  from public.second_opinion_requests
  where idempotency_key = 'second-opinion-concurrency-request';

  if resolved_request_id is null
    or (select count(*) from public.second_opinion_requests where revision_id = 'c8888888-8888-4888-8888-888888888881') <> 1
    or (select count(*) from public.second_opinion_events where request_id = resolved_request_id and event_type = 'requested') <> 1 then
    raise exception 'Concurrent second opinion request was not deduplicated';
  end if;
end;
$$;
