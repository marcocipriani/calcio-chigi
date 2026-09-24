begin;

-- 1) Funzioni plpgsql rimaste a referenziare season_memberships.training_only
--    (colonna rimossa in 20260924121000): il corpo è risolto a runtime, quindi
--    la drop non le aveva bloccate ma ora falliscono alla prima chiamata.

-- Guard sulle membership: stessi campi di prima meno training_only. In più la
-- taglia è modificabile dal giocatore solo passando da save_own_uniform_size,
-- che alza il flag di transazione app.own_uniform_size.
create or replace function public.guard_membership_passport_photo()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_current_user_manager() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
     or new.season_id is distinct from old.season_id
     or new.category is distinct from old.category
     or new.role is distinct from old.role
     or new.staff_function is distinct from old.staff_function
     or new.jersey_number is distinct from old.jersey_number
     or (
       new.uniform_size is distinct from old.uniform_size
       and coalesce(current_setting('app.own_uniform_size', true), '') <> 'on'
     )
     or new.asi_card_number is distinct from old.asi_card_number
     or new.department is distinct from old.department
     or new.is_external is distinct from old.is_external
     or new.is_aggregated is distinct from old.is_aggregated
     or new.operational_notes is distinct from old.operational_notes
     or new.next_contact_on is distinct from old.next_contact_on
     or new.reference_manager_profile_id is distinct from old.reference_manager_profile_id
     or new.status is distinct from old.status
     or new.last_confirmation_requested_at is distinct from old.last_confirmation_requested_at
     or new.registration_status is distinct from old.registration_status
     or new.registration_completed_on is distinct from old.registration_completed_on
     or new.registration_completed_by is distinct from old.registration_completed_by
     or new.passport_photo_unlocked_at is distinct from old.passport_photo_unlocked_at then
    raise exception 'Only managers can modify membership fields';
  end if;

  if new.passport_photo_path is distinct from old.passport_photo_path
     and old.registration_status = 'ACTIVE'
     and old.passport_photo_unlocked_at is null then
    raise exception 'Passport photo is locked after active registration';
  end if;
  new.updated_by := public.current_profile_id();
  return new;
end;
$$;

create or replace function public.update_membership_if_current(
  p_membership_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.season_memberships;
  actor uuid;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  if p_patch - array[
    'category', 'role', 'staff_function', 'jersey_number', 'uniform_size',
    'asi_card_number', 'department', 'is_external', 'is_aggregated',
    'operational_notes', 'next_contact_on',
    'reference_manager_profile_id', 'status', 'registration_status',
    'registration_completed_on', 'registration_completed_by',
    'passport_photo_path', 'passport_photo_unlocked_at'
  ] <> '{}'::jsonb then
    raise exception 'Patch contains unsupported fields';
  end if;

  actor := public.current_profile_id();

  update public.season_memberships
  set category = coalesce((p_patch->>'category')::public.membership_category, category),
      role = case when p_patch ? 'role' then nullif(p_patch->>'role', '') else role end,
      staff_function = case when p_patch ? 'staff_function' then nullif(p_patch->>'staff_function', '') else staff_function end,
      jersey_number = case when p_patch ? 'jersey_number' then (p_patch->>'jersey_number')::integer else jersey_number end,
      uniform_size = case when p_patch ? 'uniform_size' then nullif(p_patch->>'uniform_size', '') else uniform_size end,
      asi_card_number = case when p_patch ? 'asi_card_number' then nullif(p_patch->>'asi_card_number', '') else asi_card_number end,
      department = case when p_patch ? 'department' then nullif(p_patch->>'department', '') else department end,
      is_external = case when p_patch ? 'is_external' then (p_patch->>'is_external')::boolean else is_external end,
      is_aggregated = case when p_patch ? 'is_aggregated' then (p_patch->>'is_aggregated')::boolean else is_aggregated end,
      operational_notes = case when p_patch ? 'operational_notes' then nullif(p_patch->>'operational_notes', '') else operational_notes end,
      next_contact_on = case when p_patch ? 'next_contact_on' then (p_patch->>'next_contact_on')::date else next_contact_on end,
      reference_manager_profile_id = case when p_patch ? 'reference_manager_profile_id' then (p_patch->>'reference_manager_profile_id')::uuid else reference_manager_profile_id end,
      status = coalesce((p_patch->>'status')::public.membership_status, status),
      registration_status = coalesce((p_patch->>'registration_status')::public.registration_status, registration_status),
      registration_completed_on = case when p_patch ? 'registration_completed_on' then (p_patch->>'registration_completed_on')::date else registration_completed_on end,
      registration_completed_by = case when p_patch ? 'registration_completed_by' then (p_patch->>'registration_completed_by')::uuid else registration_completed_by end,
      passport_photo_path = case when p_patch ? 'passport_photo_path' then nullif(p_patch->>'passport_photo_path', '') else passport_photo_path end,
      passport_photo_unlocked_at = case when p_patch ? 'passport_photo_unlocked_at' then (p_patch->>'passport_photo_unlocked_at')::timestamptz else passport_photo_unlocked_at end,
      updated_by = actor
  where id = p_membership_id
    and updated_at = p_expected_updated_at
  returning * into result;

  if result.id is null then
    raise exception 'Membership changed by another manager'
      using errcode = '40001';
  end if;

  return result;
end;
$$;

-- Formazione ufficiale: solo chi è in rosa (lo status sostituisce il flag).
create or replace function public.validate_official_formation_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is null and tg_op = 'INSERT' then
    raise exception 'Formation player is required';
  elsif new.profile_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.official_formations f
    join public.events e on e.id = f.event_id and e.tipo = 'PARTITA'
    join public.season_memberships m
      on m.profile_id = new.profile_id
     and m.season_id = e.season_id
    where f.id = new.formation_id
      and m.category = 'PLAYER'
      and m.status = 'YES'
  ) then
    raise exception 'Player is not eligible for this match formation';
  end if;

  return new;
end;
$$;

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
   and membership.status = 'YES'
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

  -- La notifica va anche a chi si allena soltanto: resta parte della squadra.
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
$$;

-- 2) Taglie: elenco chiuso S–XXL. I valori intermedi storici vanno alla
--    taglia superiore (meglio larga che stretta).
alter table public.season_memberships
  disable trigger trg_guard_membership_passport_photo;

update public.season_memberships
set uniform_size = case
  when uniform_size in ('M - L') then 'L'
  when uniform_size in ('S - M') then 'M'
  when uniform_size in ('L/XL', 'XL ?') then 'XL'
  else null
end
where uniform_size is not null
  and uniform_size not in ('S', 'M', 'L', 'XL', 'XXL');

alter table public.season_memberships
  enable trigger trg_guard_membership_passport_photo;

alter table public.season_memberships
  add constraint season_memberships_uniform_size_check
  check (uniform_size is null or uniform_size in ('S', 'M', 'L', 'XL', 'XXL'));

-- Il giocatore in rosa sceglie la propria taglia da /maglie, finché il
-- manager non rende definitivi i numeri della stagione.
create or replace function public.save_own_uniform_size(
  p_membership_id uuid,
  p_uniform_size text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.season_memberships m
    where m.id = p_membership_id
      and m.profile_id = public.current_profile_id()
      and m.category = 'PLAYER'
      and m.status = 'YES'
  ) then
    raise exception 'Membership not found' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.season_memberships m
    join public.jersey_assignment_drafts d on d.season_id = m.season_id
    where m.id = p_membership_id
      and d.confirmed_at is not null
  ) then
    raise exception 'Jersey assignment already confirmed';
  end if;

  perform set_config('app.own_uniform_size', 'on', true);
  update public.season_memberships
  set uniform_size = nullif(trim(p_uniform_size), '')
  where id = p_membership_id;
  perform set_config('app.own_uniform_size', 'off', true);
end;
$$;

revoke all on function public.save_own_uniform_size(uuid, text)
  from public, anon;
grant execute on function public.save_own_uniform_size(uuid, text)
  to authenticated;

-- 3) Preferenze di visualizzazione della dashboard (vista, layout,
--    ordinamento per vista), accanto alle colonne già salvate.
alter table public.profile_ui_preferences
  add column management_display jsonb not null default '{}'::jsonb
    check (jsonb_typeof(management_display) = 'object');

commit;
