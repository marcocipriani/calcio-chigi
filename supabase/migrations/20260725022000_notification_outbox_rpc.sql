-- Atomic notification outbox claiming and retry bookkeeping.

begin;

create or replace function public.claim_notification_outbox(
  p_limit integer default 25
)
returns table (
  outbox_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  title text,
  body text,
  deep_link text,
  notification_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_limit, 0) < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100';
  end if;

  update public.notification_outbox
  set status = 'FAILED',
      locked_at = null,
      next_attempt_at = now(),
      last_error = coalesce(last_error, 'Worker lease expired')
  where status = 'PROCESSING'
    and locked_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('PENDING', 'FAILED')
      and outbox.next_attempt_at <= now()
      and outbox.attempts < 5
      and outbox.subscription_id is not null
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_outbox outbox
    set status = 'PROCESSING',
        attempts = outbox.attempts + 1,
        locked_at = now(),
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_secret,
    notification.title,
    notification.body,
    notification.deep_link,
    notification.type
  from claimed
  join public.notifications notification
    on notification.id = claimed.notification_id
  join public.push_subscriptions subscription
    on subscription.id = claimed.subscription_id;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_outbox_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.notification_outbox
  set status = case
        when p_success then 'DELIVERED'::public.notification_delivery_status
        else 'FAILED'::public.notification_delivery_status
      end,
      delivered_at = case when p_success then now() else null end,
      locked_at = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Push delivery failed'), 1000) end,
      next_attempt_at = case
        when p_success then next_attempt_at
        else now() + make_interval(
          mins => least(60, greatest(1, power(2, attempts)::integer))
        )
      end
  where id = p_outbox_id
    and status = 'PROCESSING';

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Outbox item is not being processed';
  end if;
end;
$$;

revoke all on function public.claim_notification_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer)
  to service_role;
grant execute on function public.complete_notification_delivery(uuid, boolean, text)
  to service_role;

commit;
