begin;

select plan(36);

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
  ('10000000-0000-0000-0000-000000000e04', '00000000-0000-0000-0000-000000000e04', 'Carlo', 'Centrale', false),
  -- In formazione ma poi uscito dalla rosa: senza membership.
  ('10000000-0000-0000-0000-000000000e05', null, 'Franco', 'Fuorirosa', false);

insert into public.season_memberships (profile_id, season_id, category, status)
select p.id, s.id, 'PLAYER', 'YES'
from public.profiles p
join public.seasons s on now()::date between s.starts_on and s.ends_on
where p.id::text like '10000000-0000-0000-0000-000000000e0%'
  and p.id <> '10000000-0000-0000-0000-000000000e05';

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
      {"profile_id":"10000000-0000-0000-0000-000000000e04","goals":0,"assists":0,"yellow_cards":1,"red_cards":0,"minutes_played":35},
      {"profile_id":"10000000-0000-0000-0000-000000000e05","goals":0,"assists":0,"yellow_cards":0,"red_cards":0,"minutes_played":10}
    ]}')$$,
  'the operator saves the final whistle, even with a player who left the roster'
);
select is(
  (select count(*)::int from public.match_player_stats where event_id = '40000000-0000-0000-0000-000000000e01'),
  2, 'who left the roster is skipped, the others are saved'
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

-- Correzione del riepilogo a partita chiusa.
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e03', true);
select throws_ok(
  $$select public.match_update_summary('40000000-0000-0000-0000-000000000e01', '{"gol_nostri":1,"gol_avversario":1,"players":[]}')$$,
  '42501', null, 'players cannot correct the summary'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);
select lives_ok(
  $$select public.match_update_summary('40000000-0000-0000-0000-000000000e01', '{
    "gol_nostri": 2, "gol_avversario": 1, "opponent_own_goals": 1, "unattributed_goals": 0,
    "players": [
      {"profile_id":"10000000-0000-0000-0000-000000000e03","goals":1,"assists":0,"yellow_cards":0,"red_cards":0,"minutes_played":70},
      {"profile_id":"10000000-0000-0000-0000-000000000e04","goals":0,"assists":1,"yellow_cards":1,"red_cards":0,"minutes_played":30}
    ]}')$$,
  'any manager corrects the summary after the final whistle'
);
reset role;
select is(
  (select gol_nostri::text || ' ' || (select minutes_played from public.match_player_stats
     where event_id = e.id and profile_id = '10000000-0000-0000-0000-000000000e04')::text
   from public.events e where e.id = '40000000-0000-0000-0000-000000000e01'),
  '2 30', 'the correction rewrites result and minutes'
);

-- Risultato omologato dal sync (o dalla pagina torneo): il "Finale" lo segue.
update public.events set gol_casa = 0, gol_ospite = 3 where id = '40000000-0000-0000-0000-000000000e01';
select is(
  (select score_ours::text || '-' || score_theirs::text from public.match_sessions
   where event_id = '40000000-0000-0000-0000-000000000e01'),
  '0-3', 'a finished match shows the event result from wherever it comes'
);

-- Partita dimenticata aperta: dopo 4 ore la chiude il tick del Chigio d'Oro.
insert into public.events (id, tipo, data_ora, luogo, squadra_casa, squadra_ospite, cancellato)
values ('40000000-0000-0000-0000-000000000e02', 'PARTITA', now() - interval '250 minutes',
  'Campo test', 'CIRC. CHIGI', 'DIMENTICATI', false);
insert into public.attendance (event_id, profile_id, status)
values ('40000000-0000-0000-0000-000000000e02', '10000000-0000-0000-0000-000000000e03', 'PRESENTE');
insert into public.match_sessions (event_id, status, period_minutes, period_started_at, lineup, operator_profile_id, created_at)
values ('40000000-0000-0000-0000-000000000e02', 'SECOND_HALF', 35, now() - interval '195 minutes',
  '{"module":"4-4-2","starters":[{"profile_id":"10000000-0000-0000-0000-000000000e03","position_key":"ATT1"}],"bench":[]}',
  '10000000-0000-0000-0000-000000000e01', now() - interval '245 minutes');
insert into public.match_timeline (id, event_id, kind, period, minute, occurred_at, profile_id)
values
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000e02', 'PERIOD_START', 1, 0, now() - interval '245 minutes', null),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000e02', 'GOAL', 1, 15, now() - interval '230 minutes', '10000000-0000-0000-0000-000000000e03'),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000e02', 'PERIOD_END', 1, 35, now() - interval '210 minutes', null),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000e02', 'PERIOD_START', 2, 35, now() - interval '195 minutes', null);

select private.chigio_tick();
select is(
  (select status || ' ' || (finished_at = now() - interval '160 minutes')::text
   from public.match_sessions where event_id = '40000000-0000-0000-0000-000000000e02'),
  'FINISHED true', 'after 4 hours the match closes itself when the second half was due to end'
);
select is(
  (select gol_nostri::text || '-' || gol_avversario::text || ' ' || giocata::text
   from public.events where id = '40000000-0000-0000-0000-000000000e02'),
  '1-0 true', 'the result comes from the timeline'
);
select is(
  (select goals::text || ' goal ' || minutes_played::text || ' min' from public.match_player_stats
   where event_id = '40000000-0000-0000-0000-000000000e02' and profile_id = '10000000-0000-0000-0000-000000000e03'),
  '1 goal 70 min', 'stats and minutes come from the timeline'
);
select is(
  (select count(*)::int from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000e02'),
  1, 'the Chigio d''Oro opens in the same tick'
);

set local role anon;
select is(
  (select string_agg(kind, ',' order by occurred_at, kind) from public.public_match_timeline
   where event_id = '40000000-0000-0000-0000-000000000e01' and kind not like 'PERIOD%'),
  'YELLOW,GOAL_AGAINST', 'anyone follows the live timeline, voided goals excluded'
);

select * from finish();
rollback;
