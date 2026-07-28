-- Keep public roster roles aligned with the confirmed real-world team roles.
-- Migrations do not carry JWT claims, while the protection triggers require
-- the same service-role claim used by administrative scripts.
select set_config('request.jwt.claim.role', 'service_role', false);

update public.profiles
set
  is_staff = false,
  ruolo = coalesce(ruolo, 'CENTROCAMPISTA')
where id = '9cdd5f23-5b99-4fb6-b7c9-54d7a978a8ff'
  and lower(nome) = 'elio'
  and lower(cognome) in ('dorbolò', 'dorbolo');

update public.season_memberships
set
  category = 'PLAYER',
  role = coalesce(
    role,
    (
      select profile.ruolo
      from public.profiles as profile
      where profile.id = season_memberships.profile_id
    ),
    'CENTROCAMPISTA'
  ),
  staff_function = null
where profile_id = '9cdd5f23-5b99-4fb6-b7c9-54d7a978a8ff'
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = season_memberships.profile_id
      and lower(profile.nome) = 'elio'
      and lower(profile.cognome) in ('dorbolò', 'dorbolo')
  );

update public.profiles
set
  is_staff = true,
  ruolo = null
where id = '65710aa2-96e3-49ad-973e-d4ddbe1b6f8d'
  and lower(nome) = 'maria carla'
  and lower(cognome) = 'menichini';

update public.season_memberships
set
  category = 'STAFF',
  role = null,
  staff_function = 'Presidente'
where profile_id = '65710aa2-96e3-49ad-973e-d4ddbe1b6f8d'
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = season_memberships.profile_id
      and lower(profile.nome) = 'maria carla'
      and lower(profile.cognome) = 'menichini'
  );
