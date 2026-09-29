-- Napi app: a törlési jelzőt egy régebbi kliens ne tudja visszaírni napi tervvé.

create or replace function public.napi_upsert_daily_plan(
  p_owner_id uuid, p_plan_date date, p_payload jsonb, p_updated_at timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_existing_payload jsonb;
begin
  if p_owner_id is distinct from (select auth.uid()) then
    raise insufficient_privilege using message = 'A napi terv csak a saját fiókhoz menthető.';
  end if;
  select payload into v_existing_payload
    from public.napi_daily_plans
   where owner_id = p_owner_id and plan_date = p_plan_date
   for update;
  if found
     and coalesce((v_existing_payload->>'deleted')::boolean, false)
     and not coalesce((p_payload->>'deleted')::boolean, false)
     and nullif(v_existing_payload->>'deletedPlanId', '') is not null
     and p_payload->>'id' = v_existing_payload->>'deletedPlanId' then
    return false;
  end if;
  insert into public.napi_daily_plans(owner_id, plan_date, payload, updated_at)
  values (p_owner_id, p_plan_date, coalesce(p_payload, '{}'::jsonb), now())
  on conflict (owner_id, plan_date) do update set payload = excluded.payload, updated_at = now();
  return true;
end;
$$;
