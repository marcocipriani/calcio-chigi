-- Votabili = check-in PRESENT (staff escluso), senza richiedere la formazione
-- pubblicata: il check-in del manager dice già chi ha giocato.
-- Votanti = disponibilità Ci sono/Spettatore anche senza account: chi si registra
-- prima della chiusura può votare.
-- Apertura estratta in private.chigio_open per riusarla nel job una tantum
-- della partita con Palazzo Madama (22/10), finita prima del cutoff.

create or replace function private.chigio_open(p_event public.events)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  voters integer;
  voter_users uuid[];
begin
  if exists (select 1 from public.chigio_polls where event_id = p_event.id) then
    return false;
  end if;

  if not exists (
    select 1
    from public.event_checkins c
    join public.profiles p on p.id = c.profile_id
    where c.event_id = p_event.id and c.status = 'PRESENT'
      and not p.is_staff and p.deleted_at is null
  ) then
    return false;
  end if;

  -- Anche chi non ha ancora l'account: se si registra prima della chiusura vota.
  select count(*)::int, array_agg(p.user_id) filter (where p.user_id is not null)
  into voters, voter_users
  from public.attendance a
  join public.profiles p on p.id = a.profile_id
  where a.event_id = p_event.id
    and a.status in ('PRESENTE', 'INFORTUNATO_PRESENTE')
    and p.deleted_at is null;

  if voters = 0 then
    return false;
  end if;

  insert into public.chigio_polls (event_id, closes_at, voters_total)
  values (p_event.id, now() + interval '24 hours', voters);

  insert into public.chigio_poll_candidates (event_id, profile_id)
  select p_event.id, c.profile_id
  from public.event_checkins c
  join public.profiles p on p.id = c.profile_id
  where c.event_id = p_event.id and c.status = 'PRESENT'
    and not p.is_staff and p.deleted_at is null;

  insert into public.chigio_poll_voters (event_id, profile_id)
  select p_event.id, a.profile_id
  from public.attendance a
  join public.profiles p on p.id = a.profile_id
  where a.event_id = p_event.id
    and a.status in ('PRESENTE', 'INFORTUNATO_PRESENTE')
    and p.deleted_at is null;

  perform public.create_notification(
    'CHIGIO_DORO_OPEN',
    '🏆 Chigio d''Oro aperto',
    'Vota er mejo di ' || private.chigio_event_label(p_event) || ' entro '
      || to_char((now() + interval '24 hours') at time zone 'Europe/Rome', 'DD/MM HH24:MI') || '.',
    '/evento/' || p_event.id::text,
    voter_users,
    false,
    'chigio-open:' || p_event.id::text
  );
  return true;
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

    perform private.chigio_open(ev);
  end loop;

  for poll_row in
    select event_id from public.chigio_polls where closed_at is null and closes_at <= now()
  loop
    perform private.chigio_close(poll_row.event_id, 'TIMEOUT');
  end loop;
end;
$$;

revoke all on function private.chigio_open(public.events) from public, anon, authenticated;

-- Una tantum: Palazzo Madama (22/10) apre venerdì 23/10 alle 8:00 Roma (06:00 UTC),
-- poi il job si cancella. Sugli altri ambienti l'evento non esiste e non fa nulla.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'chigio-madama-open' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'chigio-madama-open',
    '0 6 23 10 *',
    $job$select private.chigio_open(e) from public.events e where e.id = 'c230e7a3-c0b4-4f1c-8d56-d6c5c4bd90b1'; select cron.unschedule('chigio-madama-open');$job$
  );
end;
$$;
