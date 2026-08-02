\set ON_ERROR_STOP on

do $$
declare
  assessment_id uuid;
begin
  select id into assessment_id
  from public.quote_intelligence_assessments
  where idempotency_key = 'quote-alpha:concurrent:1';

  if assessment_id is null
    or (select count(*) from public.quote_intelligence_assessments where idempotency_key = 'quote-alpha:concurrent:1') <> 1 then
    raise exception 'Concurrent classification created zero or duplicate assessments';
  end if;

  if (select count(*) from public.service_request_events where idempotency_key = 'quoteability.assessed:' || assessment_id::text) <> 1 then
    raise exception 'Concurrent classification created duplicate events';
  end if;
end;
$$;

