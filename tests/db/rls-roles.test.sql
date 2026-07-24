begin;

select plan(20);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'manager@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'player@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'unlinked@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (
  id, user_id, nome, cognome, ruolo, numero_maglia, is_manager, is_staff
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Mario', 'Manager', 'DIFENSORE', 4, true, false
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Piero', 'Player', 'ATTACCANTE', 9, false, false
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    null,
    'Claudio', 'Claimable', 'CENTROCAMPISTA', 8, false, false
  );

insert into public.profile_private_details (
  profile_id, phone, operational_email
)
values
  ('10000000-0000-0000-0000-000000000001', '111', 'manager@test.local'),
  ('10000000-0000-0000-0000-000000000002', '222', 'player@test.local');

insert into public.season_memberships (
  profile_id, season_id, category, role, jersey_number, status
)
select
  profile_id,
  season.id,
  'PLAYER',
  role,
  jersey,
  'YES'
from (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'DIFENSORE', 4),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'ATTACCANTE', 9)
) input(profile_id, role, jersey)
cross join public.seasons season
where season.slug in ('2025-2026', '2026-2027')
on conflict (profile_id, season_id) do update
set status = excluded.status;

insert into public.events (
  id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato
)
values (
  '20000000-0000-0000-0000-000000000001',
  'PARTITA',
  '2026-09-01 21:00:00+02',
  'Campo test',
  'CIRC. CHIGI',
  'AVVERSARI',
  false
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon cannot query the profiles base table'
);

set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select count(*)::bigint
      from public.public_active_roster
     where id in (
       '10000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000002'
     )$$,
  array[2::bigint],
  'anon sees only the safe public roster view'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);
select results_eq(
  $$select count(*)::bigint
      from public.profiles
     where id = '10000000-0000-0000-0000-000000000003'$$,
  array[0::bigint],
  'unlinked account cannot query profiles'
);
select results_eq(
  $$select id
      from public.claimable_profile_directory
     where id = '10000000-0000-0000-0000-000000000003'$$,
  array['10000000-0000-0000-0000-000000000003'::uuid],
  'unlinked account sees claimable names'
);
select lives_ok(
  $$select public.request_profile_association(
    '10000000-0000-0000-0000-000000000003'
  )$$,
  'unlinked account can request association'
);
select results_eq(
  $$select status::text
      from public.account_association_requests
     where user_id = '00000000-0000-0000-0000-000000000003'$$,
  array['PENDING'::text],
  'association request remains pending'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  $$select id from public.profiles order by id$$,
  array['10000000-0000-0000-0000-000000000002'::uuid],
  'player reads only own base profile'
);
select results_eq(
  $$select phone
      from public.profile_private_details
     where profile_id = '10000000-0000-0000-0000-000000000002'$$,
  array['222'::text],
  'player reads own private details'
);
select throws_ok(
  $$update public.profiles
       set is_manager = true
     where id = '10000000-0000-0000-0000-000000000002'$$,
  'P0001',
  'Only managers can modify protected profile fields',
  'player cannot escalate manager permission'
);
select throws_ok(
  $$update public.profiles
       set ruolo = 'PORTIERE'
     where id = '10000000-0000-0000-0000-000000000002'$$,
  'P0001',
  'Only managers can modify protected profile fields',
  'player cannot change manager-only role'
);
select results_eq(
  $$update public.events
       set luogo = 'Non autorizzato'
     where id = '20000000-0000-0000-0000-000000000001'
     returning id$$,
  array[]::uuid[],
  'player cannot update events'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select count(*)::bigint
      from public.profiles
     where id in (
       '10000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000002',
       '10000000-0000-0000-0000-000000000003'
     )$$,
  array[3::bigint],
  'manager reads all profiles'
);
select lives_ok(
  $$insert into public.payments (
      membership_id, description, amount_due, due_on, created_by
    )
    select m.id, 'Quota test', 50, '2026-09-30',
           '10000000-0000-0000-0000-000000000001'
      from public.season_memberships m
      join public.seasons s on s.id = m.season_id
     where m.profile_id = '10000000-0000-0000-0000-000000000002'
       and s.slug = '2026-2027'$$,
  'manager creates a payment'
);
select throws_ok(
  $$insert into public.match_player_stats (
      event_id, profile_id, goals, assists, updated_by
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      1, 0,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'Match stats require a present player',
  'match stats reject a player without present check-in'
);
select lives_ok(
  $$select public.set_event_checkin(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'PRESENT'
  )$$,
  'manager records official presence'
);
select results_eq(
  $$select status
      from public.attendance
     where event_id = '20000000-0000-0000-0000-000000000001'
       and profile_id = '10000000-0000-0000-0000-000000000002'$$,
  array['PRESENTE'::text],
  'present check-in forces RSVP present'
);
select lives_ok(
  $$insert into public.match_player_stats (
      event_id, profile_id, goals, assists, updated_by
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      1, 1,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  'match stats accept a present player'
);
update public.attendance
set status = 'ASSENTE'
where event_id = '20000000-0000-0000-0000-000000000001'
  and profile_id = '10000000-0000-0000-0000-000000000002';
select public.set_event_checkin(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'ABSENT'
);
select results_eq(
  $$select status
      from public.attendance
     where event_id = '20000000-0000-0000-0000-000000000001'
       and profile_id = '10000000-0000-0000-0000-000000000002'$$,
  array['ASSENTE'::text],
  'absent check-in does not rewrite RSVP'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  $$select count(*)::bigint
      from public.payments payment
      join public.season_memberships membership
        on membership.id = payment.membership_id
     where membership.profile_id =
       '10000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  'player reads own payment'
);
select results_eq(
  $$select count(*)::bigint
      from public.notification_recipients
     where user_id = '00000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  'payment creates canonical in-app notification'
);
reset role;

select * from finish();
rollback;
