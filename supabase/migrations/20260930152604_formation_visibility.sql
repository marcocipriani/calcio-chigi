begin;

-- Visibilità della formazione pubblicata. PRIVATE: i giocatori vedono solo i
-- convocati (get_event_callups). PUBLIC: vedono titolari e panchina.
-- Le righe esistenti erano visibili a tutti: restano PUBLIC.
alter table public.official_formations
  add column visibility text not null default 'PUBLIC'
  constraint official_formations_visibility_check
    check (visibility in ('PRIVATE', 'PUBLIC'));
alter table public.official_formations
  alter column visibility set default 'PRIVATE';

drop policy official_formations_associated_select on public.official_formations;
create policy official_formations_associated_select
on public.official_formations for select to authenticated
using (
  public.is_current_user_manager()
  or (
    public.is_current_user_associated()
    and status = 'PUBLISHED'
    and visibility = 'PUBLIC'
  )
);

drop policy official_formation_players_associated_select
  on public.official_formation_players;
create policy official_formation_players_associated_select
on public.official_formation_players for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.official_formations f
    where f.id = formation_id
      and f.status = 'PUBLISHED'
      and f.visibility = 'PUBLIC'
      and public.is_current_user_associated()
  )
);

-- Elenco convocati per gli associati, qualunque sia la visibilità: nomi e
-- colore maglia, mai titolari, posizioni o modulo.
create or replace function public.get_event_callups(p_event_id uuid)
returns table (
  nome text,
  cognome text,
  avatar_url text,
  role text,
  birth_date date,
  shirt_color text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    player.player_snapshot->>'nome',
    player.player_snapshot->>'cognome',
    player.player_snapshot->>'avatar_url',
    player.player_snapshot->>'role',
    nullif(player.player_snapshot->>'birth_date', '')::date,
    formation.shirt_color,
    formation.published_at
  from public.official_formations formation
  join public.official_formation_players player
    on player.formation_id = formation.id
  where formation.event_id = p_event_id
    and formation.status = 'PUBLISHED'
    and formation.withdrawn_at is null
    and public.is_current_user_associated()
  order by 2, 1;
$$;

revoke all on function public.get_event_callups(uuid) from public, anon;
grant execute on function public.get_event_callups(uuid)
  to authenticated, service_role;

-- Nuova firma con p_visibility: la vecchia va tolta per non lasciare due
-- overload. Un client vecchio che passa 7 argomenti nominati risolve sulla
-- nuova grazie al default e pubblica privata.
drop function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
);

-- Corpo identico a formation_updated_notification salvo: p_visibility,
-- panchina fino a P12, testi della notifica per la pubblicazione privata.
create function public.publish_official_formation(
  p_event_id uuid,
  p_formation_module text,
  p_shirt_color text,
  p_captain_profile_id uuid,
  p_vice_captain_profile_id uuid,
  p_snapshot jsonb,
  p_players jsonb,
  p_visibility text default 'PRIVATE'
)
returns public.official_formations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  formation public.official_formations;
  target_users uuid[];
  event_label text;
  event_date date;
  event_season_id uuid;
  event_tipo text;
  eligible_player_count integer;
  u35_field_count integer;
  u35_total_count integer;
  was_published boolean;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('PRIVATE', 'PUBLIC') then
    raise exception 'Unknown formation visibility';
  end if;
  if nullif(trim(p_formation_module), '') is null then
    raise exception 'Formation module is required';
  end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_players, '[]'::jsonb)) = 0 then
    raise exception 'At least one player is required';
  end if;

  select
    (event.data_ora at time zone 'Europe/Rome')::date,
    event.season_id,
    event.tipo
  into event_date, event_season_id, event_tipo
  from public.events event
  where event.id = p_event_id
    and event.tipo in ('PARTITA', 'AMICHEVOLE');

  if event_date is null or event_season_id is null then
    raise exception 'Match date is required for U35 validation';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as player(
      profile_id uuid,
      player_snapshot jsonb,
      is_starter boolean,
      position_key text,
      sort_order integer
    )
    where player.position_key is null
       or player.is_starter is distinct from
          (player.position_key !~ '^P([1-9]|1[0-2])$')
  ) then
    raise exception 'Formation position does not match starter status';
  end if;

  with payload as (
    select *
    from jsonb_to_recordset(p_players) as player(
      profile_id uuid,
      player_snapshot jsonb,
      is_starter boolean,
      position_key text,
      sort_order integer
    )
  )
  select
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(membership.role, '')) <> 'PORTIERE'
        and payload.position_key <> 'POR'
        and payload.position_key !~ '^P([1-9]|1[0-2])$'
        and profile.data_nascita is not null
        and profile.data_nascita <= event_date
        and date_part('year', age(event_date, profile.data_nascita)) < 35
    )::integer,
    count(*) filter (
      where upper(coalesce(membership.role, '')) <> 'PORTIERE'
        and payload.position_key <> 'POR'
        and profile.data_nascita is not null
        and profile.data_nascita <= event_date
        and date_part('year', age(event_date, profile.data_nascita)) < 35
    )::integer
  into eligible_player_count, u35_field_count, u35_total_count
  from payload
  join public.season_memberships membership
    on membership.profile_id = payload.profile_id
   and membership.season_id = event_season_id
   and membership.category = 'PLAYER'
   and (
     membership.status = 'YES'
     or (membership.status = 'TRAINING_ONLY' and event_tipo = 'AMICHEVOLE')
   )
  join public.profiles profile on profile.id = payload.profile_id;

  if eligible_player_count <> jsonb_array_length(p_players) then
    raise exception 'Player is not eligible for this match formation';
  end if;
  if event_tipo = 'PARTITA' and (u35_field_count > 3 or u35_total_count > 5) then
    raise exception 'U35 quota exceeded: maximum 3 on field and 5 called up';
  end if;

  -- Una formazione ritirata e ripubblicata torna "pubblicata", non "aggiornata".
  select exists (
    select 1
    from public.official_formations existing
    where existing.event_id = p_event_id
      and existing.status = 'PUBLISHED'
  )
  into was_published;

  insert into public.official_formations (
    event_id,
    formation_module,
    shirt_color,
    captain_profile_id,
    vice_captain_profile_id,
    snapshot,
    status,
    visibility,
    published_by,
    published_at,
    withdrawn_at
  )
  values (
    p_event_id,
    trim(p_formation_module),
    nullif(trim(p_shirt_color), ''),
    p_captain_profile_id,
    p_vice_captain_profile_id,
    coalesce(p_snapshot, '{}'::jsonb),
    'PUBLISHED',
    p_visibility,
    public.current_profile_id(),
    now(),
    null
  )
  on conflict (event_id) do update
  set formation_module = excluded.formation_module,
      shirt_color = excluded.shirt_color,
      captain_profile_id = excluded.captain_profile_id,
      vice_captain_profile_id = excluded.vice_captain_profile_id,
      snapshot = excluded.snapshot,
      status = 'PUBLISHED',
      visibility = excluded.visibility,
      published_by = excluded.published_by,
      published_at = now(),
      withdrawn_at = null,
      updated_at = now()
  returning * into formation;

  delete from public.official_formation_players
  where formation_id = formation.id;

  insert into public.official_formation_players (
    formation_id,
    profile_id,
    player_snapshot,
    is_starter,
    position_key,
    sort_order
  )
  select
    formation.id,
    player.profile_id,
    player.player_snapshot,
    player.is_starter,
    nullif(trim(player.position_key), ''),
    player.sort_order
  from jsonb_to_recordset(p_players) as player(
    profile_id uuid,
    player_snapshot jsonb,
    is_starter boolean,
    position_key text,
    sort_order integer
  );

  select
    coalesce(event.avversario, event.squadra_ospite, event.squadra_casa, 'prossima partita'),
    array_agg(distinct profile.user_id) filter (where profile.user_id is not null)
  into event_label, target_users
  from public.events event
  join public.season_memberships membership
    on membership.season_id = event.season_id
   and membership.status <> 'NO'
  join public.profiles profile on profile.id = membership.profile_id
  where event.id = p_event_id
  group by event.id;

  perform public.create_notification(
    'OFFICIAL_FORMATION_PUBLISHED',
    case
      when p_visibility = 'PRIVATE' and was_published then 'Convocati aggiornati'
      when p_visibility = 'PRIVATE' then 'Convocati pubblicati'
      when was_published then 'Formazione aggiornata'
      else 'Formazione ufficiale pubblicata'
    end,
    case
      when p_visibility = 'PRIVATE' and was_published
        then 'I convocati per ' || coalesce(event_label, 'la prossima partita') || ' sono cambiati.'
      when p_visibility = 'PRIVATE'
        then 'Sono usciti i convocati per ' || coalesce(event_label, 'la prossima partita') || '.'
      when was_published
        then 'La formazione per ' || coalesce(event_label, 'la prossima partita') || ' è cambiata.'
      else 'È disponibile la formazione per ' || coalesce(event_label, 'la prossima partita') || '.'
    end,
    '/evento/' || p_event_id::text,
    target_users,
    true,
    'official-formation:' || formation.id::text || ':' || formation.published_at::text,
    public.current_profile_id()
  );

  return formation;
end;
$function$;

revoke all on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb, text
) from public, anon;
grant execute on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb, text
) to authenticated, service_role;

-- Cambio di visibilità senza ripubblicare. Solo il passaggio a PUBLIC avvisa
-- i giocatori: è il momento in cui la formazione diventa leggibile.
create or replace function public.set_official_formation_visibility(
  p_event_id uuid,
  p_visibility text
)
returns public.official_formations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  formation public.official_formations;
  previous_visibility text;
  target_users uuid[];
  event_label text;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('PRIVATE', 'PUBLIC') then
    raise exception 'Unknown formation visibility';
  end if;

  select existing.visibility
  into previous_visibility
  from public.official_formations existing
  where existing.event_id = p_event_id
    and existing.status = 'PUBLISHED'
  for update;

  if not found then
    raise exception 'Published formation not found';
  end if;

  update public.official_formations
  set visibility = p_visibility
  where event_id = p_event_id
  returning * into formation;

  if previous_visibility = 'PRIVATE' and p_visibility = 'PUBLIC' then
    select
      coalesce(event.avversario, event.squadra_ospite, event.squadra_casa, 'prossima partita'),
      array_agg(distinct profile.user_id) filter (where profile.user_id is not null)
    into event_label, target_users
    from public.events event
    join public.season_memberships membership
      on membership.season_id = event.season_id
     and membership.status <> 'NO'
    join public.profiles profile on profile.id = membership.profile_id
    where event.id = p_event_id
    group by event.id;

    perform public.create_notification(
      'OFFICIAL_FORMATION_PUBLISHED',
      'Formazione ufficiale pubblicata',
      'È disponibile la formazione per ' || coalesce(event_label, 'la prossima partita') || '.',
      '/evento/' || p_event_id::text,
      target_users,
      true,
      'official-formation-public:' || formation.id::text || ':' || formation.updated_at::text,
      public.current_profile_id()
    );
  end if;

  return formation;
end;
$function$;

revoke all on function public.set_official_formation_visibility(uuid, text)
  from public, anon;
grant execute on function public.set_official_formation_visibility(uuid, text)
  to authenticated, service_role;

commit;
