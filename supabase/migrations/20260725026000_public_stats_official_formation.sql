-- Correct public statistics aggregation and transactional official formations.

begin;

create or replace view public.public_player_statistics
with (security_barrier = true)
as
with stats as (
  select
    profile_id,
    sum(goals)::integer as goals,
    sum(assists)::integer as assists
  from public.match_player_stats
  group by profile_id
),
awards as (
  select profile_id, count(*)::integer as player_of_match
  from public.match_awards
  group by profile_id
)
select
  p.id as profile_id,
  p.nome,
  p.cognome,
  p.avatar_url,
  coalesce(stats.goals, 0)::integer as goals,
  coalesce(stats.assists, 0)::integer as assists,
  coalesce(awards.player_of_match, 0)::integer as player_of_match
from public.profiles p
left join stats on stats.profile_id = p.id
left join awards on awards.profile_id = p.id;

revoke all on public.public_player_statistics from public;
grant select on public.public_player_statistics to anon, authenticated;

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
    coalesce(e.avversario, e.squadra_ospite, e.squadra_casa, 'prossima partita'),
    array_agg(distinct p.user_id) filter (where p.user_id is not null)
  into event_label, target_users
  from public.events e
  join public.season_memberships membership
    on membership.season_id = e.season_id
   and membership.status in ('YES', 'MAYBE')
  join public.profiles p on p.id = membership.profile_id
  where e.id = p_event_id
  group by e.id;

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
