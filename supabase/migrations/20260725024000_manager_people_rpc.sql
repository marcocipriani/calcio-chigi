-- Transactional manager workflow for adding people to a season.

begin;

create or replace function public.manager_create_person(
  p_season_slug text,
  p_nome text,
  p_cognome text,
  p_category public.membership_category,
  p_status public.membership_status,
  p_phone text default null,
  p_role text default null,
  p_staff_function text default null,
  p_training_only boolean default false,
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
    training_only,
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
    coalesce(p_training_only, false),
    p_status,
    public.current_profile_id()
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) from public, anon;
grant execute on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) to authenticated, service_role;

commit;
