-- Togliere il KO dal giorno d'inizio annullava l'infortunio anche quando il
-- giocatore aveva già votato KO su un allenamento successivo: in quel caso
-- l'inizio si sposta lì.
create or replace function public.sync_injury_from_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vote public.attendance;
  event_day date;
  is_training boolean;
  open_injury public.injuries;
  next_ko_day date;
begin
  if tg_op = 'DELETE' then
    vote := old;
  else
    vote := new;
    if new.modified_by is distinct from new.profile_id then
      return null;
    end if;
  end if;

  select (e.data_ora at time zone 'Europe/Rome')::date, e.tipo = 'ALLENAMENTO'
  into event_day, is_training
  from public.events e
  where e.id = vote.event_id;
  if event_day is null then
    return null;
  end if;

  select * into open_injury
  from public.injuries
  where profile_id = vote.profile_id and ended_on is null;

  if tg_op <> 'DELETE' and is_training and new.status = 'INFORTUNATO_PRESENTE' then
    if open_injury.id is not null then
      update public.injuries
      set started_on = least(started_on, event_day)
      where id = open_injury.id;
    elsif not exists (
      select 1
      from public.injuries
      where profile_id = vote.profile_id
        and event_day between started_on and ended_on
    ) then
      insert into public.injuries (profile_id, started_on, created_by)
      values (vote.profile_id, event_day, vote.profile_id);
    end if;
    return null;
  end if;

  if open_injury.id is null then
    return null;
  end if;

  -- "Ci sono" su un evento qualsiasi: rientro dal giorno dell'evento.
  if tg_op <> 'DELETE'
     and new.status = 'PRESENTE'
     and open_injury.started_on < event_day then
    update public.injuries
    set ended_on = event_day - 1
    where id = open_injury.id;
    return null;
  end if;

  -- Tap sbagliato: via il KO dal giorno d'inizio. L'infortunio aperto da lui
  -- riparte dal prossimo allenamento votato KO, o sparisce se non ce ne sono.
  if is_training
     and tg_op <> 'INSERT'
     and old.status = 'INFORTUNATO_PRESENTE'
     and open_injury.started_on = event_day
     and open_injury.created_by = vote.profile_id
     and open_injury.note is null then
    select min((e.data_ora at time zone 'Europe/Rome')::date)
    into next_ko_day
    from public.attendance a
    join public.events e on e.id = a.event_id
    where a.profile_id = vote.profile_id
      and a.status = 'INFORTUNATO_PRESENTE'
      and e.tipo = 'ALLENAMENTO'
      and (e.data_ora at time zone 'Europe/Rome')::date > event_day;

    if next_ko_day is null then
      delete from public.injuries where id = open_injury.id;
    else
      update public.injuries
      set started_on = next_ko_day
      where id = open_injury.id;
    end if;
  end if;

  return null;
end;
$$;
