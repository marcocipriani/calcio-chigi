-- La home legge la vista predefinita dal contesto di sessione: niente query
-- separata sul profilo a ogni caricamento.

create or replace function public.get_app_context()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'auth'
as $function$
  with own_profile as (
    select p.*
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
  ),
  association as (
    select r.id, r.profile_id, r.status, r.requested_at
    from public.account_association_requests r
    where r.user_id = auth.uid()
    limit 1
  ),
  target_season as (
    select s.*
    from public.seasons s
    order by s.starts_on desc
    limit 1
  ),
  membership as (
    select m.*
    from public.season_memberships m
    join own_profile p on p.id = m.profile_id
    join target_season s on s.id = m.season_id
    limit 1
  ),
  open_payments as (
    select count(*)::integer as count,
           coalesce(sum(p.amount_due - p.amount_paid), 0) as amount
    from public.payments p
    join membership m on m.id = p.membership_id
    where p.status <> 'PAID'
  )
  select jsonb_build_object(
    'profile',
    (
      select jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'cognome', p.cognome,
        'avatar_url', p.avatar_url,
        'data_nascita', p.data_nascita,
        'is_manager', p.is_manager,
        'default_view', p.default_view
      )
      from own_profile p
    ),
    'associationStatus',
    case
      when exists(select 1 from own_profile) then 'ACTIVE'
      when exists(select 1 from association where status = 'PENDING') then 'REQUESTED'
      else 'NONE'
    end,
    'associationRequest',
    (select to_jsonb(a) from association a),
    'targetSeason',
    (
      select jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'starts_on', s.starts_on,
        'ends_on', s.ends_on
      )
      from target_season s
    ),
    'membership',
    (select to_jsonb(m) from membership m),
    'openPayments',
    (
      select jsonb_build_object('count', p.count, 'amount', p.amount)
      from open_payments p
    ),
    'unreadNotifications',
    (
      select count(*)
      from public.notification_recipients nr
      where nr.user_id = auth.uid()
        and nr.read_at is null
    )
  );
$function$;
