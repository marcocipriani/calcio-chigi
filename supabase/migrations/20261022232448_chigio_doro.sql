-- Chigio d'Oro: votazione interna del migliore in campo (spec 2026-10-23).
-- Voto = 1 🔝 obbligatorio + fino a 2 👏. Vince chi ha più 🔝, poi più 👏, poi ex aequo.
-- Anonimato: le schede sono leggibili solo dal votante; all'esterno escono solo
-- i conteggi aggregati, scritti in chigio_results alla chiusura.

create table if not exists public.chigio_polls (
  event_id      uuid primary key references public.events(id) on delete cascade,
  opened_at     timestamptz not null default now(),
  closes_at     timestamptz not null,
  closed_at     timestamptz,
  closed_reason text check (closed_reason in ('TIMEOUT', 'ALL_VOTED', 'MANAGER')),
  voters_total  integer not null check (voters_total > 0),
  ballots_count integer not null default 0,
  check ((closed_at is null) = (closed_reason is null))
);

-- Snapshot all'apertura: chi può votare e chi può essere votato.
create table if not exists public.chigio_poll_voters (
  event_id   uuid not null references public.chigio_polls(event_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

create table if not exists public.chigio_poll_candidates (
  event_id   uuid not null references public.chigio_polls(event_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

create table if not exists public.chigio_ballots (
  event_id         uuid not null references public.chigio_polls(event_id) on delete cascade,
  voter_profile_id uuid not null references public.profiles(id) on delete cascade,
  top_profile_id   uuid not null references public.profiles(id) on delete cascade,
  applause_1       uuid references public.profiles(id) on delete set null,
  applause_2       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (event_id, voter_profile_id)
);

create table if not exists public.chigio_results (
  event_id   uuid not null references public.chigio_polls(event_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tops       integer not null default 0,
  applause   integer not null default 0,
  rank       integer not null,
  is_winner  boolean not null default false,
  primary key (event_id, profile_id)
);

alter table public.chigio_polls enable row level security;
alter table public.chigio_poll_voters enable row level security;
alter table public.chigio_poll_candidates enable row level security;
alter table public.chigio_ballots enable row level security;
alter table public.chigio_results enable row level security;

-- Solo lettura dal client: le scritture passano dalle RPC security definer.
revoke all on public.chigio_polls, public.chigio_poll_voters, public.chigio_poll_candidates,
  public.chigio_ballots, public.chigio_results from anon, authenticated;
grant select on public.chigio_polls, public.chigio_poll_voters, public.chigio_poll_candidates,
  public.chigio_ballots, public.chigio_results to authenticated;

create policy chigio_polls_associated_select on public.chigio_polls
for select to authenticated using (public.is_current_user_associated());

create policy chigio_candidates_associated_select on public.chigio_poll_candidates
for select to authenticated using (public.is_current_user_associated());

-- Il votante vede solo la propria riga (per sapere se può votare).
create policy chigio_voters_own_select on public.chigio_poll_voters
for select to authenticated using (profile_id = public.current_profile_id());

-- Nessuna policy per i manager: nemmeno loro leggono le schede altrui.
create policy chigio_ballots_own_select on public.chigio_ballots
for select to authenticated using (voter_profile_id = public.current_profile_id());

create policy chigio_results_associated_select on public.chigio_results
for select to authenticated using (public.is_current_user_associated());

-- Fine partita: data_fine_ora, altrimenti inizio + 2h (le partite Enjore non hanno la fine).
create or replace function public.chigio_match_end(p_event public.events)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select coalesce(p_event.data_fine_ora, p_event.data_ora + interval '2 hours');
$$;

create or replace function private.chigio_event_label(p_event public.events)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case
      when p_event.squadra_casa ilike '%chigi%' then p_event.squadra_ospite
      when p_event.squadra_ospite ilike '%chigi%' then p_event.squadra_casa
    end,
    p_event.avversario,
    'la partita'
  );
$$;

create or replace function private.chigio_close(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  poll public.chigio_polls;
  event_row public.events;
  winner_names text;
  voter_users uuid[];
begin
  select * into poll from public.chigio_polls where event_id = p_event_id for update;
  if poll.event_id is null or poll.closed_at is not null then
    return;
  end if;

  update public.chigio_polls
  set closed_at = now(), closed_reason = p_reason
  where event_id = p_event_id;

  insert into public.chigio_results (event_id, profile_id, tops, applause, rank)
  select p_event_id, t.profile_id, t.tops, t.applause,
         rank() over (order by t.tops desc, t.applause desc)
  from (
    select v.profile_id,
           count(*) filter (where v.kind = 'top')::int as tops,
           count(*) filter (where v.kind = 'applause')::int as applause
    from (
      select top_profile_id as profile_id, 'top' as kind from public.chigio_ballots where event_id = p_event_id
      union all
      select applause_1, 'applause' from public.chigio_ballots where event_id = p_event_id and applause_1 is not null
      union all
      select applause_2, 'applause' from public.chigio_ballots where event_id = p_event_id and applause_2 is not null
    ) v
    group by v.profile_id
  ) t;

  -- Chi ha 0 🔝 non vince.
  update public.chigio_results
  set is_winner = true
  where event_id = p_event_id and rank = 1 and tops > 0;

  select string_agg(p.nome || ' ' || p.cognome, ' e ' order by p.cognome)
  into winner_names
  from public.chigio_results r
  join public.profiles p on p.id = r.profile_id
  where r.event_id = p_event_id and r.is_winner;

  if winner_names is null then
    return;
  end if;

  select * into event_row from public.events where id = p_event_id;
  select array_agg(p.user_id) filter (where p.user_id is not null)
  into voter_users
  from public.chigio_poll_voters v
  join public.profiles p on p.id = v.profile_id
  where v.event_id = p_event_id;

  perform public.create_notification(
    'CHIGIO_DORO_CLOSED',
    '🏆 Chigio d''Oro a ' || winner_names || '!',
    'Votazione chiusa per ' || private.chigio_event_label(event_row) || ': guarda il podio.',
    '/evento/' || p_event_id::text,
    voter_users,
    false,
    'chigio-closed:' || p_event_id::text
  );
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
  voter_users uuid[];
  voters integer;
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

    -- Apertura: servono convocati con check-in presente e almeno un votante.
    if not exists (
      select 1
      from public.official_formations f
      join public.official_formation_players fp on fp.formation_id = f.id
      join public.event_checkins c
        on c.event_id = f.event_id and c.profile_id = fp.profile_id and c.status = 'PRESENT'
      where f.event_id = ev.id and f.status = 'PUBLISHED'
    ) then
      continue;
    end if;

    select count(*)::int, array_agg(p.user_id)
    into voters, voter_users
    from public.attendance a
    join public.profiles p on p.id = a.profile_id
    where a.event_id = ev.id
      and a.status in ('PRESENTE', 'INFORTUNATO_PRESENTE')
      and p.user_id is not null
      and p.deleted_at is null;

    if voters = 0 then
      continue;
    end if;

    insert into public.chigio_polls (event_id, closes_at, voters_total)
    values (ev.id, now() + interval '24 hours', voters);

    insert into public.chigio_poll_candidates (event_id, profile_id)
    select distinct ev.id, fp.profile_id
    from public.official_formations f
    join public.official_formation_players fp on fp.formation_id = f.id
    join public.event_checkins c
      on c.event_id = f.event_id and c.profile_id = fp.profile_id and c.status = 'PRESENT'
    where f.event_id = ev.id and f.status = 'PUBLISHED';

    insert into public.chigio_poll_voters (event_id, profile_id)
    select ev.id, a.profile_id
    from public.attendance a
    join public.profiles p on p.id = a.profile_id
    where a.event_id = ev.id
      and a.status in ('PRESENTE', 'INFORTUNATO_PRESENTE')
      and p.user_id is not null
      and p.deleted_at is null;

    perform public.create_notification(
      'CHIGIO_DORO_OPEN',
      '🏆 Chigio d''Oro aperto',
      'Vota er mejo di ' || private.chigio_event_label(ev) || ' entro '
        || to_char((now() + interval '24 hours') at time zone 'Europe/Rome', 'DD/MM HH24:MI') || '.',
      '/evento/' || ev.id::text,
      voter_users,
      false,
      'chigio-open:' || ev.id::text
    );
  end loop;

  for poll_row in
    select event_id from public.chigio_polls where closed_at is null and closes_at <= now()
  loop
    perform private.chigio_close(poll_row.event_id, 'TIMEOUT');
  end loop;
end;
$$;

create or replace function public.submit_chigio_vote(
  p_event_id uuid,
  p_top_profile_id uuid,
  p_applause_profile_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_profile_id();
  poll public.chigio_polls;
  applause uuid[] := coalesce(p_applause_profile_ids, '{}');
  inserted boolean;
begin
  if me is null then
    raise exception 'Associated profile required' using errcode = '42501';
  end if;

  select * into poll from public.chigio_polls where event_id = p_event_id for update;
  if poll.event_id is null or poll.closed_at is not null or poll.closes_at <= now() then
    raise exception 'Votazione chiusa' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.chigio_poll_voters where event_id = p_event_id and profile_id = me) then
    raise exception 'Non puoi votare per questa partita' using errcode = '42501';
  end if;

  if p_top_profile_id is null
     or cardinality(applause) > 2
     or array_position(applause, null) is not null
     or (select count(distinct x) from unnest(applause || p_top_profile_id) x) <> cardinality(applause) + 1
     or me = any(applause || p_top_profile_id)
     or exists (
       select 1 from unnest(applause || p_top_profile_id) x
       where not exists (
         select 1 from public.chigio_poll_candidates c where c.event_id = p_event_id and c.profile_id = x
       )
     ) then
    raise exception 'Voto non valido' using errcode = '22023';
  end if;

  insert into public.chigio_ballots (event_id, voter_profile_id, top_profile_id, applause_1, applause_2)
  values (p_event_id, me, p_top_profile_id, applause[1], applause[2])
  on conflict (event_id, voter_profile_id) do update
  set top_profile_id = excluded.top_profile_id,
      applause_1 = excluded.applause_1,
      applause_2 = excluded.applause_2,
      updated_at = now()
  returning (xmax = 0) into inserted;

  if inserted then
    update public.chigio_polls set ballots_count = ballots_count + 1
    where event_id = p_event_id
    returning * into poll;

    if poll.ballots_count >= poll.voters_total then
      perform private.chigio_close(p_event_id, 'ALL_VOTED');
    end if;
  end if;
end;
$$;

create or replace function public.close_chigio_poll(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  perform private.chigio_close(p_event_id, 'MANAGER');
end;
$$;

-- Classifica di stagione: solo votazioni chiuse di eventi non annullati.
create or replace view public.chigio_season_stats
with (security_invoker = true) as
select e.season_id,
       e.tipo,
       r.profile_id,
       count(*) filter (where r.is_winner)::int as wins,
       sum(r.tops)::int as tops,
       sum(r.applause)::int as applause
from public.chigio_results r
join public.chigio_polls p on p.event_id = r.event_id and p.closed_at is not null
join public.events e on e.id = r.event_id and not e.cancellato
group by e.season_id, e.tipo, r.profile_id;

revoke all on public.chigio_season_stats from anon, authenticated;
grant select on public.chigio_season_stats to authenticated;

revoke all on function public.chigio_match_end(public.events) from public, anon;
revoke all on function private.chigio_event_label(public.events) from public, anon, authenticated;
revoke all on function private.chigio_close(uuid, text) from public, anon, authenticated;
revoke all on function private.chigio_tick() from public, anon, authenticated;
revoke all on function public.submit_chigio_vote(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.close_chigio_poll(uuid) from public, anon;
grant execute on function public.submit_chigio_vote(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.close_chigio_poll(uuid) to authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'chigio-doro-tick' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule('chigio-doro-tick', '*/5 * * * *', 'select private.chigio_tick();');
end;
$$;
