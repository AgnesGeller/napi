-- Napi app: Android Web Push subscriptions and scheduled reminders.
-- Only Napi-prefixed objects are created; no Kassza or Munkalap object is changed.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.napi_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_name text not null default 'Android telefon',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, endpoint)
);

create table if not exists public.napi_notification_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  work_item_id text not null,
  notification_type text not null check (notification_type in ('survey', 'meeting')),
  title text not null,
  body text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  locked_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, work_item_id, scheduled_for)
);

create index if not exists napi_notification_reminders_due_idx
  on public.napi_notification_reminders (scheduled_for)
  where sent_at is null;
create index if not exists napi_notification_reminders_owner_date_idx
  on public.napi_notification_reminders (owner_id, plan_date);

alter table public.napi_push_subscriptions enable row level security;
alter table public.napi_notification_reminders enable row level security;

revoke all on public.napi_push_subscriptions from anon;
revoke all on public.napi_notification_reminders from anon;
grant select, insert, update, delete on public.napi_push_subscriptions to authenticated;
grant select, insert, update, delete on public.napi_notification_reminders to authenticated;

drop policy if exists "Napi push subscriptions are private" on public.napi_push_subscriptions;
create policy "Napi push subscriptions are private"
  on public.napi_push_subscriptions for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Napi reminders are private" on public.napi_notification_reminders;
create policy "Napi reminders are private"
  on public.napi_notification_reminders for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

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
      and r.scheduled_for <= now()
      and r.scheduled_for > now() - interval '15 minutes'
      and (r.locked_at is null or r.locked_at < now() - interval '5 minutes')
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.napi_notification_reminders r
       set locked_at = now(), attempt_count = r.attempt_count + 1, updated_at = now()
      from due
     where r.id = due.id
    returning r.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.napi_claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.napi_claim_due_reminders(integer) to service_role;

create or replace function public.napi_get_web_push_secrets()
returns table (public_key text, private_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return query
  select
    max(case when s.name = 'napi_vapid_public_key' then s.decrypted_secret end),
    max(case when s.name = 'napi_vapid_private_key' then s.decrypted_secret end)
  from vault.decrypted_secrets s
  where s.name in ('napi_vapid_public_key', 'napi_vapid_private_key');
end;
$$;

revoke all on function public.napi_get_web_push_secrets() from public, anon, authenticated;
grant execute on function public.napi_get_web_push_secrets() to service_role;

