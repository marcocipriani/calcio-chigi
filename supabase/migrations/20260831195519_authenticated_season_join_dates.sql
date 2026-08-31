begin;

-- /statistiche deve calcolare le presenze con la stessa regola della
-- dashboard, che esclude gli allenamenti precedenti all'ingresso in rosa.
-- `profiles.joined_on` è leggibile solo dal manager: questa proiezione ne
-- espone la sola data agli account associati.
create or replace view public.authenticated_season_join_dates
with (security_barrier = true)
as
select
  membership.season_id,
  membership.profile_id,
  profile.joined_on
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
where public.is_current_user_associated()
  and membership.category = 'PLAYER';

-- I default di Supabase concedono tutto ad authenticated sugli oggetti nuovi:
-- qui serve la sola lettura.
revoke all on public.authenticated_season_join_dates
  from public, anon, authenticated;
grant select on public.authenticated_season_join_dates to authenticated;

commit;
