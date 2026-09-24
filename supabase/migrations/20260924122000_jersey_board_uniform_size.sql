begin;

-- Comodo inserire la taglia mentre si assegnano i numeri, invece di dover
-- aprire la scheda persona per ognuno. La colonna va in coda: "or replace"
-- non ammette di reinserire colonne a metà elenco.
create or replace view public.jersey_preference_board
with (security_barrier = true)
as
select
  membership.season_id,
  membership.id as membership_id,
  profile.id as profile_id,
  profile.nome,
  profile.cognome,
  profile.avatar_url,
  membership.role,
  membership.jersey_number,
  previous.jersey_number as previous_jersey_number,
  preference.choices,
  coalesce(preference.no_preference, false) as no_preference,
  preference.updated_at,
  coalesce(preference.updated_by <> membership.profile_id, false)
    as updated_by_manager,
  membership.uniform_size
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
join public.seasons season on season.id = membership.season_id
left join public.jersey_preferences preference
  on preference.membership_id = membership.id
left join lateral (
  select previous_membership.jersey_number
  from public.season_memberships previous_membership
  join public.seasons previous_season
    on previous_season.id = previous_membership.season_id
  where previous_membership.profile_id = membership.profile_id
    and previous_season.ends_on < season.starts_on
    and previous_membership.jersey_number is not null
  order by previous_season.starts_on desc
  limit 1
) previous on true
where public.is_current_user_associated()
  and membership.category = 'PLAYER'
  and membership.status = 'YES';

commit;
