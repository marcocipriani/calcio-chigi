begin;

select plan(36);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'manager@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'player@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'unlinked@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'rejected@test.local', 'authenticated', 'authenticated', now(), now());

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
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    null,
    'Rita', 'Rejected', 'DIFENSORE', 6, false, false
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

insert into public.season_memberships (
  profile_id, season_id, category, role, jersey_number, status
)
select
  '10000000-0000-0000-0000-000000000003',
  season.id,
  'PLAYER',
  'CENTROCAMPISTA',
  8,
  'INTERESTED'
from public.seasons season
where season.slug = '2026-2027';

insert into public.season_memberships (
  profile_id, season_id, category, role, jersey_number, status
)
select
  '10000000-0000-0000-0000-000000000004',
  season.id,
  'PLAYER',
  'DIFENSORE',
  6,
  'YES'
from public.seasons season
where (now() at time zone 'Europe/Rome')::date
      not between season.starts_on and season.ends_on
order by season.starts_on desc
limit 1;

insert into public.events (
  id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato
)
select
  '20000000-0000-0000-0000-000000000001',
  'PARTITA',
  (season.starts_on::timestamp + interval '10 days 21 hours')
    at time zone 'Europe/Rome',
  'Campo test',
  'CIRC. CHIGI',
  'AVVERSARI',
  false
from public.seasons season
where (now() at time zone 'Europe/Rome')::date
      not between season.starts_on and season.ends_on
order by season.starts_on desc
limit 1;

insert into public.events (
  id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato
)
select
  '20000000-0000-0000-0000-000000000002',
  'PARTITA',
  (season.starts_on::timestamp + interval '10 days 21 hours')
    at time zone 'Europe/Rome',
  'Campo test corrente',
  'CIRC. CHIGI',
  'AVVERSARI CORRENTI',
  false
from public.seasons season
where (now() at time zone 'Europe/Rome')::date
      between season.starts_on and season.ends_on
limit 1;

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
select results_eq(
  $$select count(*)::bigint
      from public.public_profile_directory
     where id in (
       '10000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000004'
     )$$,
  array[0::bigint],
  'public directory excludes people outside the active confirmed roster'
);
select results_eq(
  $$select count(*)::bigint
      from public.public_player_statistics
     where profile_id in (
       '10000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000004'
     )$$,
  array[0::bigint],
  'public statistics do not enumerate interested or unrostered people'
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
  $$select count(*)::bigint
      from public.authenticated_active_roster$$,
  array[0::bigint],
  'unlinked account cannot query the extended authenticated roster'
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

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.approve_account_association(
    (
      select id
      from public.account_association_requests
      where user_id = '00000000-0000-0000-0000-000000000003'
    ),
    '10000000-0000-0000-0000-000000000001'
  )$$,
  'manager approval links an interested person account'
);
select results_eq(
  $$select status::text
      from public.season_memberships membership
      join public.seasons season on season.id = membership.season_id
     where membership.profile_id =
       '10000000-0000-0000-0000-000000000003'
       and season.slug = '2026-2027'$$,
  array['PENDING'::text],
  'approved interested person is moved to the confirmation queue'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.rejected_account_hashes (email_hash, expires_at)
values (
  encode(digest('rejected@test.local', 'sha256'), 'hex'),
  now() + interval '30 days'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004',
  true
);
select throws_ok(
  $$select public.request_profile_association(
    '10000000-0000-0000-0000-000000000004'
  )$$,
  'P0001',
  'Account temporarily blocked after rejection',
  'rejected email cannot immediately submit another association request'
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
select results_eq(
  $$select profile_id
      from public.get_event_roster(
        '20000000-0000-0000-0000-000000000001'
      )
     order by profile_id$$,
  array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000004'::uuid
  ],
  'event roster follows the event season and excludes interested people'
);
select results_eq(
  $$select profile_id
      from public.get_event_roster(
        '20000000-0000-0000-0000-000000000002'
      )
     order by profile_id$$,
  array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid
  ],
  'current event roster does not leak people from another season'
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
select lives_ok(
  $$select public.manager_update_person(
      '10000000-0000-0000-0000-000000000002',
      membership.id,
      profile.updated_at,
      membership.updated_at,
      details.updated_at,
      '{"nome":"Piero","cognome":"Player","data_nascita":"1994-06-23","joined_on":"","is_manager":false}',
      '{"category":"PLAYER","status":"YES","role":"ATTACCANTE","staff_function":"","jersey_number":"9","department":"","asi_card_number":"","uniform_size":"","is_external":false,"is_aggregated":false,"training_only":false,"operational_notes":"","next_contact_on":"","registration_status":"TODO","registration_completed_on":""}',
      '{"phone":"222","operational_email":"player@test.local"}'
    )
    from public.season_memberships membership
    join public.seasons season on season.id = membership.season_id
    join public.profiles profile on profile.id = membership.profile_id
    join public.profile_private_details details
      on details.profile_id = membership.profile_id
    where membership.profile_id =
      '10000000-0000-0000-0000-000000000002'
      and season.slug = '2026-2027'$$,
  'manager saves a person with the current row version'
);
select results_eq(
  $$select data_nascita
      from public.profiles
     where id = '10000000-0000-0000-0000-000000000002'$$,
  array['1994-06-23'::date],
  'manager can update the player birth date'
);
select throws_ok(
  $$select public.manager_update_person(
      '10000000-0000-0000-0000-000000000002',
      (
        select membership.id
        from public.season_memberships membership
        join public.seasons season on season.id = membership.season_id
        where membership.profile_id =
          '10000000-0000-0000-0000-000000000002'
          and season.slug = '2026-2027'
      ),
      '2000-01-01 00:00:00+00',
      (
        select membership.updated_at
        from public.season_memberships membership
        join public.seasons season on season.id = membership.season_id
        where membership.profile_id =
          '10000000-0000-0000-0000-000000000002'
          and season.slug = '2026-2027'
      ),
      (
        select details.updated_at
        from public.profile_private_details details
        where details.profile_id =
          '10000000-0000-0000-0000-000000000002'
      ),
      '{"nome":"Piero","cognome":"Player"}',
      '{}',
      '{}'
    )$$,
  '40001',
  'Person changed by another manager',
  'stale manager edit is rejected before overwriting newer data'
);
select throws_ok(
  $$select public.manager_update_person(
      profile.id,
      membership.id,
      profile.updated_at,
      membership.updated_at,
      '2000-01-01 00:00:00+00',
      '{"nome":"Piero","cognome":"Player"}',
      '{}',
      '{}'
    )
    from public.profiles profile
    join public.season_memberships membership
      on membership.profile_id = profile.id
    join public.seasons season on season.id = membership.season_id
    where profile.id = '10000000-0000-0000-0000-000000000002'
      and season.slug = '2026-2027'$$,
  '40001',
  'Person changed by another manager',
  'stale private-details version is rejected before overwriting contacts'
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
select lives_ok(
  $$insert into public.match_awards (
      event_id, profile_id, updated_by
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001'
    )$$,
  'player-of-the-match accepts a present player'
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
select results_eq(
  $$select (
      (select count(*) from public.match_player_stats
        where event_id = '20000000-0000-0000-0000-000000000001'
          and profile_id = '10000000-0000-0000-0000-000000000002')
      +
      (select count(*) from public.match_awards
        where event_id = '20000000-0000-0000-0000-000000000001'
          and profile_id = '10000000-0000-0000-0000-000000000002')
    )::bigint$$,
  array[0::bigint],
  'absent check-in atomically removes match statistics and award'
);

select public.set_event_checkin(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'PRESENT'
);
select public.set_event_checkin(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'PRESENT'
);
insert into public.match_player_stats (
  event_id, profile_id, goals, assists, updated_by
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    5, 3,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    2, 1,
    '10000000-0000-0000-0000-000000000001'
  );
insert into public.match_awards (event_id, profile_id, updated_by)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001'
  );
select results_eq(
  $$select goals, assists, player_of_match
      from public.public_player_statistics
     where profile_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values (2, 1, 1)$$,
  'public player statistics include only events from the active season'
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

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000099',
  true
);
select throws_ok(
  $$select * from public.get_event_roster(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'Approved account required',
  'unlinked account cannot enumerate an event roster'
);
reset role;

select * from finish();
rollback;
