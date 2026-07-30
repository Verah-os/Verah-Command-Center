\set ON_ERROR_STOP on

do $$
declare
  resolved_customer_id uuid;
begin
  select channel.customer_id
  into resolved_customer_id
  from public.customer_channels as channel
  where channel.channel_type = 'whatsapp'
    and channel.channel_address = '+5516999990099';

  if resolved_customer_id is null then
    raise exception 'Concurrent resolution did not create a customer';
  end if;

  if (
    select pg_catalog.count(*)
    from public.customer_channels as channel
    where channel.channel_type = 'whatsapp'
      and channel.channel_address = '+5516999990099'
  ) <> 1 then
    raise exception 'Concurrent resolution created duplicate channels';
  end if;

  if (
    select pg_catalog.count(*)
    from public.customers as customer
    where customer.id = resolved_customer_id
  ) <> 1 then
    raise exception 'Concurrent resolution created an invalid customer';
  end if;
end;
$$;

delete from public.customers
where id = (
  select channel.customer_id
  from public.customer_channels as channel
  where channel.channel_type = 'whatsapp'
    and channel.channel_address = '+5516999990099'
);
