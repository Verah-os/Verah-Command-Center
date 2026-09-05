alter table public.service_requests
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists service_requests_customer_id_idx
  on public.service_requests(customer_id);

update public.service_requests sr
set customer_id = c.id
from public.customers c
where sr.customer_id is null
  and sr.created_by is not null
  and c.auth_user_id = sr.created_by;

create or replace function public.bind_service_request_customer_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_customer_id uuid;
begin
  if new.origin = 'customer' and new.created_by is not null then
    select c.id
      into canonical_customer_id
    from public.customers c
    where c.auth_user_id = new.created_by
    limit 1;

    if canonical_customer_id is null then
      raise exception using errcode = '23503', message = 'Canonical customer required';
    end if;

    if new.customer_id is not null and new.customer_id <> canonical_customer_id then
      raise exception using errcode = '23514', message = 'Customer identity mismatch';
    end if;

    new.customer_id := canonical_customer_id;
  end if;

  return new;
end;
$$;

revoke all on function public.bind_service_request_customer_identity() from public;

drop trigger if exists service_requests_bind_customer_identity on public.service_requests;
create trigger service_requests_bind_customer_identity
before insert or update of created_by, customer_id, origin on public.service_requests
for each row
execute function public.bind_service_request_customer_identity();

comment on column public.service_requests.customer_id is
  'Canonical VERAH customer identity. Auth ownership remains enforced through created_by and RLS.';
