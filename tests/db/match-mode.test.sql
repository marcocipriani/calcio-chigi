begin;

select plan(27);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000e01', 'mm-marta@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000e02', 'mm-luca@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000e03', 'mm-bruno@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000e04', 'mm-carlo@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager)
values
  ('10000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e01', 'Marta', 'Manager', true),
  ('10000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000e02', 'Luca', 'Vice', true),
  ('10000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000e03', 'Bruno', 'Bomber', false),
  ('10000000-0000-0000-0000-000000000e04', '00000000-0000-0000-0000-000000000e04', 'Carlo', 'Centrale', false);

insert into public.season_memberships (profile_id, season_id, category, status)
select p.id, s.id, 'PLAYER', 'YES'
from public.profiles p
join public.seasons s on now()::date between s.starts_on and s.ends_on
where p.id::text like '10000000-0000-0000-0000-000000000e0%';

-- Iniziata 150' fa: l'orario previsto di fine (inizio + 2h) è già passato.
insert into public.events (id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato)
values ('40000000-0000-0000-0000-000000000e01', 'PARTITA', now() - interval '150 minutes',
  'Campo test', 'CIRC. CHIGI', 'AVVERSARI', false);

insert into public.official_formations (id, event_id, formation_module, captain_profile_id, published_by)
values ('50000000-0000-0000-0000-000000000e01', '40000000-0000-0000-0000-000000000e01', '4-4-2',
  '10000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000e01');
insert into public.official_formation_players (formation_id, profile_id, player_snapshot, is_starter, position_key)
values
  ('50000000-0000-0000-0000-000000000e01', '10000000-0000-0000-0000-000000000e03', '{}', true, 'ATT1'),
  ('50000000-0000-0000-0000-000000000e01', '10000000-0000-0000-0000-000000000e04', '{}', true, 'CC1');

insert into public.attendance (event_id, profile_id, status)
values
  ('40000000-0000-0000-0000-000000000e01', '10000000-0000-0000-0000-000000000e03', 'PRESENTE'),
  ('40000000-0000-0000-0000-000000000e01', '10000000-0000-0000-0000-000000000e04', 'PRESENTE');

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Un giocatore non avvia la partita.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e03', true);
select throws_ok(
  $$select public.match_start('40000000-0000-0000-0000-000000000e01', 35,
    '{"module":"4-4-2","starters":[{"profile_id":"10000000-0000-0000-0000-000000000e03","position_key":"ATT1"}],"bench":[]}')$$,
  '42501', null, 'players cannot start match mode'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);
select lives_ok(
  $$select public.match_start('40000000-0000-0000-0000-000000000e01', 35,
    '{"module":"4-4-2","starters":[{"profile_id":"10000000-0000-0000-0000-000000000e03","position_key":"ATT1"},{"profile_id":"10000000-0000-0000-0000-000000000e04","position_key":"CC1"}],"bench":[]}')$$,
  'a manager starts the match'
);
select is(
  (select operator_profile_id from public.match_sessions where event_id = '40000000-0000-0000-0000-000000000e01'),
  '10000000-0000-0000-0000-000000000e01'::uuid,
  'the starting manager holds control'
);
select throws_ok(
  $$select public.match_start('40000000-0000-0000-0000-000000000e01', 35, '{"starters":[{"profile_id":"10000000-0000-0000-0000-000000000e03","position_key":"ATT1"}]}')$$,
  'MATCH_ALREADY_STARTED', 'a match starts only once'
);

select lives_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e01', '40000000-0000-0000-0000-000000000e01',
    'GOAL', 1, 12, 0, now(), '10000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000e04', null)$$,
  'the operator records a goal with assist'
);
select lives_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e01', '40000000-0000-0000-0000-000000000e01',
    'GOAL', 1, 12, 0, now(), '10000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000e04', null)$$,
  'resending the same queued goal is harmless'
);
select is(
  (select count(*)::int from public.match_timeline where id = '60000000-0000-0000-0000-000000000e01'),
  1, 'the goal is stored once'
);
select is(
  (select score_ours from public.match_sessions where event_id = '40000000-0000-0000-0000-000000000e01'),
  1, 'our score counts the goal'
);

select lives_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e02', '40000000-0000-0000-0000-000000000e01',
    'GOAL_AGAINST', 1, 20, 0, now(), null, null, null)$$,
  'the operator records an opponent goal'
);
select is(
  (select score_theirs from public.match_sessions where event_id = '40000000-0000-0000-0000-000000000e01'),
  1, 'their score counts the goal'
);

select lives_ok(
  $$select public.match_void('40000000-0000-0000-0000-000000000e01', '60000000-0000-0000-0000-000000000e01')$$,
  'the operator voids the last goal'
);
select is(
  (select score_ours from public.match_sessions where event_id = '40000000-0000-0000-0000-000000000e01'),
  0, 'voiding brings the score back'
);

-- Il vice prende il controllo: il primo telefono non scrive più eventi successivi.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e02', true);
select lives_ok(
  $$select public.match_take_control('40000000-0000-0000-0000-000000000e01')$$,
  'another manager takes control'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);
select throws_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e03', '40000000-0000-0000-0000-000000000e01',
    'YELLOW', 1, 30, 0, now() + interval '30 seconds', '10000000-0000-0000-0000-000000000e04', null, null)$$,
  '42501', null, 'the previous operator cannot record events after the handover'
);
select lives_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e04', '40000000-0000-0000-0000-000000000e01',
    'YELLOW', 1, 25, 0, now() - interval '1 minute', '10000000-0000-0000-0000-000000000e04', null, null)$$,
  'queued events from before the handover are still accepted'
);
select throws_ok(
  $$select public.match_void('40000000-0000-0000-0000-000000000e01', '60000000-0000-0000-0000-000000000e04')$$,
  '42501', null, 'only the current operator can void'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e02', true);
select lives_ok($$select public.match_advance_period('40000000-0000-0000-0000-000000000e01')$$, 'first half ends');
select lives_ok($$select public.match_advance_period('40000000-0000-0000-0000-000000000e01')$$, 'second half starts');

reset role;
select private.chigio_tick();
select is(
  (select count(*)::int from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000e01'),
  0, 'the Chigio waits for the final whistle even past the scheduled end'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e02', true);
select lives_ok(
  $$select public.match_finish('40000000-0000-0000-0000-000000000e01', '{
    "gol_nostri": 1, "gol_avversario": 1, "opponent_own_goals": 1, "unattributed_goals": 0,
    "players": [
      {"profile_id":"10000000-0000-0000-0000-000000000e03","goals":0,"assists":0,"yellow_cards":0,"red_cards":0,"minutes_played":70},
      {"profile_id":"10000000-0000-0000-0000-000000000e04","goals":0,"assists":0,"yellow_cards":1,"red_cards":0,"minutes_played":35}
    ]}')$$,
  'the operator saves the final whistle'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);
select throws_ok(
  $$select public.match_record('60000000-0000-0000-0000-000000000e05', '40000000-0000-0000-0000-000000000e01',
    'YELLOW', 2, 60, 0, now() - interval '2 minutes', '10000000-0000-0000-0000-000000000e03', null, null)$$,
  'P0001', 'MATCH_FINISHED', 'after the final whistle late queued events are refused, stats are already saved'
);

reset role;
select is(
  (select count(*)::int from public.notifications where idempotency_key = 'match-goal:60000000-0000-0000-0000-000000000e01'),
  1, 'the goal sends one push to the squad'
);
select is(
  (select gol_nostri::text || '-' || gol_avversario::text || ' casa ' || gol_casa::text || ' ' || giocata::text
   from public.events where id = '40000000-0000-0000-0000-000000000e01'),
  '1-1 casa 1 true', 'the event gets the result, home side included'
);
select is(
  (select minutes_played from public.match_player_stats
   where event_id = '40000000-0000-0000-0000-000000000e01' and profile_id = '10000000-0000-0000-0000-000000000e03'),
  70, 'player stats keep the minutes played'
);
select is(
  (select status::text from public.event_checkins
   where event_id = '40000000-0000-0000-0000-000000000e01' and profile_id = '10000000-0000-0000-0000-000000000e04'),
  'PRESENT', 'whoever played is checked in'
);

select private.chigio_tick();
select is(
  (select count(*)::int from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000e01'),
  1, 'after the final whistle the Chigio opens'
);

set local role anon;
select is(
  (select string_agg(kind, ',' order by occurred_at, kind) from public.public_match_timeline
   where event_id = '40000000-0000-0000-0000-000000000e01' and kind not like 'PERIOD%'),
  'YELLOW,GOAL_AGAINST', 'anyone follows the live timeline, voided goals excluded'
);

select * from finish();
rollback;
