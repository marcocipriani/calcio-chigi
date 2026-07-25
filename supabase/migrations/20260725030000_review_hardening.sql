-- Close review findings around data boundaries, concurrent edits and storage.

begin;

create or replace view public.public_profile_directory
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

create or replace view public.authenticated_active_roster
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
  m.training_only,
  m.department,
  m.is_external,
  m.is_aggregated,
  s.slug as season_slug
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where public.is_current_user_associated()
  and (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

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
    and membership.status in ('YES', 'MAYBE')
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

revoke all on public.public_profile_directory from public;
revoke all on public.authenticated_active_roster from public;
revoke all on public.public_player_statistics from public;
grant select on public.public_profile_directory to anon, authenticated;
grant select on public.authenticated_active_roster to authenticated;
grant select on public.public_player_statistics to anon, authenticated;

create or replace function public.request_profile_association(p_profile_id uuid)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.account_association_requests;
  profile_name text;
  manager_user_ids uuid[];
  requester_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.current_profile_id() is not null then
    raise exception 'Account is already associated';
  end if;

  select email into requester_email
  from auth.users
  where id = auth.uid();

  if requester_email is not null and exists (
    select 1
    from public.rejected_account_hashes rejected
    where rejected.email_hash =
      encode(extensions.digest(lower(trim(requester_email)), 'sha256'), 'hex')
      and rejected.expires_at > now()
  ) then
    raise exception 'Account temporarily blocked after rejection';
  end if;

  select concat_ws(' ', nome, cognome) into profile_name
  from public.profiles
  where id = p_profile_id
    and user_id is null
    and not exists (
      select 1
      from public.account_association_requests
      where profile_id = p_profile_id
        and status = 'PENDING'
    )
  for update;

  if profile_name is null then
    raise exception 'Profile is not available';
  end if;

  insert into public.account_association_requests (user_id, profile_id)
  values (auth.uid(), p_profile_id)
  returning * into result;

  select array_agg(user_id) into manager_user_ids
  from public.profiles
  where is_manager = true
    and user_id is not null;

  perform public.create_notification(
    'ACCOUNT_ASSOCIATION_REQUEST',
    'Nuova richiesta account',
    profile_name || ' ha richiesto l’associazione del profilo.',
    '/gestione?view=account',
    manager_user_ids,
    true,
    'association-request:' || result.id::text,
    null
  );

  return result;
end;
$$;

revoke all on function public.request_profile_association(uuid)
  from public, anon;
grant execute on function public.request_profile_association(uuid)
  to authenticated;

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
     and m.status in ('YES', 'MAYBE')
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

revoke all on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) from public, anon;
grant execute on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) to authenticated;

drop function if exists public.manager_update_person(
  uuid, uuid, jsonb, jsonb, jsonb
);

create function public.manager_update_person(
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
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Profile not found';
  end if;

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
      training_only = coalesce((p_membership->>'training_only')::boolean, false),
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public Avatar 1oj01fe_0" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_1" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_2" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_3" on storage.objects;
drop policy if exists avatars_owner_manager_select on storage.objects;
drop policy if exists avatars_owner_manager_insert on storage.objects;
drop policy if exists avatars_owner_manager_update on storage.objects;
drop policy if exists avatars_owner_manager_delete on storage.objects;

do $$
declare
  legacy_policy record;
begin
  for legacy_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%avatar%'
        or coalesce(qual, '') ilike '%avatars%'
        or coalesce(with_check, '') ilike '%avatars%'
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      legacy_policy.policyname
    );
  end loop;
end;
$$;

create policy avatars_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

commit;
