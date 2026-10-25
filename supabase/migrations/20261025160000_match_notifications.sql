-- Notifiche della partita a tutti gli utenti, con un tipo per evento:
-- MATCH_START (calcio d'inizio), MATCH_GOAL (goal Chigi), MATCH_GOAL_AGAINST
-- (goal avversari, separati: si spengono da soli), MATCH_END (fischio
-- finale, anche con la chiusura automatica). Destinatari: ogni account
-- collegato a un profilo, tranne il manager che sta registrando.
-- Ogni tipo non critico si spegne dalle impostazioni (notification_preferences):
-- spento vuol dire niente push e niente campanella.

-- Come opponentOf (src/lib/utils.ts): la squadra che non è Chigi, poi avversario.
create or replace function private.match_opponent(p_event public.events)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(case
      when p_event.squadra_casa ilike '%chigi%' then p_event.squadra_ospite
      when p_event.squadra_ospite ilike '%chigi%' then p_event.squadra_casa
    end, ''),
    nullif(p_event.avversario, ''),
    'Avversario'
  );
$$;

create or replace function private.match_notify(
  p_event_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_key text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_users uuid[];
begin
  select array_agg(distinct user_id) into target_users
  from public.profiles
  where user_id is not null
    and deleted_at is null
    and id is distinct from p_actor;

  perform public.create_notification(
    p_type, p_title, p_body, '/evento/' || p_event_id::text,
    target_users, false, p_key, p_actor
  );
end;
$$;

create or replace function private.match_notify_end(p_event_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  chigi_home boolean;
begin
  select * into ev from public.events where id = p_event_id;
  chigi_home := coalesce(ev.squadra_casa ilike '%chigi%', false);
  perform private.match_notify(
    p_event_id,
    'MATCH_END',
    'Finale: Chigi '
      || case when chigi_home then ev.gol_casa else ev.gol_ospite end || '-'
      || case when chigi_home then ev.gol_ospite else ev.gol_casa end || ' '
      || private.match_opponent(ev),
    'Fischio finale. Risultato, cronaca e statistiche in app.',
    'match-end:' || p_event_id::text,
    p_actor
  );
end;
$$;

revoke all on function private.match_opponent(public.events) from public, anon, authenticated;
revoke all on function private.match_notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function private.match_notify_end(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_record(p_id uuid, p_event_id uuid, p_kind text, p_period integer, p_minute integer, p_stoppage integer, p_occurred_at timestamp with time zone, p_profile_id uuid, p_assist_profile_id uuid, p_sub_in_profile_id uuid)
 RETURNS match_timeline
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := private.match_require_manager();
  session public.match_sessions;
  entry public.match_timeline;
  ev public.events;
  opponent text;
  label text;
  body text;
begin
  select * into entry from public.match_timeline where id = p_id;
  if entry.id is not null then
    return entry; -- Già ricevuto: la coda del telefono può reinviare.
  end if;

  select * into session from public.match_sessions where event_id = p_event_id for update;
  if session.event_id is null then
    raise exception 'MATCH_NOT_STARTED';
  end if;
  -- ponytail: niente registro dei passaggi; chi ha perso il controllo può
  -- inviare solo eventi avvenuti prima che un altro lo prendesse.
  if session.operator_profile_id is distinct from me
     and p_occurred_at > session.operator_since then
    raise exception 'MATCH_CONTROL_LOST' using errcode = '42501';
  end if;
  -- Dopo il fischio finale le statistiche sono già salvate: un evento in
  -- ritardo (coda di chi aveva perso il controllo) non entrerebbe nei conti.
  if session.status = 'FINISHED' then
    raise exception 'MATCH_FINISHED';
  end if;

  if p_kind not in ('GOAL', 'OWN_GOAL_FOR', 'UNATTRIBUTED_GOAL', 'GOAL_AGAINST', 'YELLOW', 'RED', 'SUB') then
    raise exception 'Invalid event kind';
  end if;
  if (p_kind in ('GOAL', 'YELLOW', 'RED', 'SUB')) <> (p_profile_id is not null) then
    raise exception 'Player is required for this event';
  end if;
  if p_assist_profile_id is not null and (p_kind <> 'GOAL' or p_assist_profile_id = p_profile_id) then
    raise exception 'Invalid assist';
  end if;
  if (p_kind = 'SUB') <> (p_sub_in_profile_id is not null)
     or p_sub_in_profile_id = p_profile_id then
    raise exception 'Invalid substitution';
  end if;
  if p_occurred_at > now() + interval '1 minute' then
    raise exception 'Event is in the future';
  end if;

  insert into public.match_timeline (
    id, event_id, kind, period, minute, stoppage, occurred_at,
    profile_id, assist_profile_id, sub_in_profile_id, created_by
  )
  values (
    p_id, p_event_id, p_kind, p_period, p_minute, coalesce(p_stoppage, 0), p_occurred_at,
    p_profile_id, p_assist_profile_id, p_sub_in_profile_id, me
  )
  returning * into entry;

  perform private.match_recount(p_event_id);

  if p_kind in ('GOAL', 'OWN_GOAL_FOR', 'UNATTRIBUTED_GOAL', 'GOAL_AGAINST') then
    select * into session from public.match_sessions where event_id = p_event_id;
    select * into ev from public.events where id = p_event_id;
    opponent := private.match_opponent(ev);
    label := p_minute::text || case when coalesce(p_stoppage, 0) > 0 then '+' || p_stoppage::text else '' end || '''';
    body := case p_kind
      when 'GOAL' then
        'Goal Chigi! ' || (select cognome from public.profiles where id = p_profile_id) || ' ' || label
        || coalesce(' (assist ' || (select cognome from public.profiles where id = p_assist_profile_id) || ')', '')
      when 'OWN_GOAL_FOR' then 'Goal Chigi! Autogol avversario ' || label
      when 'UNATTRIBUTED_GOAL' then 'Goal Chigi! ' || label
      else 'Goal ' || opponent || ' ' || label
    end || ' · ' || session.score_ours || '-' || session.score_theirs;

    -- I goal subiti hanno un tipo loro: chi non li vuole li spegne da solo.
    perform private.match_notify(
      p_event_id,
      case when p_kind = 'GOAL_AGAINST' then 'MATCH_GOAL_AGAINST' else 'MATCH_GOAL' end,
      'Chigi ' || session.score_ours || '-' || session.score_theirs || ' ' || opponent,
      body,
      'match-goal:' || p_id::text,
      me
    );
  end if;

  return entry;
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_start(p_event_id uuid, p_period_minutes integer, p_lineup jsonb)
 RETURNS match_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := private.match_require_manager();
  session public.match_sessions;
begin
  if not exists (
    select 1 from public.events
    where id = p_event_id and tipo in ('PARTITA', 'AMICHEVOLE') and not cancellato
  ) then
    raise exception 'Match not found';
  end if;
  if jsonb_typeof(p_lineup -> 'starters') <> 'array'
     or jsonb_array_length(p_lineup -> 'starters') = 0 then
    raise exception 'Starters are required';
  end if;

  insert into public.match_sessions (
    event_id, period_minutes, lineup, operator_profile_id
  )
  values (p_event_id, coalesce(p_period_minutes, 35), p_lineup, me)
  on conflict (event_id) do nothing
  returning * into session;

  if session.event_id is null then
    raise exception 'MATCH_ALREADY_STARTED';
  end if;

  insert into public.match_timeline (id, event_id, kind, period, minute, occurred_at, created_by)
  values (gen_random_uuid(), p_event_id, 'PERIOD_START', 1, 0, session.period_started_at, me);

  perform private.match_notify(
    p_event_id,
    'MATCH_START',
    'Chigi – ' || (select private.match_opponent(e) from public.events e where e.id = p_event_id) || ': si parte!',
    'Calcio d''inizio. Segui la diretta con risultato e cronaca.',
    'match-start:' || p_event_id::text,
    me
  );

  return session;
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_finish(p_event_id uuid, p_summary jsonb)
 RETURNS match_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  session public.match_sessions := private.match_operator_session(p_event_id);
  me uuid := public.current_profile_id();
begin
  if session.status <> 'SECOND_HALF' then
    raise exception 'The match can end only during the second half';
  end if;

  perform private.match_apply_summary(p_event_id, p_summary, me);

  insert into public.match_timeline (id, event_id, kind, period, minute, stoppage, occurred_at, created_by)
  values (
    gen_random_uuid(), p_event_id, 'PERIOD_END', 2, session.period_minutes * 2,
    greatest(0, ceil(extract(epoch from now() - session.period_started_at) / 60)::integer - session.period_minutes),
    now(), me
  );

  update public.match_sessions
  set status = 'FINISHED', finished_at = now()
  where event_id = p_event_id
  returning * into session;

  perform private.match_notify_end(p_event_id, me);

  return session;
end;
$function$;

CREATE OR REPLACE FUNCTION private.match_auto_close_stale()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  session public.match_sessions;
  end_at timestamptz;
  actor uuid;
  manager_users uuid[];
begin
  for session in
    select * from public.match_sessions
    where status <> 'FINISHED' and created_at < now() - interval '4 hours'
    for update skip locked
  loop
    end_at := least(
      now(),
      session.period_started_at + make_interval(mins => session.period_minutes + session.added_minutes)
    );
    -- checked_in_by è obbligatorio: firma chi stava segnando, o un manager.
    actor := coalesce(
      session.operator_profile_id,
      (select id from public.profiles where is_manager and deleted_at is null order by created_at limit 1)
    );

    if session.status in ('FIRST_HALF', 'SECOND_HALF') then
      insert into public.match_timeline (id, event_id, kind, period, minute, stoppage, occurred_at, created_by)
      values (
        gen_random_uuid(), session.event_id, 'PERIOD_END',
        case when session.status = 'FIRST_HALF' then 1 else 2 end,
        session.period_minutes * case when session.status = 'FIRST_HALF' then 1 else 2 end,
        session.added_minutes, end_at, null
      );
    end if;

    perform private.match_apply_summary(
      session.event_id,
      private.match_summary_from_timeline(session.event_id, end_at),
      actor
    );

    update public.match_sessions
    set status = 'FINISHED', finished_at = end_at
    where event_id = session.event_id;

    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager and user_id is not null and deleted_at is null;

    perform private.match_notify_end(session.event_id, null);

    perform public.create_notification(
      'MATCH_AUTO_CLOSED',
      'Partita chiusa in automatico',
      'Nessuno ha fischiato la fine: risultato e statistiche sono dalla cronaca. Controlla il riepilogo.',
      '/evento/' || session.event_id::text || '/partita',
      manager_users,
      false,
      'match-auto-closed:' || session.event_id::text,
      null
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_notification(p_type text, p_title text, p_body text, p_deep_link text, p_target_user_ids uuid[], p_critical boolean, p_idempotency_key text, p_actor_profile_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  notification_id_value uuid;
begin
  if nullif(trim(p_type), '') is null
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_body), '') is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Notification type, title, body and idempotency key are required';
  end if;

  insert into public.notifications (
    type,
    title,
    body,
    deep_link,
    critical,
    actor_profile_id,
    idempotency_key
  )
  values (
    p_type,
    p_title,
    p_body,
    nullif(trim(p_deep_link), ''),
    coalesce(p_critical, false),
    p_actor_profile_id,
    p_idempotency_key
  )
  on conflict (idempotency_key) do update
  set idempotency_key = excluded.idempotency_key
  returning id into notification_id_value;

  -- Tipo spento nelle impostazioni (notification_preferences.push_enabled):
  -- niente campanella e niente push. Le critiche arrivano sempre.
  insert into public.notification_recipients (notification_id, user_id)
  select notification_id_value, target_user_id
  from unnest(coalesce(p_target_user_ids, array[]::uuid[])) target_user_id
  where target_user_id is not null
    and (
      coalesce(p_critical, false)
      or not exists (
        select 1 from public.notification_preferences muted
        where muted.user_id = target_user_id
          and muted.category = p_type
          and not muted.push_enabled
      )
    )
  on conflict do nothing;

  insert into public.notification_outbox (
    notification_id,
    user_id,
    subscription_id,
    idempotency_key
  )
  select
    notification_id_value,
    subscription.user_id,
    subscription.id,
    notification_id_value::text || ':' || subscription.id::text
  from public.push_subscriptions subscription
  left join public.notification_preferences preference
    on preference.user_id = subscription.user_id
   and preference.category = p_type
  where subscription.user_id = any(coalesce(p_target_user_ids, array[]::uuid[]))
    and (coalesce(p_critical, false) or coalesce(preference.push_enabled, true))
  on conflict (idempotency_key) do nothing;

  return notification_id_value;
end;
$function$;
