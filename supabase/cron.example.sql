-- Deployment template only. Replace the placeholders in a secure environment.
-- Never commit real secret values.

select vault.create_secret('<project-url>', 'napi_project_url', 'Napi Supabase project URL');
select vault.create_secret('<legacy-anon-jwt>', 'napi_legacy_anon_key', 'Napi cron authorization');
select vault.create_secret('<vapid-public-key>', 'napi_vapid_public_key', 'Napi Web Push public key');
select vault.create_secret('<vapid-private-key>', 'napi_vapid_private_key', 'Napi Web Push private key');

select cron.schedule(
  'napi-send-push-reminders',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='napi_project_url') || '/functions/v1/napi-send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name='napi_legacy_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='napi_legacy_anon_key')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
