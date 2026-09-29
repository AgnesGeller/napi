-- Napi app: az eltérő eszközök előjegyzéseinek biztonságos összevonása.
-- Csak a Napi app saját RPC-függvényét módosítja.

create or replace function public.napi_upsert_daily_plan(
  p_owner_id uuid,
  p_plan_date date,
  p_payload jsonb,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_existing_payload jsonb;
  v_sanitized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_deleted_ids jsonb := '[]'::jsonb;
  v_work_items jsonb := '[]'::jsonb;
begin
  if p_owner_id is distinct from (select auth.uid()) then
    raise insufficient_privilege using message = 'A napi terv csak a saját fiókhoz menthető.';
  end if;

  select payload
    into v_existing_payload
    from public.napi_daily_plans
   where owner_id = p_owner_id and plan_date = p_plan_date
   for update;

  if found then
    if coalesce((v_existing_payload->>'deleted')::boolean, false)
       and not coalesce((v_sanitized_payload->>'deleted')::boolean, false)
       and nullif(v_existing_payload->>'deletedPlanId', '') is not null
       and v_sanitized_payload->>'id' = v_existing_payload->>'deletedPlanId' then
      return false;
    end if;

    if not coalesce((v_existing_payload->>'deleted')::boolean, false)
       and not coalesce((v_sanitized_payload->>'deleted')::boolean, false) then
      select coalesce(jsonb_agg(to_jsonb(deleted_id) order by deleted_id), '[]'::jsonb)
        into v_deleted_ids
        from (
          select distinct deleted_id
            from (
              select jsonb_array_elements_text(coalesce(v_existing_payload->'deletedWorkItemIds', '[]'::jsonb)) as deleted_id
              union all
              select jsonb_array_elements_text(coalesce(v_sanitized_payload->'deletedWorkItemIds', '[]'::jsonb)) as deleted_id
            ) combined
           where deleted_id <> ''
        ) unique_ids;

      select coalesce(jsonb_agg(merged.work_item order by merged.source_rank, merged.item_order), '[]'::jsonb)
        into v_work_items
        from (
          select distinct on (candidate.item_id)
                 candidate.item_id,
                 candidate.work_item,
                 candidate.source_rank,
                 candidate.item_order
            from (
              select work_item->>'id' as item_id, work_item, 0 as source_rank, item_order
                from jsonb_array_elements(coalesce(v_sanitized_payload->'workItems', '[]'::jsonb)) with ordinality as incoming(work_item, item_order)
              union all
              select work_item->>'id' as item_id, work_item, 1 as source_rank, item_order
                from jsonb_array_elements(coalesce(v_existing_payload->'workItems', '[]'::jsonb)) with ordinality as existing(work_item, item_order)
            ) candidate
           where candidate.item_id <> ''
             and not (v_deleted_ids ? candidate.item_id)
           order by candidate.item_id, candidate.source_rank
        ) merged;

      v_sanitized_payload := jsonb_set(v_sanitized_payload, '{deletedWorkItemIds}', v_deleted_ids, true);
      v_sanitized_payload := jsonb_set(v_sanitized_payload, '{workItems}', v_work_items, true);
    end if;
  end if;

  insert into public.napi_daily_plans (owner_id, plan_date, payload, updated_at)
  values (p_owner_id, p_plan_date, v_sanitized_payload, now())
  on conflict (owner_id, plan_date) do update
    set payload = excluded.payload,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.napi_upsert_daily_plan(uuid, date, jsonb, timestamptz) from public, anon;
grant execute on function public.napi_upsert_daily_plan(uuid, date, jsonb, timestamptz) to authenticated;
