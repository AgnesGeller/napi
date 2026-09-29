-- Napi app: eszközönként követett kézbesítés és véges, biztonságos újrapróbálás.

alter table public.napi_notification_reminders
  add column if not exists delivered_subscription_ids uuid[] not null default '{}'::uuid[],
  add column if not exists next_attempt_at timestamptz,
  add column if not exists failed_at timestamptz;

drop index if exists public.napi_notification_reminders_due_idx;
create index napi_notification_reminders_due_idx
  on public.napi_notification_reminders (coalesce(next_attempt_at, scheduled_for))
  where sent_at is null and failed_at is null;

create or replace function public.napi_claim_due_reminders(p_limit integer default 50)
returns setof public.napi_notification_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return query
  with due as (
    select r.id
      from public.napi_notification_reminders r
     where r.sent_at is null
       and r.failed_at is null
       and r.scheduled_for <= now()
       and r.scheduled_for > now() - interval '24 hours'
       and r.attempt_count < 8
       and (r.next_attempt_at is null or r.next_attempt_at <= now())
       and (r.locked_at is null or r.locked_at < now() - interval '5 minutes')
     order by coalesce(r.next_attempt_at, r.scheduled_for), r.scheduled_for
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.napi_notification_reminders r
       set locked_at = now(),
           next_attempt_at = null,
           attempt_count = r.attempt_count + 1,
           updated_at = now()
      from due
     where r.id = due.id
    returning r.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.napi_claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.napi_claim_due_reminders(integer) to service_role;

create or replace function public.napi_complete_reminder_attempt(
  p_reminder_id uuid,
  p_delivered_subscription_ids uuid[] default '{}'::uuid[],
  p_errors text[] default '{}'::text[],
  p_retry boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder public.napi_notification_reminders%rowtype;
  v_delivered uuid[];
  v_remaining integer;
  v_error text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;

  select * into v_reminder
    from public.napi_notification_reminders
   where id = p_reminder_id
   for update;
  if not found then raise no_data_found using message = 'Az emlékeztető nem található.'; end if;

  select coalesce(array_agg(distinct delivered_id), '{}'::uuid[])
    into v_delivered
    from unnest(coalesce(v_reminder.delivered_subscription_ids, '{}'::uuid[]) || coalesce(p_delivered_subscription_ids, '{}'::uuid[])) delivered_id;
  v_error := nullif(array_to_string(coalesce(p_errors, '{}'::text[]), ', '), '');

  select count(*) into v_remaining
    from public.napi_push_subscriptions subscription
   where subscription.owner_id = v_reminder.owner_id
     and subscription.enabled
     and not (subscription.id = any(v_delivered));

  if v_remaining = 0 and cardinality(v_delivered) > 0 then
    update public.napi_notification_reminders
       set delivered_subscription_ids = v_delivered,
           sent_at = now(), failed_at = null, locked_at = null, next_attempt_at = null,
           last_error = v_error, updated_at = now()
     where id = p_reminder_id
    returning * into v_reminder;
  elsif p_retry and v_reminder.attempt_count < 8 and v_reminder.scheduled_for > now() - interval '24 hours' then
    update public.napi_notification_reminders
       set delivered_subscription_ids = v_delivered,
           locked_at = null,
           next_attempt_at = now() + make_interval(mins => least(30, power(2, greatest(v_reminder.attempt_count - 1, 0))::integer)),
           last_error = coalesce(v_error, 'Átmeneti kézbesítési hiba.'), updated_at = now()
     where id = p_reminder_id
    returning * into v_reminder;
  else
    update public.napi_notification_reminders
       set delivered_subscription_ids = v_delivered,
           failed_at = now(), locked_at = null, next_attempt_at = null,
           last_error = coalesce(v_error, 'Nincs elérhető, engedélyezett eszköz.'), updated_at = now()
     where id = p_reminder_id
    returning * into v_reminder;
  end if;

  return to_jsonb(v_reminder);
end;
$$;

revoke all on function public.napi_complete_reminder_attempt(uuid, uuid[], text[], boolean) from public, anon, authenticated;
grant execute on function public.napi_complete_reminder_attempt(uuid, uuid[], text[], boolean) to service_role;
