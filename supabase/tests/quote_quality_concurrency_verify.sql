\set ON_ERROR_STOP on

do $$
begin
  if (
    select count(*)
    from public.service_quote_revisions
    where idempotency_key = 'quote-quality-concurrent-revision'
  ) <> 1 then
    raise exception 'Concurrent revision capture created a duplicate';
  end if;
end;
$$;
