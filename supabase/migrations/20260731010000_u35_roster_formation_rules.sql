begin;

create or replace view public.public_active_roster
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url,
  m.category,
  m.role,
  m.staff_function,
  m.jersey_number,
  m.status,
  m.training_only,
  s.slug as season_slug,
  case
    when p.data_nascita is null then false
    else date_part(
      'year',
      age((now() at time zone 'Europe/Rome')::date, p.data_nascita)
    ) < 35
  end as is_u35
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

revoke all on public.public_active_roster from public;
grant select on public.public_active_roster to anon, authenticated;

commit;
