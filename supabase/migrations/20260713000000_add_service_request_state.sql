alter table public.service_requests
  add column if not exists state text;

comment on column public.service_requests.state is
  'Brazilian state code (UF). Nullable for compatibility with service requests created before MVP-007.';
