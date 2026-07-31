create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_display_name_not_blank_check
    check (btrim(display_name) <> '')
);

create unique index customers_auth_user_id_uidx
  on public.customers (auth_user_id)
  where auth_user_id is not null;

create table public.customer_channels (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.customers(id)
    on delete cascade,
  channel_type text not null,
  channel_address text not null,
  is_primary boolean not null default false,
  consent_status text not null default 'unknown',
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_channels_type_check
    check (channel_type in ('app', 'whatsapp')),
  constraint customer_channels_address_not_blank_check
    check (btrim(channel_address) <> ''),
  constraint customer_channels_whatsapp_e164_check
    check (
      channel_type <> 'whatsapp'
      or channel_address ~ '^\+[1-9][0-9]{7,14}$'
    ),
  constraint customer_channels_consent_status_check
    check (consent_status in ('unknown', 'granted', 'revoked'))
);

create unique index customer_channels_type_address_uidx
  on public.customer_channels (channel_type, channel_address);

create index customer_channels_customer_id_idx
  on public.customer_channels (customer_id);

create unique index customer_channels_one_primary_per_type_uidx
  on public.customer_channels (customer_id, channel_type)
  where is_primary;
