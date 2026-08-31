begin;

select plan(61);

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
  'NO'
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

update public.events
set fase = case id
  when '20000000-0000-0000-0000-000000000001' then null
  when '20000000-0000-0000-0000-000000000002'
    then 'FASE_2_CALCIATORI'
end
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

insert into public.official_formations (
  event_id,
  formation_module,
  shirt_color,
  captain_profile_id,
  status,
  published_by,
  published_at
)
values (
  '20000000-0000-0000-0000-000000000002',
  '4-4-2',
  'BLU',
  '10000000-0000-0000-0000-000000000001',
  'PUBLISHED',
  '10000000-0000-0000-0000-000000000001',
  '2026-07-28 18:42:00+02'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon cannot query the profiles base table'
);
select ok(
  has_table_privilege(
    'anon',
    'public.public_published_formation_summaries',
    'SELECT'
  ),
  'anon can query the deliberately limited published formation projection'
);
select ok(
  not has_table_privilege('anon', 'public.official_formations', 'SELECT'),
  'anon cannot query private official formation metadata directly'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.official_formation_players',
    'SELECT'
  ),
  'anon cannot query official player rows'
);

set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select event_id
      from public.public_published_formation_summaries
     where event_id = '20000000-0000-0000-0000-000000000002'
       and published_at = '2026-07-28 18:42:00+02'::timestamptz$$,
  array['20000000-0000-0000-0000-000000000002'::uuid],
  'anon sees published event metadata without player rows'
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
  'public statistics do not enumerate archived or unrostered people'
);
select throws_ok(
  $$select * from public.get_player_profile(
    '10000000-0000-0000-0000-000000000002',
    (select id from public.seasons where slug = '2025-2026')
  )$$,
  '42501',
  'permission denied for function get_player_profile',
  'anonymous users cannot call the player detail RPC'
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
select throws_ok(
  $$select * from public.get_player_profile(
    '10000000-0000-0000-0000-000000000002',
    (select id from public.seasons where slug = '2025-2026')
  )$$,
  '42501',
  'Approved account required',
  'unlinked account cannot call the player detail RPC'
);
select results_eq(
  $$select id
      from public.claimable_profile_directory
     where id in (
       '10000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000004'
     )$$,
  array['10000000-0000-0000-0000-000000000004'::uuid],
  'claimable names exclude the archived people'
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
  'manager approval links an unclaimed profile to its account'
);
select results_eq(
  $$select status::text
      from public.season_memberships membership
      join public.seasons season on season.id = membership.season_id
     where membership.profile_id =
       '10000000-0000-0000-0000-000000000003'
       and season.slug = '2026-2027'$$,
  array['NO'::text],
  'account approval never changes the roster status'
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
select results_eq(
  $$select count(*)::bigint
      from public.season_memberships
     where profile_id = '10000000-0000-0000-0000-000000000002'$$,
  array[2::bigint],
  'player reads own season memberships'
);
select results_eq(
  $$select array_agg(key order by key)
      from (
        select jsonb_object_keys(to_jsonb(detail)) as key
        from public.get_player_profile(
          '10000000-0000-0000-0000-000000000001',
          (select id from public.seasons where slug = '2025-2026')
        ) detail
      ) safe_keys$$,
  $$values (array[
    'assists',
    'avatar_url',
    'cognome',
    'goals',
    'jersey_number',
    'mvp',
    'nome',
    'profile_id',
    'red_cards',
    'role',
    'season_id',
    'yellow_cards'
  ]::text[])$$,
  'associated teammate receives only the safe player fields'
);
select results_eq(
  $$select
      profile_id,
      season_id,
      nome,
      cognome,
      role,
      jersey_number,
      goals,
      assists,
      mvp,
      yellow_cards,
      red_cards
    from public.get_player_profile(
      '10000000-0000-0000-0000-000000000001',
      (select id from public.seasons where slug = '2025-2026')
    )$$,
  $$select
      '10000000-0000-0000-0000-000000000001'::uuid,
      id,
      'Mario'::text,
      'Manager'::text,
      'DIFENSORE'::text,
      4,
      0,
      0,
      0,
      0,
      0
    from public.seasons
    where slug = '2025-2026'$$,
  'associated teammate receives the selected season safe profile'
);
select results_eq(
  $$select count(*)::bigint
    from public.get_player_profile(
      '10000000-0000-0000-0000-000000000004',
      (select id from public.seasons where slug = '2025-2026')
    )$$,
  array[0::bigint],
  'player detail cannot enumerate a target outside the season directory'
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
  $$select phone
      from public.profile_private_details
     where profile_id = '10000000-0000-0000-0000-000000000002'$$,
  array['222'::text],
  'manager reads teammate private details through existing table RLS'
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
  'event roster follows the event season and excludes archived people'
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
      event_id, profile_id, goals, assists, yellow_cards, red_cards, updated_by
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      1, 1, 2, 1,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  'match stats accept a present player'
);
select results_eq(
  $$select yellow_cards, red_cards
      from public.match_player_stats
     where event_id = '20000000-0000-0000-0000-000000000001'
       and profile_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values (2, 1)$$,
  'manager records match cards'
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
  event_id, profile_id, goals, assists, yellow_cards, red_cards, updated_by
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    5, 3, 4, 1,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    2, 1, 1, 0,
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
select results_eq(
  $$select
      statistics.phase_key,
      statistics.goals,
      statistics.assists,
      statistics.mvp,
      statistics.yellow_cards,
      statistics.red_cards
    from public.public_player_statistics_by_phase statistics
    join public.events event
      on event.season_id = statistics.season_id
     and event.id = '20000000-0000-0000-0000-000000000001'
    where statistics.profile_id =
      '10000000-0000-0000-0000-000000000002'$$,
  $$values ('FASE_1'::text, 5, 3, 1, 4, 1)$$,
  'legacy null match phases aggregate as FASE_1'
);

insert into public.profiles (
  id, nome, cognome, data_nascita, ruolo, numero_maglia, is_manager, is_staff
)
select
  ('11000000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  'Under',
  format('Test %s', number),
  '2000-01-01',
  case when number = 6 then 'PORTIERE' else 'DIFENSORE' end,
  number,
  false,
  false
from generate_series(1, 6) as number;

insert into public.season_memberships (
  profile_id, season_id, category, role, jersey_number, status
)
select
  profile.id,
  season.id,
  'PLAYER',
  profile.ruolo,
  profile.numero_maglia,
  'YES'
from public.profiles profile
cross join public.seasons season
where profile.id::text like '11000000-0000-0000-0000-%'
  and (now() at time zone 'Europe/Rome')::date
      between season.starts_on and season.ends_on;

select lives_ok(
  $$select public.publish_official_formation(
    '20000000-0000-0000-0000-000000000002',
    '4-4-2',
    'BLU',
    '10000000-0000-0000-0000-000000000001',
    null,
    '{}'::jsonb,
    '[
      {"profile_id":"11000000-0000-0000-0000-000000000001","player_snapshot":{},"is_starter":true,"position_key":"DC1","sort_order":1},
      {"profile_id":"11000000-0000-0000-0000-000000000002","player_snapshot":{},"is_starter":true,"position_key":"DC2","sort_order":2},
      {"profile_id":"11000000-0000-0000-0000-000000000003","player_snapshot":{},"is_starter":true,"position_key":"CC1","sort_order":3},
      {"profile_id":"11000000-0000-0000-0000-000000000004","player_snapshot":{},"is_starter":false,"position_key":"P1","sort_order":4},
      {"profile_id":"11000000-0000-0000-0000-000000000006","player_snapshot":{},"is_starter":true,"position_key":"POR","sort_order":5}
    ]'::jsonb
  )$$,
  'manager can publish with three U35 on field and four called up'
);
select throws_ok(
  $$select public.publish_official_formation(
    '20000000-0000-0000-0000-000000000002',
    '4-4-2',
    'BLU',
    '10000000-0000-0000-0000-000000000001',
    null,
    '{}'::jsonb,
    '[
      {"profile_id":"11000000-0000-0000-0000-000000000001","player_snapshot":{},"is_starter":true,"position_key":"DC1","sort_order":1},
      {"profile_id":"11000000-0000-0000-0000-000000000002","player_snapshot":{},"is_starter":true,"position_key":"DC2","sort_order":2},
      {"profile_id":"11000000-0000-0000-0000-000000000003","player_snapshot":{},"is_starter":true,"position_key":"CC1","sort_order":3},
      {"profile_id":"11000000-0000-0000-0000-000000000004","player_snapshot":{},"is_starter":true,"position_key":"ATT1","sort_order":4}
    ]'::jsonb
  )$$,
  'P0001',
  'U35 quota exceeded: maximum 3 on field and 4 called up',
  'four U35 field players cannot be published'
);
select throws_ok(
  $$select public.publish_official_formation(
    '20000000-0000-0000-0000-000000000002',
    '4-4-2',
    'BLU',
    '10000000-0000-0000-0000-000000000001',
    null,
    '{}'::jsonb,
    '[
      {"profile_id":"11000000-0000-0000-0000-000000000001","player_snapshot":{},"is_starter":true,"position_key":"DC1","sort_order":1},
      {"profile_id":"11000000-0000-0000-0000-000000000002","player_snapshot":{},"is_starter":true,"position_key":"DC2","sort_order":2},
      {"profile_id":"11000000-0000-0000-0000-000000000003","player_snapshot":{},"is_starter":true,"position_key":"CC1","sort_order":3},
      {"profile_id":"11000000-0000-0000-0000-000000000004","player_snapshot":{},"is_starter":false,"position_key":"P1","sort_order":4},
      {"profile_id":"11000000-0000-0000-0000-000000000005","player_snapshot":{},"is_starter":false,"position_key":"P2","sort_order":5}
    ]'::jsonb
  )$$,
  'P0001',
  'U35 quota exceeded: maximum 3 on field and 4 called up',
  'five U35 called up players cannot be published'
);
select throws_ok(
  $$select public.publish_official_formation(
    '20000000-0000-0000-0000-000000000002',
    '4-4-2',
    'BLU',
    '10000000-0000-0000-0000-000000000001',
    null,
    '{}'::jsonb,
    '[
      {"profile_id":"11000000-0000-0000-0000-999999999999","player_snapshot":{},"is_starter":true,"position_key":"DC1","sort_order":1}
    ]'::jsonb
  )$$,
  'P0001',
  'Player is not eligible for this match formation',
  'formation cannot include a profile outside the event roster'
);
set local role service_role;
delete from public.notifications
where type = 'OFFICIAL_FORMATION_PUBLISHED';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.import_historical_player_stats(
    '2025-2026',
    'https://history.test/old',
    '[
      {
        "phase_key": "FASE_1",
        "profile_id": "10000000-0000-0000-0000-000000000001",
        "goals": 1,
        "mvp": 0,
        "yellow_cards": 0,
        "red_cards": 0
      },
      {
        "phase_key": "FASE_1",
        "profile_id": "10000000-0000-0000-0000-000000000002",
        "goals": 9,
        "mvp": 3,
        "yellow_cards": 2,
        "red_cards": 1
      }
    ]'::jsonb
  )$$,
  'service role imports historical phase rows'
);
select results_eq(
  $$select goals, assists, mvp, yellow_cards, red_cards
      from public.public_player_statistics_by_phase statistics
      join public.seasons season on season.id = statistics.season_id
     where season.slug = '2025-2026'
       and statistics.phase_key = 'FASE_1'
       and statistics.profile_id =
         '10000000-0000-0000-0000-000000000002'$$,
  $$values (9, null::integer, 3, 2, 1)$$,
  'historical phase row overrides matching live aggregates'
);
select lives_ok(
  $$select public.import_historical_player_stats(
    '2025-2026',
    'https://history.test/new',
    '[
      {
        "phase_key": "FASE_1",
        "profile_id": "10000000-0000-0000-0000-000000000002",
        "goals": 10,
        "mvp": 4,
        "yellow_cards": 3,
        "red_cards": 1
      }
    ]'::jsonb
  )$$,
  'service role can replace a season from a changed source URL'
);
select results_eq(
  $$select count(*)::bigint, min(source_url)
      from public.historical_player_stats history
      join public.seasons season on season.id = history.season_id
     where season.slug = '2025-2026'$$,
  $$values (1::bigint, 'https://history.test/new'::text)$$,
  'history import replaces the complete season dataset'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  $$select assists
      from public.get_player_profile(
        '10000000-0000-0000-0000-000000000002',
        (select id from public.seasons where slug = '2025-2026')
      )$$,
  $$values (null::integer)$$,
  'season assists remain unavailable when any included phase is historical'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.import_historical_player_stats(
    '2025-2026',
    'https://history.test/null',
    null
  )$$,
  'P0001',
  'Historical rows must be a non-empty JSON array',
  'null historical rows are rejected before replacement'
);
select results_eq(
  $$select count(*)::bigint, min(source_url)
      from public.historical_player_stats history
      join public.seasons season on season.id = history.season_id
     where season.slug = '2025-2026'$$,
  $$values (1::bigint, 'https://history.test/new'::text)$$,
  'rejected null import preserves the existing season dataset'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);

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
select results_eq(
  $$update public.match_player_stats
       set yellow_cards = yellow_cards + 1
     where event_id = '20000000-0000-0000-0000-000000000002'
       and profile_id = '10000000-0000-0000-0000-000000000002'
     returning profile_id$$,
  array[]::uuid[],
  'player cannot write own card totals'
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
