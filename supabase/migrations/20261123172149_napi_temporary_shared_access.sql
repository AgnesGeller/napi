-- Napi-only shared access. Expiry is enforced by the database clock, including existing JWTs.
create or replace function public.napi_access_owner_id()
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare metadata jsonb := coalesce(auth.jwt()->'app_metadata', '{}'::jsonb);
begin
  if metadata->>'application' = 'napi' then
    if nullif(metadata->>'napi_access_until', '') is null
       or now() >= (metadata->>'napi_access_until')::timestamptz then
      return null;
    end if;
    return nullif(metadata->>'napi_owner_id', '')::uuid;
  end if;
  return auth.uid();
end;
$$;
revoke all on function public.napi_access_owner_id() from public, anon;
grant execute on function public.napi_access_owner_id() to authenticated;

do $$
declare p record; definition text;
begin
  for p in select * from pg_policies where schemaname = 'public'
    and tablename in ('napi_app_config','napi_daily_plans','napi_push_subscriptions','napi_notification_reminders')
  loop
    execute format('alter policy %I on public.%I%s%s', p.policyname, p.tablename,
      case when p.qual is not null then ' using (' || replace(p.qual, 'auth.uid()', 'public.napi_access_owner_id()') || ')' else '' end,
      case when p.with_check is not null then ' with check (' || replace(p.with_check, 'auth.uid()', 'public.napi_access_owner_id()') || ')' else '' end);
  end loop;
  for p in select proc.oid from pg_proc proc join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public' and proc.proname in ('napi_save_daily_plan','napi_merge_app_config','napi_upsert_daily_plan')
  loop
    definition := replace(pg_get_functiondef(p.oid), 'auth.uid()', 'public.napi_access_owner_id()');
    execute definition;
  end loop;
end;
$$;
