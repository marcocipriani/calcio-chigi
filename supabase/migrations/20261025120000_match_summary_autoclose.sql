-- Modalità partita, dopo il fischio finale.
-- - match_apply_summary: risultato, statistiche (con i minuti) e check-in in
--   un posto solo, per il fischio finale, le correzioni e la chiusura
--   automatica. Chi nel frattempo è uscito dalla rosa non blocca più il
--   salvataggio: si salta, come farebbe set_event_checkin rifiutandolo.
-- - match_update_summary: il manager corregge il riepilogo a partita chiusa.
-- - Partita ancora aperta 4 ore dopo il calcio d'inizio: chiusa dal tick del
--   Chigio d'Oro con il riepilogo calcolato dalla cronaca, che apre il voto.
-- Spec: docs/superpowers/specs/2026-10-24-modalita-partita-design.md

create or replace function private.match_apply_summary(
  p_event_id uuid,
  p_summary jsonb,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  chigi_home boolean;
  ours integer := (p_summary ->> 'gol_nostri')::integer;
  theirs integer := (p_summary ->> 'gol_avversario')::integer;
  eligible jsonb;
begin
  if ours is null or theirs is null or ours < 0 or theirs < 0 then
    raise exception 'Invalid score';
  end if;
  if jsonb_typeof(coalesce(p_summary -> 'players', '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid players';
  end if;

  select * into ev from public.events where id = p_event_id;
  -- Stessa regola della pagina evento: Chigi in casa solo se è squadra_casa.
  chigi_home := coalesce(ev.squadra_casa ilike '%chigi%', false);

  -- Solo chi può avere il check-in (stessa regola di set_event_checkin):
  -- le statistiche richiedono il presente (validate_present_match_player).
  select coalesce(jsonb_agg(to_jsonb(player)), '[]'::jsonb)
  into eligible
  from (
  select distinct on (x.profile_id)
    x.profile_id,
    greatest(coalesce(x.goals, 0), 0) as goals,
    greatest(coalesce(x.assists, 0), 0) as assists,
    greatest(coalesce(x.yellow_cards, 0), 0) as yellow_cards,
    greatest(coalesce(x.red_cards, 0), 0) as red_cards,
    greatest(coalesce(x.minutes_played, 0), 0) as minutes_played
  from jsonb_to_recordset(coalesce(p_summary -> 'players', '[]'::jsonb)) as x(
    profile_id uuid, goals integer, assists integer, yellow_cards integer,
    red_cards integer, minutes_played integer
  )
  join public.season_memberships m
    on m.profile_id = x.profile_id
   and m.season_id = ev.season_id
   and (
     m.status = 'YES'
     or (m.status = 'TRAINING_ONLY' and ev.tipo in ('ALLENAMENTO', 'AMICHEVOLE'))
   )
  where x.profile_id is not null
  ) player;

  insert into public.event_checkins (event_id, profile_id, status, checked_in_by)
  select p_event_id, profile_id, 'PRESENT', p_actor
  from jsonb_to_recordset(eligible) as x(profile_id uuid)
  on conflict (event_id, profile_id) do update
  set status = 'PRESENT',
      checked_in_by = excluded.checked_in_by;

  insert into public.attendance (event_id, profile_id, modified_by, status)
  select p_event_id, profile_id, p_actor, 'PRESENTE'
  from jsonb_to_recordset(eligible) as x(profile_id uuid)
  on conflict (event_id, profile_id) do update
  set status = 'PRESENTE',
      modified_by = excluded.modified_by;

  delete from public.match_player_stats where event_id = p_event_id;
  insert into public.match_player_stats (
    event_id, profile_id, goals, assists, yellow_cards, red_cards, minutes_played, updated_by
  )
  select p_event_id, x.profile_id, x.goals, x.assists, x.yellow_cards, x.red_cards, x.minutes_played, p_actor
  from jsonb_to_recordset(eligible) as x(
    profile_id uuid, goals integer, assists integer, yellow_cards integer,
    red_cards integer, minutes_played integer
  );

  insert into public.match_unattributed_stats (event_id, opponent_own_goals, unattributed_goals, updated_by)
  values (
    p_event_id,
    greatest(coalesce((p_summary ->> 'opponent_own_goals')::integer, 0), 0),
    greatest(coalesce((p_summary ->> 'unattributed_goals')::integer, 0), 0),
    p_actor
  )
  on conflict (event_id) do update
  set opponent_own_goals = excluded.opponent_own_goals,
      unattributed_goals = excluded.unattributed_goals,
      updated_by = excluded.updated_by,
      updated_at = now();

  -- data_fine_ora resta: cambiarla manderebbe "Evento aggiornato" a tutta la rosa.
  update public.events
  set gol_nostri = ours,
      gol_avversario = theirs,
      gol_casa = case when chigi_home then ours else theirs end,
      gol_ospite = case when chigi_home then theirs else ours end,
      giocata = true
  where id = p_event_id;
end;
$$;

create or replace function public.match_finish(p_event_id uuid, p_summary jsonb)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
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

  return session;
end;
$$;

-- Correzione del riepilogo a partita chiusa: qualunque manager, come la
-- pagina evento. La cronaca resta com'è, il punteggio della sessione segue.
create or replace function public.match_update_summary(p_event_id uuid, p_summary jsonb)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := private.match_require_manager();
  session public.match_sessions;
begin
  select * into session from public.match_sessions where event_id = p_event_id for update;
  if session.event_id is null or session.status <> 'FINISHED' then
    raise exception 'MATCH_NOT_FINISHED';
  end if;
  perform private.match_apply_summary(p_event_id, p_summary, me);
  -- Il risultato corretto vale anche per il "Finale" della diretta.
  update public.match_sessions
  set score_ours = (p_summary ->> 'gol_nostri')::integer,
      score_theirs = (p_summary ->> 'gol_avversario')::integer
  where event_id = p_event_id
  returning * into session;
  return session;
end;
$$;

-- Lo stesso riepilogo di buildSummary (src/lib/match.ts), dalla cronaca:
-- minuti sugli istanti reali dentro i due tempi, tempo aperto chiuso a p_end.
create or replace function private.match_summary_from_timeline(p_event_id uuid, p_end timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  session public.match_sessions;
  start1 timestamptz;
  end1 timestamptz;
  start2 timestamptz;
  end2 timestamptz;
  players jsonb;
begin
  select * into session from public.match_sessions where event_id = p_event_id;

  select
    min(occurred_at) filter (where kind = 'PERIOD_START' and period = 1),
    min(occurred_at) filter (where kind = 'PERIOD_END' and period = 1),
    min(occurred_at) filter (where kind = 'PERIOD_START' and period = 2),
    min(occurred_at) filter (where kind = 'PERIOD_END' and period = 2)
  into start1, end1, start2, end2
  from public.match_timeline
  where event_id = p_event_id and voided_at is null;

  with timeline as (
    select * from public.match_timeline where event_id = p_event_id and voided_at is null
  ),
  enters as (
    select (starter ->> 'profile_id')::uuid as profile_id, coalesce(start1, p_end) as at
    from jsonb_array_elements(coalesce(session.lineup -> 'starters', '[]'::jsonb)) starter
    union all
    select sub_in_profile_id, occurred_at
    from timeline
    where kind = 'SUB' and profile_id is not null and sub_in_profile_id is not null
  ),
  leaves as (
    select profile_id, occurred_at as at
    from timeline
    where kind in ('SUB', 'RED') and profile_id is not null
  ),
  stints as (
    select
      e.profile_id,
      e.at as from_at,
      coalesce((select min(l.at) from leaves l where l.profile_id = e.profile_id and l.at >= e.at), p_end) as to_at
    from enters e
  ),
  periods as (
    select start1 as from_at, coalesce(end1, p_end) as to_at where start1 is not null
    union all
    select start2, coalesce(end2, p_end) where start2 is not null
  ),
  played as (
    select
      s.profile_id,
      sum(greatest(0, extract(epoch from least(s.to_at, p.to_at) - greatest(s.from_at, p.from_at)))) as seconds
    from stints s
    left join periods p on true
    group by s.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', played.profile_id,
    'goals', (select count(*) from timeline t where t.kind = 'GOAL' and t.profile_id = played.profile_id),
    'assists', (select count(*) from timeline t where t.kind = 'GOAL' and t.assist_profile_id = played.profile_id),
    'yellow_cards', (select count(*) from timeline t where t.kind = 'YELLOW' and t.profile_id = played.profile_id),
    'red_cards', (select count(*) from timeline t where t.kind = 'RED' and t.profile_id = played.profile_id),
    'minutes_played', round(coalesce(played.seconds, 0) / 60)::integer
  )), '[]'::jsonb)
  into players
  from played;

  return (
    select jsonb_build_object(
      'gol_nostri', count(*) filter (where kind in ('GOAL', 'OWN_GOAL_FOR', 'UNATTRIBUTED_GOAL')),
      'gol_avversario', count(*) filter (where kind = 'GOAL_AGAINST'),
      'opponent_own_goals', count(*) filter (where kind = 'OWN_GOAL_FOR'),
      'unattributed_goals', count(*) filter (where kind = 'UNATTRIBUTED_GOAL'),
      'players', players
    )
    from public.match_timeline
    where event_id = p_event_id and voided_at is null
  );
end;
$$;

-- Partite ancora aperte 4 ore dopo il calcio d'inizio: nessuno ha fischiato
-- la fine. Il tempo in corso finisce alla sua durata (con il recupero
-- annunciato), non all'ora della chiusura automatica.
create or replace function private.match_auto_close_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function private.chigio_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ponytail: solo partite finite dopo il rilascio, niente raffica sulle vecchie.
  release_cutoff constant timestamptz := '2026-10-22 22:30:00+00';
  ev public.events;
  manager_users uuid[];
  poll_row record;
begin
  -- Prima le partite dimenticate aperte: chiuse, aprono il Chigio in questo giro.
  perform private.match_auto_close_stale();

  -- Nostre partite e amichevoli non annullate, finite dopo il rilascio.
  for ev in
    select e.*
    from public.events e
    where e.tipo in ('PARTITA', 'AMICHEVOLE')
      and not e.cancellato
      and e.data_ora is not null
      and (e.tipo = 'AMICHEVOLE' or e.squadra_casa ilike '%chigi%' or e.squadra_ospite ilike '%chigi%'
           or (e.squadra_casa is null and e.squadra_ospite is null))
      and public.chigio_match_end(e) >= release_cutoff
      and public.chigio_match_end(e) - interval '15 minutes' <= now()
      and public.chigio_match_end(e) + interval '48 hours' > now()
      and not exists (select 1 from public.chigio_polls p where p.event_id = e.id)
      -- Modalità partita in corso: si aspetta il fischio finale, anche oltre l'orario previsto.
      and not exists (
        select 1 from public.match_sessions s where s.event_id = e.id and s.status <> 'FINISHED'
      )
  loop
    if now() < public.chigio_match_end(ev) then
      -- Promemoria check-in ai manager, una volta sola, se nessuno è ancora segnato presente.
      if not exists (
        select 1 from public.event_checkins c where c.event_id = ev.id and c.status = 'PRESENT'
      ) then
        select array_agg(user_id) into manager_users
        from public.profiles
        where is_manager and user_id is not null and deleted_at is null;

        perform public.create_notification(
          'CHIGIO_DORO_CHECKIN_REMINDER',
          'Check-in di ' || private.chigio_event_label(ev),
          'Fai il check-in: serve per aprire il Chigio d''Oro.',
          '/evento/' || ev.id::text,
          manager_users,
          false,
          'chigio-checkin-reminder:' || ev.id::text
        );
      end if;
      continue;
    end if;

    perform private.chigio_open(ev);
  end loop;

  for poll_row in
    select event_id from public.chigio_polls where closed_at is null and closes_at <= now()
  loop
    perform private.chigio_close(poll_row.event_id, 'TIMEOUT');
  end loop;
end;
$$;

revoke all on function private.match_apply_summary(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.match_summary_from_timeline(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.match_auto_close_stale() from public, anon, authenticated;
revoke execute on function public.match_update_summary(uuid, jsonb) from public, anon;
grant execute on function public.match_update_summary(uuid, jsonb) to authenticated, service_role;
