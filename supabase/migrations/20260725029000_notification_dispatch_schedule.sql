begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_pending_notifications()
returns void
language plpgsql
security definer
set search_path = private, vault, net, pg_catalog
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret
    into dispatch_url
    from vault.decrypted_secrets
   where name = 'notification_dispatch_url'
   limit 1;

  select decrypted_secret
    into dispatch_secret
    from vault.decrypted_secrets
   where name = 'notification_dispatch_secret'
   limit 1;

  if dispatch_url is null or dispatch_secret is null then
    return;
  end if;

  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.dispatch_pending_notifications() from public;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'dispatch-team-notifications'
   limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'dispatch-team-notifications',
    '* * * * *',
    'select private.dispatch_pending_notifications();'
  );
end;
$$;

commit;
