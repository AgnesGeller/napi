-- Napi app: felhasználónként elkülönített törzsadat- és napi tervtárolás.

create table if not exists public.napi_app_config (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.napi_daily_plans (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_date date not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (owner_id, plan_date)
);

alter table public.napi_app_config enable row level security;
alter table public.napi_daily_plans enable row level security;

revoke all on public.napi_app_config from anon;
revoke all on public.napi_daily_plans from anon;
grant select, insert, update, delete on public.napi_app_config to authenticated;
grant select, insert, update, delete on public.napi_daily_plans to authenticated;

drop policy if exists napi_app_config_select_own on public.napi_app_config;
create policy napi_app_config_select_own on public.napi_app_config for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_app_config_insert_own on public.napi_app_config;
create policy napi_app_config_insert_own on public.napi_app_config for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_app_config_update_own on public.napi_app_config;
create policy napi_app_config_update_own on public.napi_app_config for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_app_config_delete_own on public.napi_app_config;
create policy napi_app_config_delete_own on public.napi_app_config for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists napi_daily_plans_select_own on public.napi_daily_plans;
create policy napi_daily_plans_select_own on public.napi_daily_plans for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_daily_plans_insert_own on public.napi_daily_plans;
create policy napi_daily_plans_insert_own on public.napi_daily_plans for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_daily_plans_update_own on public.napi_daily_plans;
create policy napi_daily_plans_update_own on public.napi_daily_plans for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
drop policy if exists napi_daily_plans_delete_own on public.napi_daily_plans;
create policy napi_daily_plans_delete_own on public.napi_daily_plans for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create or replace function public.napi_upsert_daily_plan(
  p_owner_id uuid, p_plan_date date, p_payload jsonb, p_updated_at timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_owner_id is distinct from (select auth.uid()) then
    raise insufficient_privilege using message = 'A napi terv csak a saját fiókhoz menthető.';
  end if;
  insert into public.napi_daily_plans(owner_id, plan_date, payload, updated_at)
  values (p_owner_id, p_plan_date, coalesce(p_payload, '{}'::jsonb), now())
  on conflict (owner_id, plan_date) do update set payload = excluded.payload, updated_at = now();
  return true;
end;
$$;

revoke all on function public.napi_upsert_daily_plan(uuid, date, jsonb, timestamptz) from public, anon;
grant execute on function public.napi_upsert_daily_plan(uuid, date, jsonb, timestamptz) to authenticated;
