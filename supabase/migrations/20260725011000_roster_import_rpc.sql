-- Transactional one-time import for Rosa_Squadra_2026-27.xlsx.

create or replace function public.import_roster_plan(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  item jsonb;
  profile_id_value uuid;
  current_season_id uuid;
  history_season_id uuid;
  created_count integer := 0;
  matched_count integer := 0;
  imported_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_plan->'people') <> 'array' then
    raise exception 'Import plan people must be an array';
  end if;

  select id into current_season_id
  from public.seasons
  where slug = p_plan->>'seasonSlug';

  select id into history_season_id
  from public.seasons
  where slug = p_plan->>'historySeasonSlug';

  if current_season_id is null or history_season_id is null then
    raise exception 'Import seasons are not configured';
  end if;

  for item in select value from jsonb_array_elements(p_plan->'people')
  loop
    profile_id_value := nullif(item->>'existingProfileId', '')::uuid;

    if profile_id_value is null then
      insert into public.profiles (
        nome,
        cognome,
        data_nascita,
        avatar_url,
        joined_on
      )
      values (
        item #>> '{profile,nome}',
        item #>> '{profile,cognome}',
        nullif(item #>> '{profile,data_nascita}', '')::date,
        nullif(item #>> '{profile,avatar_url}', ''),
        null
      )
      returning id into profile_id_value;
      created_count := created_count + 1;
    else
      update public.profiles p
      set nome = coalesce(nullif(trim(p.nome), ''), item #>> '{profile,nome}'),
          cognome = coalesce(nullif(trim(p.cognome), ''), item #>> '{profile,cognome}'),
          data_nascita = coalesce(
            p.data_nascita,
            nullif(item #>> '{profile,data_nascita}', '')::date
          ),
          avatar_url = coalesce(
            nullif(trim(p.avatar_url), ''),
            nullif(item #>> '{profile,avatar_url}', '')
          )
      where p.id = profile_id_value;

      if not found then
        raise exception 'Existing profile % not found', profile_id_value;
      end if;
      matched_count := matched_count + 1;
    end if;

    insert into public.profile_private_details (
      profile_id,
      phone,
      operational_email,
      tax_code,
      nationality,
      birth_city,
      residence_city,
      address,
      postal_code
    )
    values (
      profile_id_value,
      nullif(item #>> '{private,phone}', ''),
      nullif(item #>> '{private,operational_email}', ''),
      upper(nullif(item #>> '{private,tax_code}', '')),
      nullif(item #>> '{private,nationality}', ''),
      nullif(item #>> '{private,birth_city}', ''),
      nullif(item #>> '{private,residence_city}', ''),
      nullif(item #>> '{private,address}', ''),
      nullif(item #>> '{private,postal_code}', '')
    )
    on conflict (profile_id) do update
    set phone = coalesce(public.profile_private_details.phone, excluded.phone),
        operational_email = coalesce(
          public.profile_private_details.operational_email,
          excluded.operational_email
        ),
        tax_code = coalesce(public.profile_private_details.tax_code, excluded.tax_code),
        nationality = coalesce(
          public.profile_private_details.nationality,
          excluded.nationality
        ),
        birth_city = coalesce(
          public.profile_private_details.birth_city,
          excluded.birth_city
        ),
        residence_city = coalesce(
          public.profile_private_details.residence_city,
          excluded.residence_city
        ),
        address = coalesce(public.profile_private_details.address, excluded.address),
        postal_code = coalesce(
          public.profile_private_details.postal_code,
          excluded.postal_code
        );

    if item->'historyMembership' is not null
       and item->'historyMembership' <> 'null'::jsonb then
      insert into public.season_memberships (
        profile_id,
        season_id,
        category,
        role,
        staff_function,
        jersey_number,
        uniform_size,
        asi_card_number,
        department,
        is_external,
        is_aggregated,
        training_only,
        status
      )
      values (
        profile_id_value,
        history_season_id,
        (item #>> '{historyMembership,category}')::public.membership_category,
        nullif(item #>> '{historyMembership,role}', ''),
        nullif(item #>> '{historyMembership,staff_function}', ''),
        nullif(item #>> '{historyMembership,jersey_number}', '')::integer,
        nullif(item #>> '{historyMembership,uniform_size}', ''),
        nullif(item #>> '{historyMembership,asi_card_number}', ''),
        nullif(item #>> '{historyMembership,department}', ''),
        coalesce((item #>> '{historyMembership,is_external}')::boolean, false),
        coalesce((item #>> '{historyMembership,is_aggregated}')::boolean, false),
        false,
        'YES'
      )
      on conflict (profile_id, season_id) do update
      set category = excluded.category,
          role = excluded.role,
          staff_function = excluded.staff_function,
          jersey_number = excluded.jersey_number,
          uniform_size = excluded.uniform_size,
          asi_card_number = excluded.asi_card_number,
          department = excluded.department,
          is_external = excluded.is_external,
          is_aggregated = excluded.is_aggregated,
          status = excluded.status;
    end if;

    insert into public.season_memberships (
      profile_id,
      season_id,
      category,
      role,
      staff_function,
      jersey_number,
      uniform_size,
      asi_card_number,
      department,
      is_external,
      is_aggregated,
      training_only,
      operational_notes,
      status
    )
    values (
      profile_id_value,
      current_season_id,
      (item #>> '{membership,category}')::public.membership_category,
      nullif(item #>> '{membership,role}', ''),
      nullif(item #>> '{membership,staff_function}', ''),
      nullif(item #>> '{membership,jersey_number}', '')::integer,
      nullif(item #>> '{membership,uniform_size}', ''),
      nullif(item #>> '{membership,asi_card_number}', ''),
      nullif(item #>> '{membership,department}', ''),
      coalesce((item #>> '{membership,is_external}')::boolean, false),
      coalesce((item #>> '{membership,is_aggregated}')::boolean, false),
      coalesce((item #>> '{membership,training_only}')::boolean, false),
      nullif(item #>> '{membership,operational_notes}', ''),
      (item #>> '{membership,status}')::public.membership_status
    )
    on conflict (profile_id, season_id) do update
    set category = excluded.category,
        role = excluded.role,
        staff_function = excluded.staff_function,
        jersey_number = excluded.jersey_number,
        uniform_size = excluded.uniform_size,
        asi_card_number = excluded.asi_card_number,
        department = excluded.department,
        is_external = excluded.is_external,
        is_aggregated = excluded.is_aggregated,
        training_only = excluded.training_only,
        operational_notes = excluded.operational_notes,
        status = excluded.status;

    imported_count := imported_count + 1;
  end loop;

  return jsonb_build_object(
    'imported', imported_count,
    'created', created_count,
    'matched', matched_count,
    'profilesTotal', (select count(*) from public.profiles),
    'memberships2026', (
      select count(*)
      from public.season_memberships
      where season_id = current_season_id
    )
  );
end;
$$;

revoke all on function public.import_roster_plan(jsonb) from public;
grant execute on function public.import_roster_plan(jsonb) to service_role;
