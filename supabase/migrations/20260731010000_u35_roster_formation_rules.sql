begin;

create or replace view public.public_active_roster
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
  m.training_only,
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
  and m.status in ('YES', 'MAYBE');

revoke all on public.public_active_roster from public;
grant select on public.public_active_roster to anon, authenticated;

create or replace function public.publish_official_formation(
  p_event_id uuid,
  p_formation_module text,
  p_shirt_color text,
  p_captain_profile_id uuid,
  p_vice_captain_profile_id uuid,
  p_snapshot jsonb,
  p_players jsonb
)
returns public.official_formations
language plpgsql
security definer
set search_path = public
as $$
declare
  formation public.official_formations;
  target_users uuid[];
  event_label text;
  event_date date;
  event_season_id uuid;
  eligible_player_count integer;
  u35_field_count integer;
  u35_total_count integer;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
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
    event.season_id
  into event_date, event_season_id
  from public.events event
  where event.id = p_event_id
    and event.tipo = 'PARTITA';

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
          (player.position_key !~ '^P[1-9]$')
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
        and payload.position_key !~ '^P[1-9]$'
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
   and membership.status in ('YES', 'MAYBE')
   and membership.training_only = false
  join public.profiles profile on profile.id = payload.profile_id;

  if eligible_player_count <> jsonb_array_length(p_players) then
    raise exception 'Player is not eligible for this match formation';
  end if;
  if u35_field_count > 3 or u35_total_count > 4 then
    raise exception 'U35 quota exceeded: maximum 3 on field and 4 called up';
  end if;

  insert into public.official_formations (
    event_id,
    formation_module,
    shirt_color,
    captain_profile_id,
    vice_captain_profile_id,
    snapshot,
    status,
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
   and membership.status in ('YES', 'MAYBE')
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
    'official-formation:' || formation.id::text || ':' || formation.published_at::text,
    public.current_profile_id()
  );

  return formation;
end;
$$;

revoke all on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
) to authenticated, service_role;

commit;
