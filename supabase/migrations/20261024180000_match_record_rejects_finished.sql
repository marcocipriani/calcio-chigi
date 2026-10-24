-- Modalità partita: a partita chiusa match_record rifiuta tutto, anche gli
-- eventi avvenuti prima del fischio finale. match_finish ha già scritto
-- statistiche e risultato: accettarli li mostrerebbe in cronaca senza contarli.
-- Il telefono li toglie dalla coda e avvisa ("eventi non registrati").

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
