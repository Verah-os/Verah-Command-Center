alter table public.service_requests
  add column if not exists pickup_address text,
  add column if not exists pickup_latitude double precision,
  add column if not exists pickup_longitude double precision,
  add column if not exists pickup_location_source text,
  add column if not exists pickup_location_confirmed_at timestamptz,
  add column if not exists pickup_instructions text;

alter table public.service_requests
  drop constraint if exists service_requests_pickup_location_source_check;

alter table public.service_requests
  add constraint service_requests_pickup_location_source_check
  check (
    pickup_location_source is null
    or pickup_location_source in ('device_location', 'manual_address', 'whatsapp_location')
  );

alter table public.service_requests
  drop constraint if exists service_requests_pickup_latitude_check;

alter table public.service_requests
  add constraint service_requests_pickup_latitude_check
  check (pickup_latitude is null or pickup_latitude between -90 and 90);

alter table public.service_requests
  drop constraint if exists service_requests_pickup_longitude_check;

alter table public.service_requests
  add constraint service_requests_pickup_longitude_check
  check (pickup_longitude is null or pickup_longitude between -180 and 180);

comment on column public.service_requests.pickup_address is
  'Customer-confirmed textual pickup location. PII: expose only to operational roles that need it.';
comment on column public.service_requests.pickup_location_source is
  'Source of pickup location: device_location, manual_address, or whatsapp_location.';
comment on column public.service_requests.pickup_location_confirmed_at is
  'Timestamp when the customer reviewed and confirmed the pickup location.';
comment on column public.service_requests.pickup_instructions is
  'Optional customer pickup/reference instructions.';
