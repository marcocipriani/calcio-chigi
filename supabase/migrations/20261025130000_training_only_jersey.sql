-- Solo allenamenti e numero di maglia.
-- Chi fa solo allenamenti non mostra un numero (in app compare "—") e non
-- sceglie preferenze; se prima ne aveva uno, lo tiene bloccato per tutta la
-- stagione: la scheda non lo cambia, la bozza non lo assegna ad altri.
-- Il vincolo di unicità (guard_unique_season_jersey) conta già tutte le
-- membership della stagione, quindi niente doppioni.

create or replace view public.public_season_player_directory
with (security_barrier = true)
as
 SELECT membership.season_id,
    profile.id AS profile_id,
    profile.nome,
    profile.cognome,
    profile.avatar_url,
    membership.role,
    case when membership.status = 'TRAINING_ONLY' then null else membership.jersey_number end AS jersey_number
   FROM (season_memberships membership
     JOIN profiles profile ON ((profile.id = membership.profile_id)))
  WHERE ((membership.category = 'PLAYER'::membership_category) AND ((membership.status <> 'NO'::membership_status) OR (EXISTS ( SELECT 1
           FROM public_player_statistics_by_phase statistics
          WHERE ((statistics.season_id = membership.season_id) AND (statistics.profile_id = membership.profile_id))))));

create or replace view public.authenticated_active_roster
with (security_barrier = true)
as
 SELECT p.id,
    p.nome,
    p.cognome,
    p.avatar_url,
    p.data_nascita,
    m.category,
    m.role,
    m.staff_function,
    case when m.status = 'TRAINING_ONLY' then null else m.jersey_number end AS jersey_number,
    m.status,
    m.department,
    m.is_external,
    m.is_aggregated,
    s.slug AS season_slug
   FROM ((profiles p
     JOIN season_memberships m ON ((m.profile_id = p.id)))
     JOIN seasons s ON ((s.id = m.season_id)))
  WHERE (is_current_user_associated() AND ((((now() AT TIME ZONE 'Europe/Rome'::text))::date >= s.starts_on) AND (((now() AT TIME ZONE 'Europe/Rome'::text))::date <= s.ends_on)) AND (m.status <> 'NO'::membership_status));

CREATE OR REPLACE FUNCTION public.get_event_roster(p_event_id uuid)
 RETURNS TABLE(profile_id uuid, nome text, cognome text, avatar_url text, data_nascita date, category membership_category, role text, staff_function text, jersey_number integer, status membership_status, department text, is_external boolean, is_aggregated boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    -- Solo allenamenti: niente numero da mostrare (lo tiene per la stagione).
    case when membership.status = 'TRAINING_ONLY' then null else membership.jersey_number end,
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

CREATE OR REPLACE FUNCTION public.manager_update_person(p_profile_id uuid, p_membership_id uuid, p_expected_profile_updated_at timestamp with time zone, p_expected_membership_updated_at timestamp with time zone, p_expected_private_updated_at timestamp with time zone, p_profile jsonb, p_membership jsonb, p_private jsonb)
 RETURNS season_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Solo allenamenti: il numero resta bloccato com'era, nessuno lo prende.
      jersey_number = case when p_membership->>'status' = 'TRAINING_ONLY'
        then jersey_number
        else nullif(p_membership->>'jersey_number', '')::integer end,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
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
$function$;

CREATE OR REPLACE FUNCTION public.save_jersey_preferences(p_season_id uuid, p_choices jsonb, p_avoid_numbers integer[], p_no_preference boolean DEFAULT false, p_membership_id uuid DEFAULT NULL::uuid)
 RETURNS jersey_preferences
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  membership_id_value uuid;
  choice jsonb;
  choice_number integer;
  choice_numbers integer[] := array[]::integer[];
  normalized_choices jsonb := '[]'::jsonb;
  normalized_avoid integer[];
  has_preferred boolean := false;
  today date := (now() at time zone 'Europe/Rome')::date;
  saved public.jersey_preferences;
begin
  if public.current_profile_id() is null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_membership_id is not null
     and not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  select membership.id
  into membership_id_value
  from public.season_memberships membership
  join public.seasons season on season.id = membership.season_id
  where membership.season_id = p_season_id
    and (
      membership.id = p_membership_id
      or (
        p_membership_id is null
        and membership.profile_id = public.current_profile_id()
      )
    )
    and membership.category = 'PLAYER'
    and membership.status = 'YES'
    and season.ends_on >= today;

  if membership_id_value is null then
    raise exception 'Nessun posto in rosa attivo per questa stagione'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.jersey_assignment_drafts draft
    where draft.season_id = p_season_id
      and draft.confirmed_at is not null
  ) then
    raise exception 'La scelta dei numeri di questa stagione è conclusa';
  end if;

  if coalesce(p_no_preference, false) then
    p_choices := '[]'::jsonb;
  elsif p_choices is null
     or jsonb_typeof(p_choices) <> 'array'
     or jsonb_array_length(p_choices) not between 1 and 5 then
    raise exception 'Indica da 1 a 5 numeri';
  end if;

  for choice in select value from jsonb_array_elements(p_choices)
  loop
    if jsonb_typeof(choice) <> 'object'
       or jsonb_typeof(choice->'number') <> 'number'
       or (choice->>'level') not in ('PREFERRED', 'ACCEPTABLE') then
      raise exception 'Preferenza non valida';
    end if;

    choice_number := (choice->>'number')::numeric::integer;
    if (choice->>'number')::numeric <> choice_number
       or choice_number not between 1 and 99 then
      raise exception 'I numeri vanno da 1 a 99';
    end if;
    if choice_number = any(choice_numbers) then
      raise exception 'Il numero % è indicato più volte', choice_number;
    end if;

    choice_numbers := choice_numbers || choice_number;
    has_preferred := has_preferred or choice->>'level' = 'PREFERRED';
    normalized_choices := normalized_choices || jsonb_build_array(
      jsonb_build_object('number', choice_number, 'level', choice->>'level')
    );
  end loop;

  if not has_preferred and not coalesce(p_no_preference, false) then
    raise exception 'Serve almeno un numero preferito';
  end if;

  select coalesce(array_agg(distinct avoid_number order by avoid_number), '{}')
  into normalized_avoid
  from unnest(coalesce(p_avoid_numbers, '{}'::integer[])) avoid_number;

  if exists (
    select 1 from unnest(normalized_avoid) avoid_number
    where avoid_number not between 1 and 99
  ) then
    raise exception 'I numeri vanno da 1 a 99';
  end if;
  if cardinality(normalized_avoid) > 10 then
    raise exception 'Puoi escludere al massimo 10 numeri';
  end if;
  if normalized_avoid && choice_numbers then
    raise exception 'Un numero scelto non può essere anche da evitare';
  end if;

  insert into public.jersey_preferences as preference (
    membership_id,
    choices,
    no_preference,
    avoid_numbers,
    updated_by
  )
  values (
    membership_id_value,
    normalized_choices,
    coalesce(p_no_preference, false),
    normalized_avoid,
    public.current_profile_id()
  )
  on conflict (membership_id) do update
  set choices = excluded.choices,
      no_preference = excluded.no_preference,
      updated_by = excluded.updated_by,
      avoid_numbers = excluded.avoid_numbers,
      updated_at = now()
  returning * into saved;

  insert into public.jersey_preference_versions (
    membership_id,
    version_on,
    choices,
    no_preference,
    avoid_numbers,
    updated_by
  )
  values (
    membership_id_value,
    today,
    normalized_choices,
    coalesce(p_no_preference, false),
    normalized_avoid,
    public.current_profile_id()
  )
  on conflict (membership_id, version_on) do update
  set choices = excluded.choices,
      no_preference = excluded.no_preference,
      updated_by = excluded.updated_by,
      avoid_numbers = excluded.avoid_numbers,
      saved_at = now();

  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_jersey_assignments(p_season_id uuid, p_assignments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item jsonb;
  item_membership uuid;
  item_number integer;
  seen_memberships uuid[] := array[]::uuid[];
  seen_numbers integer[] := array[]::integer[];
  normalized jsonb := '[]'::jsonb;
  reserved_number integer;
begin
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assegnazione non valida';
  end if;

  for item in select value from jsonb_array_elements(p_assignments)
  loop
    item_membership := (item->>'membership_id')::uuid;
    item_number := case
      when item->'jersey_number' is null
        or jsonb_typeof(item->'jersey_number') = 'null' then null
      else (item->>'jersey_number')::integer
    end;

    if item_membership is null or not exists (
      select 1
      from public.season_memberships membership
      where membership.id = item_membership
        and membership.season_id = p_season_id
        and membership.category = 'PLAYER'
    ) then
      raise exception 'Giocatore non valido per questa stagione';
    end if;
    -- Solo allenamenti o archiviato: tiene il suo numero, la bozza non lo tocca.
    if exists (
      select 1 from public.season_memberships
      where id = item_membership and status <> 'YES'
    ) then
      continue;
    end if;
    if item_membership = any(seen_memberships) then
      raise exception 'Giocatore indicato più volte';
    end if;
    if item_number is not null then
      if item_number not between 1 and 99 then
        raise exception 'I numeri vanno da 1 a 99';
      end if;
      if item_number = any(seen_numbers) then
        raise exception 'Il numero % è assegnato a più giocatori', item_number;
      end if;
      seen_numbers := seen_numbers || item_number;
    end if;

    seen_memberships := seen_memberships || item_membership;
    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'membership_id', item_membership,
      'jersey_number', item_number
    ));
  end loop;

  select min(membership.jersey_number) into reserved_number
  from public.season_memberships membership
  where membership.season_id = p_season_id
    and membership.status <> 'YES'
    and membership.jersey_number = any(seen_numbers);
  if reserved_number is not null then
    raise exception 'Il numero % è riservato: lo tiene chi fa solo allenamenti o è archiviato', reserved_number;
  end if;

  return normalized;
end;
$function$;
