-- Modalità partita: un manager in panchina registra la gara dal vivo (timer,
-- goal, assist, cartellini, cambi); chiunque segue la diretta dalla pagina
-- evento. Spec: docs/superpowers/specs/2026-10-24-modalita-partita-design.md

create table public.match_sessions (
  event_id             uuid primary key references public.events(id) on delete cascade,
  status               text not null default 'FIRST_HALF'
    check (status in ('FIRST_HALF', 'HALFTIME', 'SECOND_HALF', 'FINISHED')),
  period_minutes       integer not null default 35 check (period_minutes between 10 and 60),
  period_started_at    timestamptz not null default now(),
  added_minutes        integer not null default 0 check (added_minutes between 0 and 15),
  timeout_used         boolean not null default false,
  lineup               jsonb not null,
  score_ours           integer not null default 0,
  score_theirs         integer not null default 0,
  operator_profile_id  uuid references public.profiles(id) on delete set null,
  operator_since       timestamptz not null default now(),
  finished_at          timestamptz,
  created_at           timestamptz not null default now()
);

create table public.match_timeline (
  id                 uuid primary key,
  event_id           uuid not null references public.match_sessions(event_id) on delete cascade,
  kind               text not null check (kind in (
    'PERIOD_START', 'PERIOD_END', 'GOAL', 'OWN_GOAL_FOR', 'UNATTRIBUTED_GOAL',
    'GOAL_AGAINST', 'YELLOW', 'RED', 'SUB'
  )),
  period             smallint not null check (period in (1, 2)),
  minute             smallint not null check (minute between 0 and 200),
  stoppage           smallint not null default 0 check (stoppage between 0 and 60),
  occurred_at        timestamptz not null,
  profile_id         uuid references public.profiles(id) on delete set null,
  assist_profile_id  uuid references public.profiles(id) on delete set null,
  sub_in_profile_id  uuid references public.profiles(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  voided_at          timestamptz,
  created_at         timestamptz not null default now()
);

create index match_timeline_event_idx on public.match_timeline (event_id, occurred_at);

alter table public.match_player_stats
  add column if not exists minutes_played integer check (minutes_played >= 0);

-- Lettura pubblica come events: la diretta si segue anche senza accesso.
-- Si scrive solo dalle RPC qui sotto.
alter table public.match_sessions enable row level security;
alter table public.match_timeline enable row level security;
create policy match_sessions_read on public.match_sessions for select to anon, authenticated using (true);
create policy match_timeline_read on public.match_timeline for select to anon, authenticated using (true);
revoke all on public.match_sessions, public.match_timeline from anon, authenticated;
grant select on public.match_sessions, public.match_timeline to anon, authenticated;
grant all on public.match_sessions, public.match_timeline to service_role;

alter publication supabase_realtime add table public.match_sessions, public.match_timeline;

create view public.public_match_sessions
with (security_barrier = true)
as
select s.*, p.nome as operator_nome, p.cognome as operator_cognome
from public.match_sessions s
left join public.profiles p on p.id = s.operator_profile_id;

create view public.public_match_timeline
with (security_barrier = true)
as
select
  t.*,
  player.cognome as player_cognome,
  assist.cognome as assist_cognome,
  sub_in.cognome as sub_in_cognome
from public.match_timeline t
left join public.profiles player on player.id = t.profile_id
left join public.profiles assist on assist.id = t.assist_profile_id
left join public.profiles sub_in on sub_in.id = t.sub_in_profile_id
where t.voided_at is null;

revoke all on public.public_match_sessions, public.public_match_timeline from anon, authenticated;
grant select on public.public_match_sessions, public.public_match_timeline to anon, authenticated;

-- ─── Helper ──────────────────────────────────────────────────────────────────

create or replace function private.match_require_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  return public.current_profile_id();
end;
$$;

-- Sessione bloccata per l'aggiornamento; solo il segnapunti corrente.
create or replace function private.match_operator_session(p_event_id uuid)
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
  if session.event_id is null then
    raise exception 'MATCH_NOT_STARTED';
  end if;
  if session.status = 'FINISHED' then
    raise exception 'MATCH_FINISHED';
  end if;
  if session.operator_profile_id is distinct from me then
    raise exception 'MATCH_CONTROL_LOST' using errcode = '42501';
  end if;
  return session;
end;
$$;

create or replace function private.match_recount(p_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_sessions s
  set score_ours = counts.ours,
      score_theirs = counts.theirs
  from (
    select
      count(*) filter (where kind in ('GOAL', 'OWN_GOAL_FOR', 'UNATTRIBUTED_GOAL'))::integer as ours,
      count(*) filter (where kind = 'GOAL_AGAINST')::integer as theirs
    from public.match_timeline
    where event_id = p_event_id and voided_at is null
  ) counts
  where s.event_id = p_event_id;
$$;

revoke all on function private.match_require_manager() from public, anon, authenticated;
revoke all on function private.match_operator_session(uuid) from public, anon, authenticated;
revoke all on function private.match_recount(uuid) from public, anon, authenticated;

-- ─── RPC ─────────────────────────────────────────────────────────────────────

create or replace function public.match_start(
  p_event_id uuid,
  p_period_minutes integer,
  p_lineup jsonb
)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
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

  return session;
end;
$$;

create or replace function public.match_take_control(p_event_id uuid)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := private.match_require_manager();
  session public.match_sessions;
begin
  update public.match_sessions
  set operator_profile_id = me,
      operator_since = now()
  where event_id = p_event_id
    and status <> 'FINISHED'
  returning * into session;
  if session.event_id is null then
    raise exception 'MATCH_NOT_STARTED';
  end if;
  return session;
end;
$$;

create or replace function public.match_advance_period(p_event_id uuid)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.match_sessions := private.match_operator_session(p_event_id);
  me uuid := public.current_profile_id();
begin
  if session.status = 'FIRST_HALF' then
    insert into public.match_timeline (id, event_id, kind, period, minute, stoppage, occurred_at, created_by)
    values (
      gen_random_uuid(), p_event_id, 'PERIOD_END', 1, session.period_minutes,
      greatest(0, ceil(extract(epoch from now() - session.period_started_at) / 60)::integer - session.period_minutes),
      now(), me
    );
    update public.match_sessions
    set status = 'HALFTIME', period_started_at = now(), added_minutes = 0, timeout_used = false
    where event_id = p_event_id
    returning * into session;
  elsif session.status = 'HALFTIME' then
    insert into public.match_timeline (id, event_id, kind, period, minute, occurred_at, created_by)
    values (gen_random_uuid(), p_event_id, 'PERIOD_START', 2, session.period_minutes, now(), me);
    update public.match_sessions
    set status = 'SECOND_HALF', period_started_at = now(), added_minutes = 0, timeout_used = false
    where event_id = p_event_id
    returning * into session;
  else
    raise exception 'Use match_finish to end the second half';
  end if;
  return session;
end;
$$;

create or replace function public.match_update_clock(
  p_event_id uuid,
  p_added_minutes integer,
  p_timeout_used boolean,
  p_start_shift_seconds integer
)
returns public.match_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.match_sessions := private.match_operator_session(p_event_id);
begin
  if abs(coalesce(p_start_shift_seconds, 0)) > 600 then
    raise exception 'Shift must be within 10 minutes';
  end if;
  update public.match_sessions
  set added_minutes = coalesce(p_added_minutes, added_minutes),
      timeout_used = coalesce(p_timeout_used, timeout_used),
      period_started_at = period_started_at
        + make_interval(secs => coalesce(p_start_shift_seconds, 0))
  where event_id = p_event_id
  returning * into session;
  return session;
end;
$$;

create or replace function public.match_record(
  p_id uuid,
  p_event_id uuid,
  p_kind text,
  p_period integer,
  p_minute integer,
  p_stoppage integer,
  p_occurred_at timestamptz,
  p_profile_id uuid,
  p_assist_profile_id uuid,
  p_sub_in_profile_id uuid
)
returns public.match_timeline
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := private.match_require_manager();
  session public.match_sessions;
  entry public.match_timeline;
  ev public.events;
  chigi_home boolean;
  opponent text;
  label text;
  body text;
  target_users uuid[];
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
  if session.status = 'FINISHED' and p_occurred_at > coalesce(session.finished_at, now()) then
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
    chigi_home := coalesce(ev.squadra_casa ilike '%chigi%', false);
    opponent := coalesce(ev.avversario, case when chigi_home then ev.squadra_ospite else ev.squadra_casa end, 'Avversario');
    label := p_minute::text || case when coalesce(p_stoppage, 0) > 0 then '+' || p_stoppage::text else '' end || '''';
    body := case p_kind
      when 'GOAL' then
        'Goal Chigi! ' || (select cognome from public.profiles where id = p_profile_id) || ' ' || label
        || coalesce(' (assist ' || (select cognome from public.profiles where id = p_assist_profile_id) || ')', '')
      when 'OWN_GOAL_FOR' then 'Goal Chigi! Autogol avversario ' || label
      when 'UNATTRIBUTED_GOAL' then 'Goal Chigi! ' || label
      else 'Goal ' || opponent || ' ' || label
    end || ' · ' || session.score_ours || '-' || session.score_theirs;

    select array_agg(distinct p.user_id) into target_users
    from public.profiles p
    join public.season_memberships m on m.profile_id = p.id
    where m.season_id = ev.season_id
      and m.status <> 'NO'
      and p.user_id is not null;

    perform public.create_notification(
      'MATCH_GOAL',
      'Chigi ' || session.score_ours || '-' || session.score_theirs || ' ' || opponent,
      body,
      '/evento/' || p_event_id::text,
      target_users,
      false,
      'match-goal:' || p_id::text,
      me
    );
  end if;

  return entry;
end;
$$;

create or replace function public.match_void(p_event_id uuid, p_timeline_id uuid)
returns public.match_timeline
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.match_sessions := private.match_operator_session(p_event_id);
  entry public.match_timeline;
begin
  update public.match_timeline
  set voided_at = now()
  where id = p_timeline_id
    and event_id = session.event_id
    and voided_at is null
    and kind not in ('PERIOD_START', 'PERIOD_END')
  returning * into entry;
  if entry.id is null then
    raise exception 'Event not found';
  end if;
  perform private.match_recount(p_event_id);
  return entry;
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
  ev public.events;
  chigi_home boolean;
  ours integer := (p_summary ->> 'gol_nostri')::integer;
  theirs integer := (p_summary ->> 'gol_avversario')::integer;
  player record;
begin
  if session.status <> 'SECOND_HALF' then
    raise exception 'The match can end only during the second half';
  end if;
  if ours is null or theirs is null or ours < 0 or theirs < 0 then
    raise exception 'Invalid score';
  end if;
  if jsonb_typeof(coalesce(p_summary -> 'players', '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid players';
  end if;

  select * into ev from public.events where id = p_event_id;
  -- Stessa regola della pagina evento: Chigi in casa solo se è squadra_casa.
  chigi_home := coalesce(ev.squadra_casa ilike '%chigi%', false);

  -- Le statistiche richiedono il check-in presente (validate_present_match_player).
  for player in
    select * from jsonb_to_recordset(coalesce(p_summary -> 'players', '[]'::jsonb)) as x(
      profile_id uuid, goals integer, assists integer, yellow_cards integer,
      red_cards integer, minutes_played integer
    )
  loop
    perform public.set_event_checkin(p_event_id, player.profile_id, 'PRESENT');
  end loop;

  delete from public.match_player_stats where event_id = p_event_id;
  insert into public.match_player_stats (
    event_id, profile_id, goals, assists, yellow_cards, red_cards, minutes_played, updated_by
  )
  select
    p_event_id, x.profile_id,
    greatest(coalesce(x.goals, 0), 0), greatest(coalesce(x.assists, 0), 0),
    greatest(coalesce(x.yellow_cards, 0), 0), greatest(coalesce(x.red_cards, 0), 0),
    greatest(coalesce(x.minutes_played, 0), 0), me
  from jsonb_to_recordset(coalesce(p_summary -> 'players', '[]'::jsonb)) as x(
    profile_id uuid, goals integer, assists integer, yellow_cards integer,
    red_cards integer, minutes_played integer
  );

  insert into public.match_unattributed_stats (event_id, opponent_own_goals, unattributed_goals, updated_by)
  values (
    p_event_id,
    greatest(coalesce((p_summary ->> 'opponent_own_goals')::integer, 0), 0),
    greatest(coalesce((p_summary ->> 'unattributed_goals')::integer, 0), 0),
    me
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

revoke execute on function public.match_start(uuid, integer, jsonb) from public, anon;
revoke execute on function public.match_take_control(uuid) from public, anon;
revoke execute on function public.match_advance_period(uuid) from public, anon;
revoke execute on function public.match_update_clock(uuid, integer, boolean, integer) from public, anon;
revoke execute on function public.match_record(uuid, uuid, text, integer, integer, integer, timestamptz, uuid, uuid, uuid) from public, anon;
revoke execute on function public.match_void(uuid, uuid) from public, anon;
revoke execute on function public.match_finish(uuid, jsonb) from public, anon;
grant execute on function public.match_start(uuid, integer, jsonb) to authenticated, service_role;
grant execute on function public.match_take_control(uuid) to authenticated, service_role;
grant execute on function public.match_advance_period(uuid) to authenticated, service_role;
grant execute on function public.match_update_clock(uuid, integer, boolean, integer) to authenticated, service_role;
grant execute on function public.match_record(uuid, uuid, text, integer, integer, integer, timestamptz, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.match_void(uuid, uuid) to authenticated, service_role;
grant execute on function public.match_finish(uuid, jsonb) to authenticated, service_role;

-- ─── Chigio d'Oro ────────────────────────────────────────────────────────────

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