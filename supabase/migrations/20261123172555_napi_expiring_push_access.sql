alter table public.napi_push_subscriptions add column if not exists access_until timestamptz;
create or replace function public.napi_set_push_access_until()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
 if auth.jwt()->'app_metadata'->>'application' = 'napi' then
   new.access_until := (auth.jwt()->'app_metadata'->>'napi_access_until')::timestamptz;
 elsif auth.uid() is not null then
   new.access_until := null;
 end if;
 return new;
end;
$$;
revoke all on function public.napi_set_push_access_until() from public, anon;
grant execute on function public.napi_set_push_access_until() to authenticated;
drop trigger if exists napi_push_access_until on public.napi_push_subscriptions;
create trigger napi_push_access_until before insert or update on public.napi_push_subscriptions
for each row execute function public.napi_set_push_access_until();
