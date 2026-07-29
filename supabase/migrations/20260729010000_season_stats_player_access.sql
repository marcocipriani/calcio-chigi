-- Seasonal statistics projections and associated-player profile access.

begin;

alter table public.match_player_stats
  add column if not exists yellow_cards integer not null default 0
    check (yellow_cards >= 0),
  add column if not exists red_cards integer not null default 0
    check (red_cards >= 0);

create table public.historical_player_stats (
  season_id uuid not null references public.seasons(id) on delete cascade,
  phase_key text not null check (phase_key in (
    'FASE_1',
    'FASE_2_CALCIATORI',
    'FASE_2_PROFESSIONISTI',
    'COPPA_LAZIO_PROFESSIONISTI'
  )),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  goals integer not null default 0 check (goals >= 0),
  mvp integer not null default 0 check (mvp >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  source_url text not null check (nullif(trim(source_url), '') is not null),
  imported_at timestamptz not null default now(),
  primary key (season_id, phase_key, profile_id)
);

alter table public.historical_player_stats enable row level security;

revoke all on public.historical_player_stats
  from public, anon, authenticated;
grant select, insert, update, delete on public.historical_player_stats
  to service_role;

create or replace view public.public_player_statistics_by_phase
with (security_barrier = true)
as
with live_match_stats as (
  select
    event.season_id,
    coalesce(event.fase, 'FASE_1') as phase_key,
    player_stats.profile_id,
    sum(player_stats.goals)::integer as goals,
    sum(player_stats.assists)::integer as assists,
    sum(player_stats.yellow_cards)::integer as yellow_cards,
    sum(player_stats.red_cards)::integer as red_cards
  from public.match_player_stats player_stats
  join public.events event on event.id = player_stats.event_id
  where event.tipo = 'PARTITA'
  group by
    event.season_id,
    coalesce(event.fase, 'FASE_1'),
    player_stats.profile_id
),
live_awards as (
  select
    event.season_id,
    coalesce(event.fase, 'FASE_1') as phase_key,
    award.profile_id,
    count(*)::integer as mvp
  from public.match_awards award
  join public.events event on event.id = award.event_id
  where event.tipo = 'PARTITA'
  group by
    event.season_id,
    coalesce(event.fase, 'FASE_1'),
    award.profile_id
),
live_statistics as (
  select
    coalesce(stats.season_id, awards.season_id) as season_id,
    coalesce(stats.phase_key, awards.phase_key) as phase_key,
    coalesce(stats.profile_id, awards.profile_id) as profile_id,
    coalesce(stats.goals, 0)::integer as goals,
    coalesce(stats.assists, 0)::integer as assists,
    coalesce(awards.mvp, 0)::integer as mvp,
    coalesce(stats.yellow_cards, 0)::integer as yellow_cards,
    coalesce(stats.red_cards, 0)::integer as red_cards
  from live_match_stats stats
  full join live_awards awards
    on awards.season_id = stats.season_id
   and awards.phase_key = stats.phase_key
   and awards.profile_id = stats.profile_id
)
select
  history.season_id,
  history.phase_key,
  history.profile_id,
  history.goals,
  null::integer as assists,
  history.mvp,
  history.yellow_cards,
  history.red_cards
from public.historical_player_stats history
union all
select
  live.season_id,
  live.phase_key,
  live.profile_id,
  live.goals,
  live.assists,
  live.mvp,
  live.yellow_cards,
  live.red_cards
from live_statistics live
where not exists (
  select 1
  from public.historical_player_stats history
  where history.season_id = live.season_id
    and history.phase_key = live.phase_key
    and history.profile_id = live.profile_id
);

revoke all on public.public_player_statistics_by_phase from public;
grant select on public.public_player_statistics_by_phase
  to anon, authenticated;

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
    membership.status in ('YES', 'MAYBE')
    or exists (
      select 1
      from public.public_player_statistics_by_phase statistics
      where statistics.season_id = membership.season_id
        and statistics.profile_id = membership.profile_id
    )
  );

revoke all on public.public_season_player_directory from public;
grant select on public.public_season_player_directory
  to anon, authenticated;

create or replace function public.get_player_profile(
  p_profile_id uuid,
  p_season_id uuid
)
returns table (
  profile_id uuid,
  season_id uuid,
  nome text,
  cognome text,
  avatar_url text,
  role text,
  jersey_number integer,
  goals integer,
  assists integer,
  mvp integer,
  yellow_cards integer,
  red_cards integer
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.current_profile_id() is null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    directory.profile_id,
    directory.season_id,
    directory.nome,
    directory.cognome,
    directory.avatar_url,
    directory.role,
    directory.jersey_number,
    coalesce(sum(statistics.goals), 0)::integer,
    case
      when count(statistics.profile_id) = 0 then 0
      when count(statistics.assists) < count(statistics.profile_id) then null
      else sum(statistics.assists)::integer
    end,
    coalesce(sum(statistics.mvp), 0)::integer,
    coalesce(sum(statistics.yellow_cards), 0)::integer,
    coalesce(sum(statistics.red_cards), 0)::integer
  from public.public_season_player_directory directory
  left join public.public_player_statistics_by_phase statistics
    on statistics.season_id = directory.season_id
   and statistics.profile_id = directory.profile_id
  where directory.profile_id = p_profile_id
    and directory.season_id = p_season_id
  group by
    directory.profile_id,
    directory.season_id,
    directory.nome,
    directory.cognome,
    directory.avatar_url,
    directory.role,
    directory.jersey_number;
end;
$$;

revoke all on function public.get_player_profile(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_profile(uuid, uuid)
  to authenticated, service_role;

create or replace function public.import_historical_player_stats(
  p_season_slug text,
  p_source_url text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_season_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'Historical rows must be a non-empty JSON array';
  end if;

  if nullif(trim(p_source_url), '') is null then
    raise exception 'Historical source URL is required';
  end if;

  select season.id into target_season_id
  from public.seasons season
  where season.slug = p_season_slug;

  if target_season_id is null then
    raise exception 'Season not found: %', p_season_slug;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) incoming(row_data)
    where jsonb_typeof(incoming.row_data) <> 'object'
      or not incoming.row_data ?& array[
        'phase_key',
        'profile_id',
        'goals',
        'mvp',
        'yellow_cards',
        'red_cards'
      ]
      or incoming.row_data - array[
        'phase_key',
        'profile_id',
        'goals',
        'mvp',
        'yellow_cards',
        'red_cards'
      ] <> '{}'::jsonb
  ) then
    raise exception 'Historical rows have an invalid shape';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming(
      phase_key text,
      profile_id uuid,
      goals integer,
      mvp integer,
      yellow_cards integer,
      red_cards integer
    )
    where incoming.phase_key not in (
      'FASE_1',
      'FASE_2_CALCIATORI',
      'FASE_2_PROFESSIONISTI',
      'COPPA_LAZIO_PROFESSIONISTI'
    )
      or incoming.profile_id is null
      or incoming.goals is null
      or incoming.mvp is null
      or incoming.yellow_cards is null
      or incoming.red_cards is null
      or incoming.goals < 0
      or incoming.mvp < 0
      or incoming.yellow_cards < 0
      or incoming.red_cards < 0
      or not exists (
        select 1
        from public.season_memberships membership
        where membership.season_id = target_season_id
          and membership.profile_id = incoming.profile_id
          and membership.category = 'PLAYER'
      )
  ) then
    raise exception 'Historical rows contain invalid player statistics';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming(
      phase_key text,
      profile_id uuid
    )
    group by incoming.phase_key, incoming.profile_id
    having count(*) > 1
  ) then
    raise exception 'Historical rows contain duplicate player phases';
  end if;

  delete from public.historical_player_stats
  where season_id = target_season_id;

  insert into public.historical_player_stats (
    season_id,
    phase_key,
    profile_id,
    goals,
    mvp,
    yellow_cards,
    red_cards,
    source_url
  )
  select
    target_season_id,
    incoming.phase_key,
    incoming.profile_id,
    incoming.goals,
    incoming.mvp,
    incoming.yellow_cards,
    incoming.red_cards,
    trim(p_source_url)
  from jsonb_to_recordset(p_rows) as incoming(
    phase_key text,
    profile_id uuid,
    goals integer,
    mvp integer,
    yellow_cards integer,
    red_cards integer
  );
end;
$$;

revoke all on function public.import_historical_player_stats(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_historical_player_stats(text, text, jsonb)
  to service_role;

commit;
