create table if not exists public.user_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('customer','concierge','provider','admin')),
 display_name text not null,
 provider_id uuid references public.service_providers(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint user_profiles_provider_role check((role='provider' and provider_id is not null) or (role<>'provider' and provider_id is null))
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon,authenticated; grant select on public.user_profiles to authenticated;

create or replace function public.current_verah_role() returns text language sql stable security definer set search_path='' as $$ select role from public.user_profiles where user_id=auth.uid() $$;
create or replace function public.current_verah_provider_id() returns uuid language sql stable security definer set search_path='' as $$ select provider_id from public.user_profiles where user_id=auth.uid() and role='provider' $$;
revoke all on function public.current_verah_role(),public.current_verah_provider_id() from public,anon,authenticated;
grant execute on function public.current_verah_role(),public.current_verah_provider_id() to authenticated;

create policy "Users read own profile" on public.user_profiles for select to authenticated using(user_id=(select auth.uid()) or (select public.current_verah_role())='admin');

drop policy if exists "Customers can read their service requests" on public.service_requests;
drop policy if exists "Command Center can read service requests" on public.service_requests;
create policy "Role scoped service request access" on public.service_requests for select to authenticated using(
 ((select public.current_verah_role())='customer' and created_by=(select auth.uid()))
 or (select public.current_verah_role()) in ('concierge','admin')
 or ((select public.current_verah_role())='provider' and provider_id=(select public.current_verah_provider_id()))
);

drop policy if exists "Authenticated users read quotes" on public.service_quotes;
create policy "Role scoped quote access" on public.service_quotes for select to authenticated using(exists(
 select 1 from public.service_requests r where r.id=service_request_id and (
  ((select public.current_verah_role())='customer' and r.created_by=(select auth.uid()))
  or (select public.current_verah_role()) in ('concierge','admin')
  or ((select public.current_verah_role())='provider' and r.provider_id=(select public.current_verah_provider_id()))
 )));
drop policy if exists "Authenticated users read quote items" on public.service_quote_items;
create policy "Role scoped quote item access" on public.service_quote_items for select to authenticated using(exists(
 select 1 from public.service_quotes q join public.service_requests r on r.id=q.service_request_id where q.id=quote_id and (
  ((select public.current_verah_role())='customer' and r.created_by=(select auth.uid()))
  or (select public.current_verah_role()) in ('concierge','admin')
  or ((select public.current_verah_role())='provider' and r.provider_id=(select public.current_verah_provider_id()))
 )));
