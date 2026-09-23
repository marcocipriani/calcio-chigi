begin;

select plan(31);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000a01', 'jersey-manager@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000a02', 'jersey-anna@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000a03', 'jersey-bruno@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager, is_staff)
values
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a01', 'Marta', 'Manager', true, false),
  ('10000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000a02', 'Anna', 'Ala', false, false),
  ('10000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03', 'Bruno', 'Bomber', false, false),
  ('10000000-0000-0000-0000-000000000a04', null, 'Carlo', 'Senzaccount', false, false);

-- Storico: nella stagione precedente Anna aveva il 10, Bruno il 7.
insert into public.season_memberships (
  id, profile_id, season_id, category, jersey_number, status
)
select input.id, input.profile_id, season.id, 'PLAYER', input.jersey, 'YES'
from (
  values
    ('20000000-0000-0000-0000-000000000a02'::uuid, '10000000-0000-0000-0000-000000000a02'::uuid, 10, '2025-2026'),
    ('20000000-0000-0000-0000-000000000a03'::uuid, '10000000-0000-0000-0000-000000000a03'::uuid, 7, '2025-2026'),
    ('30000000-0000-0000-0000-000000000a02'::uuid, '10000000-0000-0000-0000-000000000a02'::uuid, 10, '2026-2027'),
    ('30000000-0000-0000-0000-000000000a03'::uuid, '10000000-0000-0000-0000-000000000a03'::uuid, 7, '2026-2027'),
    ('30000000-0000-0000-0000-000000000a04'::uuid, '10000000-0000-0000-0000-000000000a04'::uuid, null, '2026-2027')
) input(id, profile_id, jersey, slug)
join public.seasons season on season.slug = input.slug;

-- Le membership si modificano solo da manager o service_role.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$update public.season_memberships
      set jersey_number = 7
    where id = '30000000-0000-0000-0000-000000000a04'$$,
  '23505',
  null,
  'a jersey number is unique within a season'
);

select lives_ok(
  $$update public.season_memberships
      set uniform_size = 'M'
    where id = '30000000-0000-0000-0000-000000000a03'$$,
  'updates that keep the number are not rechecked'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', true);

select lives_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 7, "level": "PREFERRED"}, {"number": 14, "level": "ACCEPTABLE"}]',
      array[13, 17]
    )$$,
  'a player saves ranked preferences and numbers to avoid'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 14, "level": "ACCEPTABLE"}]',
      '{}'
    )$$,
  'P0001',
  'Serve almeno un numero preferito',
  'at least one preferred number is required'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 0, "level": "PREFERRED"}]',
      '{}'
    )$$,
  'P0001',
  'I numeri vanno da 1 a 99',
  'numbers range from 1 to 99'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 1, "level": "PREFERRED"}, {"number": 2, "level": "PREFERRED"}, {"number": 3, "level": "PREFERRED"}, {"number": 4, "level": "PREFERRED"}, {"number": 5, "level": "PREFERRED"}, {"number": 6, "level": "PREFERRED"}]',
      '{}'
    )$$,
  'P0001',
  'Indica da 1 a 5 numeri',
  'at most five numbers are accepted'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 7, "level": "PREFERRED"}]',
      array[7]
    )$$,
  'P0001',
  'Un numero scelto non può essere anche da evitare',
  'a chosen number cannot also be avoided'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2025-2026'),
      '[{"number": 7, "level": "PREFERRED"}]',
      '{}'
    )$$,
  '42501',
  null,
  'preferences cannot be saved for a finished season'
);

select lives_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 7, "level": "PREFERRED"}, {"number": 22, "level": "ACCEPTABLE"}]',
      array[13]
    )$$,
  'a player can change preferences again on the same day'
);

select is(
  (select count(*)::integer from public.jersey_preference_versions),
  1,
  'saves on the same day share one daily version'
);

select is(
  (select choices->1->>'number' from public.jersey_preference_versions),
  '22',
  'the daily version keeps the last save of the day'
);

select throws_ok(
  $$insert into public.jersey_preferences (membership_id, choices)
    values ('30000000-0000-0000-0000-000000000a03', '[{"number": 9, "level": "PREFERRED"}]')$$,
  '42501',
  null,
  'preferences are written only through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a03', true);

select is(
  (select choices->0->>'number'
     from public.jersey_preference_board board
     join public.seasons season on season.id = board.season_id
    where board.profile_id = '10000000-0000-0000-0000-000000000a02'
      and season.slug = '2026-2027'),
  '7',
  'other players see chosen numbers on the board'
);

select is(
  (select previous_jersey_number
     from public.jersey_preference_board board
     join public.seasons season on season.id = board.season_id
    where board.profile_id = '10000000-0000-0000-0000-000000000a02'
      and season.slug = '2026-2027'),
  10,
  'the board shows last season''s number'
);

select is(
  (select count(*)::integer from public.jersey_preferences),
  0,
  'numbers to avoid stay private to the player and managers'
);

select throws_ok(
  $$select public.publish_jersey_draft(
      (select id from public.seasons where slug = '2026-2027'),
      '[]'
    )$$,
  '42501',
  null,
  'only managers publish drafts'
);

select lives_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      null,
      array[13],
      true
    )$$,
  'a player can declare no preference'
);

select is(
  (select jsonb_array_length(choices) || ':' || no_preference::text
     from public.jersey_preference_board board
     join public.seasons season on season.id = board.season_id
    where board.profile_id = '10000000-0000-0000-0000-000000000a03'
      and season.slug = '2026-2027'),
  '0:true',
  'no preference is stored without numbers and shown on the board'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 9, "level": "PREFERRED"}]',
      '{}',
      false,
      '30000000-0000-0000-0000-000000000a02'
    )$$,
  '42501',
  null,
  'players cannot save preferences for someone else'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);

select is(
  (select count(*)::integer from public.jersey_preferences),
  2,
  'managers read every preference'
);

select lives_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 5, "level": "PREFERRED"}]',
      '{}',
      false,
      '30000000-0000-0000-0000-000000000a04'
    )$$,
  'a manager saves preferences on behalf of a player'
);

select is(
  (select array_agg(updated_by_manager order by profile_id)
     from public.jersey_preference_board board
     join public.seasons season on season.id = board.season_id
    where season.slug = '2026-2027'),
  array[false, false, true],
  'the board flags preferences entered by a manager'
);

select throws_ok(
  $$select public.publish_jersey_draft(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"membership_id": "30000000-0000-0000-0000-000000000a02", "jersey_number": 7},
        {"membership_id": "30000000-0000-0000-0000-000000000a03", "jersey_number": 7}]'
    )$$,
  'P0001',
  'Il numero 7 è assegnato a più giocatori',
  'a draft cannot repeat a number'
);

select throws_ok(
  $$select public.confirm_jersey_draft(
      (select id from public.seasons where slug = '2026-2027')
    )$$,
  'P0001',
  'Pubblica prima la bozza',
  'confirmation requires a published draft'
);

-- Scambio: Anna 10 → 7, Bruno 7 → 10.
select lives_ok(
  $$select public.publish_jersey_draft(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"membership_id": "30000000-0000-0000-0000-000000000a02", "jersey_number": 7},
        {"membership_id": "30000000-0000-0000-0000-000000000a03", "jersey_number": 10},
        {"membership_id": "30000000-0000-0000-0000-000000000a04", "jersey_number": null}]'
    )$$,
  'a manager publishes a draft'
);

select is(
  (select count(*)::integer
     from public.notification_recipients recipient
     join public.notifications notification
       on notification.id = recipient.notification_id
    where notification.type = 'JERSEY_NUMBERS'),
  2,
  'publishing notifies players with an account'
);

select lives_ok(
  $$select public.confirm_jersey_draft(
      (select id from public.seasons where slug = '2026-2027')
    )$$,
  'a manager confirms the published draft, swaps included'
);

select is(
  (select array_agg(jersey_number order by profile_id)
     from public.season_memberships membership
     join public.seasons season on season.id = membership.season_id
    where season.slug = '2026-2027'),
  array[7, 10, null]::integer[],
  'confirmed numbers are written to the season memberships'
);

select is(
  (select array_agg(jersey_number order by profile_id)
     from public.season_memberships membership
     join public.seasons season on season.id = membership.season_id
    where season.slug = '2025-2026'),
  array[10, 7]::integer[],
  'previous seasons keep their numbers as history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', true);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[{"number": 9, "level": "PREFERRED"}]',
      '{}'
    )$$,
  'P0001',
  'La scelta dei numeri di questa stagione è conclusa',
  'preferences are locked once the numbers are confirmed'
);

select throws_ok(
  $$select public.save_jersey_preferences(
      (select id from public.seasons where slug = '2026-2027'),
      '[]',
      '{}'
    )$$,
  'P0001',
  'La scelta dei numeri di questa stagione è conclusa',
  'the lock is checked before validating the input'
);

select * from finish();

rollback;
