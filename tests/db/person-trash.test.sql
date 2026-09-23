begin;

select plan(14);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000b01', 'trash-manager@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000b02', 'trash-anna@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000b03', 'trash-request@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager, is_staff)
values
  ('10000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b01', 'Marta', 'Manager', true, false),
  ('10000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b02', 'Anna', 'Ala', false, false),
  ('10000000-0000-0000-0000-000000000b03', null, 'Carlo', 'Senzaccount', false, false),
  ('10000000-0000-0000-0000-000000000b04', null, 'Dario', 'Recente', false, false);

insert into public.season_memberships (profile_id, season_id, category, status)
select input.profile_id, season.id, 'PLAYER', 'YES'
from (
  values
    ('10000000-0000-0000-0000-000000000b02'::uuid, '2025-2026'),
    ('10000000-0000-0000-0000-000000000b02'::uuid, '2026-2027'),
    ('10000000-0000-0000-0000-000000000b03'::uuid, '2026-2027')
) input(profile_id, slug)
join public.seasons season on season.slug = input.slug;

insert into public.account_association_requests (user_id, profile_id)
values ('00000000-0000-0000-0000-000000000b03', '10000000-0000-0000-0000-000000000b03');

-- Check-in firmato da sé stessi: `checked_in_by` è restrict e non deve
-- bloccare la cancellazione definitiva.
insert into public.events (
  id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato
)
values (
  '40000000-0000-0000-0000-000000000b01', 'ALLENAMENTO',
  now() - interval '40 days', 'Campo test', 'CIRC. CHIGI', 'ALLENAMENTO', false
);
insert into public.event_checkins (event_id, profile_id, status, checked_in_by)
values (
  '40000000-0000-0000-0000-000000000b01',
  '10000000-0000-0000-0000-000000000b02',
  'PRESENT',
  '10000000-0000-0000-0000-000000000b02'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', true);

select throws_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b03')$$,
  '42501',
  null,
  'a player cannot trash people'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

select throws_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b01')$$,
  'P0002',
  null,
  'managers cannot be trashed, not even by themselves'
);

select lives_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b02')$$,
  'a manager trashes a player with an account'
);

select lives_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b03')$$,
  'a manager trashes a player with a pending account request'
);

select lives_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b04')$$,
  'a manager trashes a player with no seasons'
);

select throws_ok(
  $$select public.manager_trash_person('10000000-0000-0000-0000-000000000b02')$$,
  'P0002',
  null,
  'a trashed person cannot be trashed twice'
);

reset role;

select is(
  (select user_id from public.profiles where id = '10000000-0000-0000-0000-000000000b02'),
  null,
  'trashing unlinks the account'
);

select is(
  (
    select count(*)::int
    from public.season_memberships
    where profile_id = '10000000-0000-0000-0000-000000000b02'
      and status <> 'NO'
  ),
  0,
  'trashing archives every season'
);

select is(
  (
    select count(*)::int
    from public.account_association_requests
    where profile_id = '10000000-0000-0000-0000-000000000b03'
  ),
  0,
  'trashing drops association requests so the account can ask again'
);

select is(
  (
    select count(*)::int
    from public.claimable_profile_directory
    where id = '10000000-0000-0000-0000-000000000b04'
  ),
  0,
  'a trashed profile cannot be claimed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

select lives_ok(
  $$select public.manager_restore_person('10000000-0000-0000-0000-000000000b03')$$,
  'a manager restores a trashed person'
);

reset role;

select is(
  (select deleted_at from public.profiles where id = '10000000-0000-0000-0000-000000000b03'),
  null,
  'the restored person leaves the trash'
);

update public.profiles
set deleted_at = now() - interval '31 days'
where id = '10000000-0000-0000-0000-000000000b02';

select private.purge_trashed_profiles();

select is(
  (
    select count(*)::int
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000b02'
  ),
  0,
  'after 30 days the person is deleted with self-signed check-ins'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000b04'
  ),
  1,
  'people trashed less than 30 days ago stay in the trash'
);

select * from finish();

rollback;
