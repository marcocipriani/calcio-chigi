begin;

-- Prima "solo allenamenti" era un checkbox indipendente dallo status
-- (YES/NO), quindi combinabile a piacere. In pratica significava sempre
-- "in rosa ma non selezionabile per formazione/maglie": ora è lo status
-- stesso a dirlo, ed è mutuamente esclusivo con "in rosa" e "archiviato".
-- Un archiviato è sparito; chi si allena soltanto resta un giocatore a
-- tutti gli effetti (ruolo, presenze) ma senza tesseramento/numero.

alter table public.season_memberships
  disable trigger trg_guard_membership_passport_photo;

update public.season_memberships
set status = 'TRAINING_ONLY'
where training_only = true
  and status = 'YES';

alter table public.season_memberships
  enable trigger trg_guard_membership_passport_photo;

-- Formazione ufficiale/playground: solo chi è davvero in rosa.
-- Drop+create perché la colonna training_only sparisce dall'elenco: "or
-- replace" non ammette di togliere colonne da una vista esistente.
drop view if exists public.public_active_roster;

create view public.public_active_roster
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url,
  m.category,
  m.role,
  m.staff_function,
  m.jersey_number,
  m.status,
  s.slug as season_slug,
  case
    when p.data_nascita is null
      or p.data_nascita > (now() at time zone 'Europe/Rome')::date then false
    else date_part(
      'year',
      age((now() at time zone 'Europe/Rome')::date, p.data_nascita)
    ) < 35
  end as is_u35
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status = 'YES';

revoke all on public.public_active_roster from public;
grant select on public.public_active_roster to anon, authenticated;

-- Tabellone numeri di maglia: idem, solo chi è in rosa.
create or replace view public.jersey_preference_board
with (security_barrier = true)
as
select
  membership.season_id,
  membership.id as membership_id,
  profile.id as profile_id,
  profile.nome,
  profile.cognome,
  profile.avatar_url,
  membership.role,
  membership.jersey_number,
  previous.jersey_number as previous_jersey_number,
  preference.choices,
  coalesce(preference.no_preference, false) as no_preference,
  preference.updated_at,
  coalesce(preference.updated_by <> membership.profile_id, false)
    as updated_by_manager
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
join public.seasons season on season.id = membership.season_id
left join public.jersey_preferences preference
  on preference.membership_id = membership.id
left join lateral (
  select previous_membership.jersey_number
  from public.season_memberships previous_membership
  join public.seasons previous_season
    on previous_season.id = previous_membership.season_id
  where previous_membership.profile_id = membership.profile_id
    and previous_season.ends_on < season.starts_on
    and previous_membership.jersey_number is not null
  order by previous_season.starts_on desc
  limit 1
) previous on true
where public.is_current_user_associated()
  and membership.category = 'PLAYER'
  and membership.status = 'YES';

-- Elenco evento (check-in): chi è in rosa sempre, chi si allena soltanto
-- solo per gli allenamenti. Filtro già di per sé precisino: la UI lo
-- affina ulteriormente (niente staff tra i selezionabili).
-- Cambia l'elenco delle colonne restituite (via training_only): serve
-- droppare prima, "create or replace" non può cambiare il return type.
drop function if exists public.get_event_roster(uuid);

create function public.get_event_roster(p_event_id uuid)
returns table (
  profile_id uuid,
  nome text,
  cognome text,
  avatar_url text,
  data_nascita date,
  category public.membership_category,
  role text,
  staff_function text,
  jersey_number integer,
  status public.membership_status,
  department text,
  is_external boolean,
  is_aggregated boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_current_user_associated() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.nome,
    profile.cognome,
    profile.avatar_url,
    profile.data_nascita,
    membership.category,
    membership.role,
    membership.staff_function,
    membership.jersey_number,
    membership.status,
    membership.department,
    membership.is_external,
    membership.is_aggregated
  from public.events event
  join public.season_memberships membership
    on membership.season_id = event.season_id
  join public.profiles profile
    on profile.id = membership.profile_id
  where event.id = p_event_id
    and (
      membership.status = 'YES'
      or (membership.status = 'TRAINING_ONLY' and event.tipo = 'ALLENAMENTO')
    )
  order by profile.cognome, profile.nome;
end;
$$;

revoke all on function public.get_event_roster(uuid) from public, anon;
grant execute on function public.get_event_roster(uuid)
  to authenticated, service_role;

-- Check-in manager: stesso criterio della roster, verificato lato server.
create or replace function public.set_event_checkin(
  p_event_id uuid,
  p_profile_id uuid,
  p_status public.event_checkin_status
)
returns public.event_checkins
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid;
  result public.event_checkins;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  actor := public.current_profile_id();

  if not exists (
    select 1
    from public.events e
    join public.season_memberships m
      on m.season_id = e.season_id
     and m.profile_id = p_profile_id
     and (
       m.status = 'YES'
       or (m.status = 'TRAINING_ONLY' and e.tipo = 'ALLENAMENTO')
     )
    where e.id = p_event_id
  ) then
    raise exception 'Profile is not in the event season roster';
  end if;

  insert into public.event_checkins (
    event_id,
    profile_id,
    status,
    checked_in_by
  )
  values (p_event_id, p_profile_id, p_status, actor)
  on conflict (event_id, profile_id) do update
  set status = excluded.status,
      checked_in_by = excluded.checked_in_by
  returning * into result;

  if p_status = 'PRESENT' then
    insert into public.attendance (
      event_id,
      profile_id,
      modified_by,
      status
    )
    values (p_event_id, p_profile_id, actor, 'PRESENTE')
    on conflict (event_id, profile_id) do update
    set status = 'PRESENTE',
        modified_by = excluded.modified_by;
  else
    delete from public.match_player_stats
    where event_id = p_event_id
      and profile_id = p_profile_id;

    delete from public.match_awards
    where event_id = p_event_id
      and profile_id = p_profile_id;
  end if;

  return result;
end;
$$;

-- Statistiche pubbliche: solo partite giocate da chi è in rosa.
create or replace view public.public_player_statistics
with (security_barrier = true)
as
with active_season as (
  select id
  from public.seasons
  where (now() at time zone 'Europe/Rome')::date between starts_on and ends_on
),
public_players as (
  select distinct p.id, p.nome, p.cognome, p.avatar_url
  from public.profiles p
  join public.season_memberships membership on membership.profile_id = p.id
  join active_season season on season.id = membership.season_id
  where membership.category = 'PLAYER'
    and membership.status = 'YES'
),
stats as (
  select
    player_stats.profile_id,
    sum(player_stats.goals)::integer as goals,
    sum(player_stats.assists)::integer as assists
  from public.match_player_stats player_stats
  join public.events event on event.id = player_stats.event_id
  join active_season season on season.id = event.season_id
  group by player_stats.profile_id
),
awards as (
  select award.profile_id, count(*)::integer as player_of_match
  from public.match_awards award
  join public.events event on event.id = award.event_id
  join active_season season on season.id = event.season_id
  group by award.profile_id
)
select
  player.id as profile_id,
  player.nome,
  player.cognome,
  player.avatar_url,
  coalesce(stats.goals, 0)::integer as goals,
  coalesce(stats.assists, 0)::integer as assists,
  coalesce(awards.player_of_match, 0)::integer as player_of_match
from public_players player
left join stats on stats.profile_id = player.id
left join awards on awards.profile_id = player.id;

-- Directory pubblica e roster per utenti autenticati: viste non ancora
-- collegate a nessuna schermata, ma tenute coerenti col nuovo status.
create or replace view public.public_profile_directory
with (security_barrier = true)
as
select p.id, p.nome, p.cognome, p.avatar_url
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status <> 'NO';

drop view if exists public.authenticated_active_roster;

create view public.authenticated_active_roster
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url,
  p.data_nascita,
  m.category,
  m.role,
  m.staff_function,
  m.jersey_number,
  m.status,
  m.department,
  m.is_external,
  m.is_aggregated,
  s.slug as season_slug
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where public.is_current_user_associated()
  and (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status <> 'NO';

revoke all on public.public_profile_directory from public;
revoke all on public.authenticated_active_roster from public;
grant select on public.public_profile_directory to anon, authenticated;
grant select on public.authenticated_active_roster to authenticated;

-- Directory giocatori per stagione (storico maglie, selettori statistiche):
-- chiunque non sia archiviato, più chi ha comunque statistiche storiche.
create or replace view public.public_season_player_directory
with (security_barrier = true)
as
select
  membership.season_id,
  profile.id as profile_id,
  profile.nome,
  profile.cognome,
  profile.avatar_url,
  membership.role,
  membership.jersey_number
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
where membership.category = 'PLAYER'
  and (
    membership.status <> 'NO'
    or exists (
      select 1
      from public.public_player_statistics_by_phase statistics
      where statistics.season_id = membership.season_id
        and statistics.profile_id = membership.profile_id
    )
  );

-- Scheda persona (manager): lo status singolo sostituisce lo status YES/NO
-- più il checkbox "solo allenamenti".
create or replace function public.manager_update_person(
  p_profile_id uuid,
  p_membership_id uuid,
  p_expected_profile_updated_at timestamptz,
  p_expected_membership_updated_at timestamptz,
  p_expected_private_updated_at timestamptz,
  p_profile jsonb,
  p_membership jsonb,
  p_private jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.season_memberships;
  profile_row public.profiles;
  private_row public.profile_private_details;
  private_exists boolean;
  next_category public.membership_category;
  next_registration public.registration_status;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'nome'), '') is null
     or nullif(trim(p_profile->>'cognome'), '') is null then
    raise exception 'Name and surname are required';
  end if;

  select * into profile_row
  from public.profiles
  where id = p_profile_id
  for update;

  if profile_row.id is null then
    raise exception 'Profile not found';
  end if;

  select * into private_row
  from public.profile_private_details
  where profile_id = p_profile_id
  for update;
  private_exists := found;

  select * into result
  from public.season_memberships
  where id = p_membership_id
    and profile_id = p_profile_id
  for update;

  if result.id is null then
    raise exception 'Membership not found';
  end if;
  if profile_row.updated_at is distinct from p_expected_profile_updated_at
     or result.updated_at is distinct from p_expected_membership_updated_at
     or (
       private_exists
       and private_row.updated_at is distinct from p_expected_private_updated_at
     )
     or (
       not private_exists
       and p_expected_private_updated_at is not null
     ) then
    raise exception 'Person changed by another manager'
      using errcode = '40001';
  end if;

  select (p_membership->>'category')::public.membership_category,
         (p_membership->>'registration_status')::public.registration_status
  into next_category, next_registration;

  update public.profiles
  set nome = trim(p_profile->>'nome'),
      cognome = trim(p_profile->>'cognome'),
      data_nascita = nullif(p_profile->>'data_nascita', '')::date,
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  update public.profile_private_details
  set phone = nullif(trim(p_private->>'phone'), ''),
      operational_email = nullif(trim(p_private->>'operational_email'), ''),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where profile_id = p_profile_id;

  if not found then
    insert into public.profile_private_details (
      profile_id, phone, operational_email, updated_by
    )
    values (
      p_profile_id,
      nullif(trim(p_private->>'phone'), ''),
      nullif(trim(p_private->>'operational_email'), ''),
      public.current_profile_id()
    );
  end if;

  update public.season_memberships
  set category = next_category,
      status = (p_membership->>'status')::public.membership_status,
      role = case when next_category = 'PLAYER'
        then nullif(p_membership->>'role', '') else null end,
      staff_function = case when next_category = 'STAFF'
        then coalesce(nullif(trim(p_membership->>'staff_function'), ''), 'Staff')
        else null end,
      jersey_number = nullif(p_membership->>'jersey_number', '')::integer,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
      operational_notes = nullif(trim(p_membership->>'operational_notes'), ''),
      next_contact_on = nullif(p_membership->>'next_contact_on', '')::date,
      registration_status = next_registration,
      registration_completed_on = case when next_registration = 'ACTIVE'
        then coalesce(
          nullif(p_membership->>'registration_completed_on', '')::date,
          current_date
        )
        else null
      end,
      registration_completed_by = case when next_registration = 'ACTIVE'
        then public.current_profile_id()
        else null
      end,
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_membership_id
    and profile_id = p_profile_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) to authenticated, service_role;

-- Creazione persona (manager): status esplicito invece del checkbox.
drop function if exists public.manager_create_person(
  text, text, text, public.membership_category, public.membership_status,
  text, text, text, boolean, date
);

create function public.manager_create_person(
  p_season_slug text,
  p_nome text,
  p_cognome text,
  p_category public.membership_category,
  p_status public.membership_status,
  p_phone text default null,
  p_role text default null,
  p_staff_function text default null,
  p_joined_on date default null
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id_value uuid;
  season_id_value uuid;
  result public.season_memberships;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null or nullif(trim(p_cognome), '') is null then
    raise exception 'Name and surname are required';
  end if;
  if p_category = 'PLAYER' and p_role is not null
     and p_role <> all(array['PORTIERE','DIFENSORE','CENTROCAMPISTA','ATTACCANTE']) then
    raise exception 'Unsupported player role';
  end if;

  select id into season_id_value
  from public.seasons
  where slug = p_season_slug;
  if season_id_value is null then
    raise exception 'Season not found';
  end if;

  insert into public.profiles (
    nome,
    cognome,
    ruolo,
    is_staff,
    joined_on,
    updated_at
  )
  values (
    trim(p_nome),
    trim(p_cognome),
    case when p_category = 'PLAYER' then p_role else null end,
    p_category = 'STAFF',
    p_joined_on,
    now()
  )
  returning id into profile_id_value;

  insert into public.profile_private_details (profile_id, phone, updated_by)
  values (
    profile_id_value,
    nullif(trim(p_phone), ''),
    public.current_profile_id()
  );

  insert into public.season_memberships (
    profile_id,
    season_id,
    category,
    role,
    staff_function,
    status,
    updated_by
  )
  values (
    profile_id_value,
    season_id_value,
    p_category,
    case when p_category = 'PLAYER' then p_role else null end,
    case when p_category = 'STAFF'
      then coalesce(nullif(trim(p_staff_function), ''), 'Staff')
      else null
    end,
    p_status,
    public.current_profile_id()
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_create_person(
  text, text, text, public.membership_category, public.membership_status,
  text, text, text, date
) from public, anon;
grant execute on function public.manager_create_person(
  text, text, text, public.membership_category, public.membership_status,
  text, text, text, date
) to authenticated, service_role;

-- Ora che nessuna vista/funzione la referenzia più, la colonna può sparire.
alter table public.season_memberships
  drop column training_only;

commit;
