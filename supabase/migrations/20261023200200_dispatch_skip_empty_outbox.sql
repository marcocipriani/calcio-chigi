-- Il cron gira ogni minuto: con l'outbox vuota non si chiama l'Edge Function.
-- Le condizioni sono le stesse di claim_notification_outbox (lease scaduti inclusi).

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
  if not exists (
    select 1
    from public.notification_outbox outbox
    where (
        outbox.status in ('PENDING', 'FAILED')
        and outbox.next_attempt_at <= now()
        and outbox.attempts < 5
        and outbox.subscription_id is not null
      )
      or (outbox.status = 'PROCESSING' and outbox.locked_at < now() - interval '5 minutes')
  ) then
    return;
  end if;

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
