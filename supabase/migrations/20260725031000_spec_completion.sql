-- Complete season-aware event rosters and interested-account onboarding.

begin;

create or replace function public.get_event_roster(p_event_id uuid)
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
  training_only boolean,
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
    membership.training_only,
    membership.department,
    membership.is_external,
    membership.is_aggregated
  from public.events event
  join public.season_memberships membership
    on membership.season_id = event.season_id
  join public.profiles profile
    on profile.id = membership.profile_id
  where event.id = p_event_id
    and membership.status in ('YES', 'MAYBE')
  order by profile.cognome, profile.nome;
end;
$$;

revoke all on function public.get_event_roster(uuid) from public, anon;
grant execute on function public.get_event_roster(uuid)
  to authenticated, service_role;

create or replace function public.approve_account_association(
  p_request_id uuid,
  p_reviewer_profile_id uuid
)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.account_association_requests;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_reviewer_profile_id
      and is_manager = true
  ) then
    raise exception 'Reviewer must be a manager' using errcode = '42501';
  end if;

  select * into request_row
  from public.account_association_requests
  where id = p_request_id
    and status = 'PENDING'
  for update;

  if request_row.id is null then
    raise exception 'Pending association request not found';
  end if;

  update public.profiles
  set user_id = request_row.user_id,
      updated_at = now()
  where id = request_row.profile_id
    and user_id is null;

  if not found then
    raise exception 'Profile is already associated';
  end if;

  update public.season_memberships membership
  set status = 'PENDING',
      last_confirmation_requested_at = null,
      updated_by = p_reviewer_profile_id,
      updated_at = now()
  where membership.profile_id = request_row.profile_id
    and membership.status = 'INTERESTED'
    and membership.season_id = (
      select season.id
      from public.seasons season
      order by season.starts_on desc
      limit 1
    );

  update public.account_association_requests
  set status = 'APPROVED',
      reviewed_at = now(),
      reviewed_by = p_reviewer_profile_id
  where id = request_row.id
  returning * into request_row;

  return request_row;
end;
$$;

revoke all on function public.approve_account_association(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_account_association(uuid, uuid)
  to service_role;

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

commit;
