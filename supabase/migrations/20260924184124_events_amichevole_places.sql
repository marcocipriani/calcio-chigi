-- Nuovo tipo evento AMICHEVOLE: si gestisce come una partita (avversario,
-- formazione, statistiche di presenza) ma resta fuori da classifica e
-- statistiche torneo, che filtrano già su tipo = 'PARTITA'. Come agli
-- allenamenti, anche i tesserati TRAINING_ONLY possono partecipare.
-- In più: normalizzazione dei nomi dei campi per il dropdown dei luoghi.

alter table public.events drop constraint events_tipo_check;
alter table public.events add constraint events_tipo_check
  check (tipo = any (array['PARTITA', 'ALLENAMENTO', 'AMICHEVOLE']));

-- Il trigger notifiche scatta su ogni cambio di luogo: spento durante la
-- pulizia per non mandare un "Evento aggiornato" per ogni evento storico.
alter table public.events disable trigger trg_notify_event_update;

update public.events
set luogo = regexp_replace(luogo, '\s+-\s+(\d+|\*)$', '')
where luogo ~ '\s+-\s+(\d+|\*)$';

update public.events
set luogo = 'SS Romulea'
where lower(trim(luogo)) in ('romulea', 'ss romulea')
  and luogo <> 'SS Romulea';

update public.events
set luogo = 'C.S. CAVALIERI'
where lower(trim(luogo)) in ('cs cavalieri', 'c.s. cavalieri')
  and luogo <> 'C.S. CAVALIERI';

alter table public.events enable trigger trg_notify_event_update;

create or replace function public.get_event_roster(p_event_id uuid)
returns table(
  profile_id uuid,
  nome text,
  cognome text,
  avatar_url text,
  data_nascita date,
  category membership_category,
  role text,
  staff_function text,
  jersey_number integer,
  status membership_status,
  department text,
  is_external boolean,
  is_aggregated boolean
)
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
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
      or (membership.status = 'TRAINING_ONLY' and event.tipo in ('ALLENAMENTO', 'AMICHEVOLE'))
    )
  order by profile.cognome, profile.nome;
end;
$function$;

create or replace function public.set_event_checkin(p_event_id uuid, p_profile_id uuid, p_status event_checkin_status)
returns event_checkins
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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
       or (m.status = 'TRAINING_ONLY' and e.tipo in ('ALLENAMENTO', 'AMICHEVOLE'))
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
$function$;

create or replace function public.validate_official_formation_player()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.profile_id is null and tg_op = 'INSERT' then
    raise exception 'Formation player is required';
  elsif new.profile_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.official_formations f
    join public.events e on e.id = f.event_id and e.tipo in ('PARTITA', 'AMICHEVOLE')
    join public.season_memberships m
      on m.profile_id = new.profile_id
     and m.season_id = e.season_id
    where f.id = new.formation_id
      and m.category = 'PLAYER'
      and (m.status = 'YES' or (m.status = 'TRAINING_ONLY' and e.tipo = 'AMICHEVOLE'))
  ) then
    raise exception 'Player is not eligible for this match formation';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_present_match_player()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
    from public.events e
    join public.event_checkins c
      on c.event_id = e.id
     and c.profile_id = new.profile_id
     and c.status = 'PRESENT'
    where e.id = new.event_id
      and e.tipo in ('PARTITA', 'AMICHEVOLE')
  ) then
    raise exception 'Match stats require a present player';
  end if;
  return new;
end;
$function$;

create or replace function public.publish_official_formation(
  p_event_id uuid,
  p_formation_module text,
  p_shirt_color text,
  p_captain_profile_id uuid,
  p_vice_captain_profile_id uuid,
  p_snapshot jsonb,
  p_players jsonb
)
returns official_formations
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
   and (
     membership.status = 'YES'
     or (membership.status = 'TRAINING_ONLY' and event_tipo = 'AMICHEVOLE')
   )
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
    'official-formation:' || formation.id::text || ':' || formation.published_at::text,
    public.current_profile_id()
  );

  return formation;
end;
$function$;

-- 'MAYBE' non esiste più (status YES/TRAINING_ONLY/NO): notifica chiunque non sia NO.
create or replace function public.notify_event_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  target_users uuid[];
begin
  if row(
    new.data_ora,
    new.data_fine_ora,
    new.luogo,
    new.cancellato,
    new.note
  ) is distinct from row(
    old.data_ora,
    old.data_fine_ora,
    old.luogo,
    old.cancellato,
    old.note
  ) then
    select array_agg(distinct p.user_id) into target_users
    from public.profiles p
    join public.season_memberships m on m.profile_id = p.id
    where m.season_id = new.season_id
      and m.status <> 'NO'
      and p.user_id is not null;

    perform public.create_notification(
      'EVENT_UPDATED',
      'Evento aggiornato',
      case new.tipo
        when 'PARTITA' then 'La partita è stata aggiornata.'
        when 'AMICHEVOLE' then 'L’amichevole è stata aggiornata.'
        else 'L’allenamento è stato aggiornato.'
      end,
      '/evento/' || new.id::text,
      target_users,
      true,
      'event-update:' || new.id::text || ':' || txid_current()::text,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$function$;
