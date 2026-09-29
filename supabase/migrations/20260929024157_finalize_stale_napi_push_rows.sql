-- Napi app: a megszakadt utolsó próbálkozás és a túl régi sor se maradjon függőben.

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

  update public.napi_notification_reminders r
     set failed_at = now(),
         locked_at = null,
         next_attempt_at = null,
         last_error = coalesce(r.last_error, case
           when r.attempt_count >= 8 then 'Az értesítés az újrapróbálási korlát után sem volt kézbesíthető.'
           else 'Az értesítés kézbesítési ideje lejárt.'
         end),
         updated_at = now()
   where r.sent_at is null
     and r.failed_at is null
     and (r.attempt_count >= 8 or r.scheduled_for <= now() - interval '24 hours')
     and (r.locked_at is null or r.locked_at < now() - interval '5 minutes');

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
