-- Napi app: a törzsadatokat elemenként, szerveroldali revízióval egyesíti.

-- A már létező elemek is kapnak szerveroldali alaprevíziót. Így egy migráció
-- előtt megnyitott, régi kliens nem tud null revízióval csendben felülírni.
do $$
begin
  update public.napi_app_config config
     set payload = jsonb_set(
       config.payload,
       '{_configRevisions}',
       (select coalesce(jsonb_object_agg(collection_name, revisions), '{}'::jsonb)
          from (
            select collection_name,
                   coalesce(jsonb_object_agg(item->>'id', to_jsonb(clock_timestamp()::text)) filter (where item is not null), '{}'::jsonb) as revisions
              from unnest(array['workers', 'vehicles', 'tools', 'materials', 'templates', 'customers', 'recurrences']) collection_name
              left join lateral jsonb_array_elements(
                case when jsonb_typeof(config.payload->collection_name) = 'array' then config.payload->collection_name else '[]'::jsonb end
              ) item on nullif(item->>'id', '') is not null
             group by collection_name
          ) existing_items),
       true
     );
end;
$$;

create or replace function public.napi_merge_app_config(
  p_owner_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_change jsonb;
  v_collection text;
  v_id text;
  v_items jsonb;
  v_base_revision text;
  v_current_revision text;
  v_new_revision text;
  v_conflicts jsonb := '[]'::jsonb;
  v_saved_at timestamptz;
begin
  if p_owner_id is distinct from (select auth.uid()) then
    raise insufficient_privilege using message = 'A törzsadat csak a saját fiókhoz menthető.';
  end if;
  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array' then
    raise invalid_parameter_value using message = 'A törzsadat-módosítások formátuma hibás.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('napi-config:' || p_owner_id::text, 0));

  select payload into v_payload
    from public.napi_app_config
   where owner_id = p_owner_id
   for update;

  if not found then
    v_payload := jsonb_build_object(
      'version', 4,
      'workers', '[]'::jsonb,
      'vehicles', '[]'::jsonb,
      'tools', '[]'::jsonb,
      'materials', '[]'::jsonb,
      'templates', '[]'::jsonb,
      'customers', '[]'::jsonb,
      'recurrences', '[]'::jsonb,
      '_configRevisions', '{}'::jsonb
    );
  end if;

  if jsonb_typeof(v_payload->'_configRevisions') <> 'object' then
    v_payload := jsonb_set(v_payload, '{_configRevisions}', '{}'::jsonb, true);
  end if;

  for v_change in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
  loop
    v_collection := v_change->>'collection';
    v_id := v_change->>'id';
    if v_collection not in ('workers', 'vehicles', 'tools', 'materials', 'templates', 'customers', 'recurrences')
       or nullif(v_id, '') is null then
      raise invalid_parameter_value using message = 'Ismeretlen törzsadat-módosítás.';
    end if;

    v_base_revision := nullif(v_change->>'base_revision', '');
    v_current_revision := v_payload #>> array['_configRevisions', v_collection, v_id];
    if v_base_revision is distinct from v_current_revision then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('collection', v_collection, 'id', v_id));
      continue;
    end if;

    select coalesce(jsonb_agg(item order by item_order), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(
        case when jsonb_typeof(v_payload->v_collection) = 'array' then v_payload->v_collection else '[]'::jsonb end
      ) with ordinality as existing(item, item_order)
     where item->>'id' is distinct from v_id;

    if not coalesce((v_change->>'deleted')::boolean, false) then
      if jsonb_typeof(v_change->'value') <> 'object' or v_change->'value'->>'id' is distinct from v_id then
        raise invalid_parameter_value using message = 'A törzsadat értéke hibás.';
      end if;
      v_items := v_items || jsonb_build_array(v_change->'value');
    end if;
    v_payload := jsonb_set(v_payload, array[v_collection], v_items, true);

    if jsonb_typeof(v_payload #> array['_configRevisions', v_collection]) <> 'object' then
      v_payload := jsonb_set(v_payload, array['_configRevisions', v_collection], '{}'::jsonb, true);
    end if;
    v_new_revision := clock_timestamp()::text;
    v_payload := jsonb_set(v_payload, array['_configRevisions', v_collection, v_id], to_jsonb(v_new_revision), true);
  end loop;

  insert into public.napi_app_config (owner_id, payload, updated_at)
  values (p_owner_id, v_payload, now())
  on conflict (owner_id) do update
    set payload = excluded.payload,
        updated_at = now()
  returning updated_at into v_saved_at;

  return jsonb_build_object('payload', v_payload, 'updated_at', v_saved_at, 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.napi_merge_app_config(uuid, jsonb) from public, anon;
grant execute on function public.napi_merge_app_config(uuid, jsonb) to authenticated;

-- A teljes blob közvetlen felülírását lezárjuk; olvasni továbbra is RLS mellett lehet.
revoke all on public.napi_app_config from authenticated;
grant select on public.napi_app_config to authenticated;
