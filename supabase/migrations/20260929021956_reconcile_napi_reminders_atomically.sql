-- Napi app: optimista napi terv mentés és az előjegyzés-emlékeztetők
-- atomikus, a szerveren összefésült tervből történő újraépítése.

create or replace function public.napi_save_daily_plan(
  p_owner_id uuid,
  p_plan_date date,
  p_payload jsonb,
  p_base_updated_at timestamptz,
  p_work_items_only boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing_payload jsonb;
  v_existing_updated_at timestamptz;
  v_sanitized_payload jsonb := coalesce(p_payload, '{}'::jsonb) - 'cloudUpdatedAt';
  v_deleted_ids jsonb := '[]'::jsonb;
  v_work_items jsonb := '[]'::jsonb;
  v_saved_at timestamptz;
begin
  if p_owner_id is distinct from (select auth.uid()) then
    raise insufficient_privilege using message = 'A napi terv csak a saját fiókhoz menthető.';
  end if;

  -- Ugyanazt a tulajdonos/dátum párt új sor létrehozásakor is sorba állítja.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_plan_date::text, 0)
  );

  select payload, updated_at
    into v_existing_payload, v_existing_updated_at
    from public.napi_daily_plans
   where owner_id = p_owner_id and plan_date = p_plan_date
   for update;

  if found then
    if coalesce((v_existing_payload->>'deleted')::boolean, false)
       and not coalesce((v_sanitized_payload->>'deleted')::boolean, false)
       and nullif(v_existing_payload->>'deletedPlanId', '') is not null
       and v_sanitized_payload->>'id' = v_existing_payload->>'deletedPlanId' then
      return pg_catalog.jsonb_build_object('accepted', false, 'updated_at', v_existing_updated_at, 'payload', v_existing_payload);
    end if;

    -- Teljes napi tervet csak abból a szerververzióból lehet menteni, amelyből
    -- a kliens dolgozott. Az előjegyzéseket külön, azonosító alapján egyesítjük.
    if not p_work_items_only
       and p_base_updated_at is distinct from v_existing_updated_at then
      return pg_catalog.jsonb_build_object('accepted', false, 'updated_at', v_existing_updated_at, 'payload', v_existing_payload);
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

      if p_work_items_only then
        v_sanitized_payload := v_existing_payload;
      end if;
      v_sanitized_payload := jsonb_set(v_sanitized_payload, '{deletedWorkItemIds}', v_deleted_ids, true);
      v_sanitized_payload := jsonb_set(v_sanitized_payload, '{workItems}', v_work_items, true);
    end if;
  end if;

  insert into public.napi_daily_plans (owner_id, plan_date, payload, updated_at)
  values (p_owner_id, p_plan_date, v_sanitized_payload, now())
  on conflict (owner_id, plan_date) do update
    set payload = excluded.payload,
        updated_at = now()
  returning updated_at into v_saved_at;

  if coalesce((v_sanitized_payload->>'deleted')::boolean, false) then
    delete from public.napi_notification_reminders
     where owner_id = p_owner_id
       and plan_date = p_plan_date
       and sent_at is null;
  else
    delete from public.napi_notification_reminders reminder
     where reminder.owner_id = p_owner_id
       and reminder.plan_date = p_plan_date
       and reminder.sent_at is null
       and not exists (
         select 1
           from jsonb_array_elements(coalesce(v_sanitized_payload->'workItems', '[]'::jsonb)) work_item
           cross join lateral jsonb_array_elements_text(coalesce(work_item->'reminderTimes', '[]'::jsonb)) reminder_time
          where work_item->>'id' = reminder.work_item_id
            and work_item->>'type' in ('survey', 'meeting')
            and reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            and ((p_plan_date + reminder_time::time) at time zone 'Europe/Budapest') = reminder.scheduled_for
       );

    insert into public.napi_notification_reminders (
      owner_id, plan_date, work_item_id, notification_type,
      title, body, scheduled_for, updated_at
    )
    select distinct
      p_owner_id,
      p_plan_date,
      work_item->>'id',
      work_item->>'type',
      (case when work_item->>'type' = 'survey' then 'Felmérés' else 'Megbeszélés' end)
        || ': ' || coalesce(nullif(work_item->>'customerName', ''), 'Nincs megadva'),
      coalesce(
        nullif(concat_ws(' – ', nullif(work_item->>'address', ''), nullif(work_item->>'note', '')), ''),
        'Nyisd meg a Napi feladatok alkalmazást a részletekért.'
      ),
      (p_plan_date + reminder_time::time) at time zone 'Europe/Budapest',
      now()
      from jsonb_array_elements(coalesce(v_sanitized_payload->'workItems', '[]'::jsonb)) work_item
      cross join lateral jsonb_array_elements_text(coalesce(work_item->'reminderTimes', '[]'::jsonb)) reminder_time
     where nullif(work_item->>'id', '') is not null
       and work_item->>'type' in ('survey', 'meeting')
       and reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    on conflict (owner_id, work_item_id, scheduled_for) do update
      set plan_date = excluded.plan_date,
          notification_type = excluded.notification_type,
          title = excluded.title,
          body = excluded.body,
          updated_at = now();
  end if;

  return pg_catalog.jsonb_build_object('accepted', true, 'updated_at', v_saved_at, 'payload', v_sanitized_payload);
end;
$$;

revoke all on function public.napi_save_daily_plan(uuid, date, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.napi_save_daily_plan(uuid, date, jsonb, timestamptz, boolean) to authenticated;

-- A régi kliens kétlépcsős emlékeztető-cseréje versenyhelyzetet okoz, ezért a
-- régi RPC-t nem engedjük többé írni; az új kliens az atomikus függvényt hívja.
revoke execute on function public.napi_upsert_daily_plan(uuid, date, jsonb, timestamptz) from authenticated;
