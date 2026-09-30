-- Infermeria: il KO smette di essere un voto isolato e diventa un infortunio con
-- una durata. `ended_on` null = ancora fermo.
create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  started_on date not null,
  ended_on date,
  note text,
  created_by uuid default public.current_profile_id()
    references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint injuries_period_check check (ended_on >= started_on)
);

create index injuries_profile_idx on public.injuries (profile_id, started_on);

create unique index injuries_one_open_key
  on public.injuries (profile_id)
  where ended_on is null;

alter table public.injuries enable row level security;

revoke all on public.injuries from public, anon;
grant select, insert, update, delete on public.injuries to authenticated;
grant all on public.injuries to service_role;

-- La nota è un dato sanitario: la legge solo il giocatore stesso e il manager.
create policy injuries_self_manager_select
on public.injuries for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
);

-- Il giocatore scrive solo attraverso il proprio voto (trigger più sotto).
create policy injuries_manager_write
on public.injuries for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

-- /statistiche e la pagina evento calcolano il KO con la stessa regola della
-- dashboard: questa proiezione espone le sole date agli account associati, non
-- più di quanto il voto KO sull'evento già mostri a tutti.
create view public.authenticated_injury_periods
with (security_barrier = true)
as
select
  injury.profile_id,
  injury.started_on,
  injury.ended_on
from public.injuries injury
where public.is_current_user_associated();

revoke all on public.authenticated_injury_periods
  from public, anon, authenticated;
grant select on public.authenticated_injury_periods to authenticated;

-- Voto del giocatore → infortunio. Reagisce solo al voto proprio: il check-in
-- del manager ha il suo trigger.
create function public.sync_injury_from_vote()
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

  -- Tap sbagliato: via il KO dal giorno d'inizio, via l'infortunio aperto da lui.
  if is_training
     and tg_op <> 'INSERT'
     and old.status = 'INFORTUNATO_PRESENTE'
     and open_injury.started_on = event_day
     and open_injury.created_by = vote.profile_id
     and open_injury.note is null then
    delete from public.injuries where id = open_injury.id;
  end if;

  return null;
end;
$$;

revoke all on function public.sync_injury_from_vote()
  from public, anon, authenticated;

create trigger attendance_sync_injury
after insert or update or delete on public.attendance
for each row execute function public.sync_injury_from_vote();

-- La presenza reale batte il KO e chiude l'infortunio. Se inizia quel giorno
-- resta: è chi si fa male durante l'allenamento.
create function public.close_injury_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_day date;
begin
  if new.status <> 'PRESENT' then
    return null;
  end if;

  select (e.data_ora at time zone 'Europe/Rome')::date
  into event_day
  from public.events e
  where e.id = new.event_id;

  update public.injuries
  set ended_on = event_day - 1
  where profile_id = new.profile_id
    and ended_on is null
    and started_on < event_day;

  return null;
end;
$$;

revoke all on function public.close_injury_on_checkin()
  from public, anon, authenticated;

create trigger event_checkins_close_injury
after insert or update of status on public.event_checkins
for each row execute function public.close_injury_on_checkin();

-- I KO già votati sugli allenamenti diventano infortuni di un giorno: da qui in
-- poi i periodi sono l'unica fonte del KO in Presenze.
insert into public.injuries (profile_id, started_on, ended_on, created_by)
select distinct
  a.profile_id,
  (e.data_ora at time zone 'Europe/Rome')::date,
  (e.data_ora at time zone 'Europe/Rome')::date,
  a.profile_id
from public.attendance a
join public.events e on e.id = a.event_id
where a.status = 'INFORTUNATO_PRESENTE'
  and e.tipo = 'ALLENAMENTO'
  and e.data_ora is not null;
