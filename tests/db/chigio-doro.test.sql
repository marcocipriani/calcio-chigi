begin;

select plan(20);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000d01', 'chigio-manager@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d02', 'chigio-anna@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d03', 'chigio-bruno@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d04', 'chigio-carlo@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d05', 'chigio-dario@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d07', 'chigio-sara@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager)
values
  ('10000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000d01', 'Marta', 'Manager', true),
  ('10000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d02', 'Anna', 'Ala', false),
  ('10000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d03', 'Bruno', 'Bomber', false),
  ('10000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-000000000d04', 'Carlo', 'Centrale', false),
  ('10000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-000000000d05', 'Dario', 'Spettatore', false),
  ('10000000-0000-0000-0000-000000000d06', null, 'Ugo', 'Assente', false);

insert into public.profiles (id, user_id, nome, cognome, is_manager, is_staff)
values ('10000000-0000-0000-0000-000000000d07', null, 'Sara', 'Staff', false, true);

insert into public.season_memberships (profile_id, season_id, category, status)
select p.id, s.id, 'PLAYER', 'YES'
from public.profiles p
join public.seasons s on now()::date between s.starts_on and s.ends_on
where p.id::text like '10000000-0000-0000-0000-000000000d0%';

-- Partita appena finita e una che finisce tra 10 minuti (fine = inizio + 2h).
insert into public.events (id, tipo, data_ora, data_fine_ora, luogo, squadra_casa, squadra_ospite, cancellato)
values
  ('40000000-0000-0000-0000-000000000d01', 'PARTITA', now() - interval '90 minutes', now() - interval '1 minute', 'Campo test', 'AVVERSARI', 'CIRC. CHIGI', false),
  ('40000000-0000-0000-0000-000000000d02', 'PARTITA', now() - interval '110 minutes', null, 'Campo test', 'CIRC. CHIGI', 'ALTRI', false);

insert into public.official_formations (id, event_id, formation_module, captain_profile_id, published_by)
values ('50000000-0000-0000-0000-000000000d01', '40000000-0000-0000-0000-000000000d01', '1-2-1',
  '10000000-0000-0000-0000-000000000d03', '10000000-0000-0000-0000-000000000d01');

insert into public.official_formation_players (formation_id, profile_id, player_snapshot, is_starter)
select '50000000-0000-0000-0000-000000000d01', p, '{}'::jsonb, false
from unnest(array[
  '10000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d02',
  '10000000-0000-0000-0000-000000000d03', '10000000-0000-0000-0000-000000000d04',
  '10000000-0000-0000-0000-000000000d06'
]::uuid[]) p;

insert into public.event_checkins (event_id, profile_id, status, checked_in_by)
select '40000000-0000-0000-0000-000000000d01', p, s::public.event_checkin_status, '10000000-0000-0000-0000-000000000d01'
from (values
  ('10000000-0000-0000-0000-000000000d01'::uuid, 'PRESENT'),
  ('10000000-0000-0000-0000-000000000d02'::uuid, 'PRESENT'),
  ('10000000-0000-0000-0000-000000000d03'::uuid, 'PRESENT'),
  ('10000000-0000-0000-0000-000000000d04'::uuid, 'PRESENT'),
  ('10000000-0000-0000-0000-000000000d06'::uuid, 'ABSENT'),
  ('10000000-0000-0000-0000-000000000d07'::uuid, 'PRESENT')
) v(p, s);

insert into public.attendance (event_id, profile_id, status)
select '40000000-0000-0000-0000-000000000d01', p, s
from (values
  ('10000000-0000-0000-0000-000000000d01'::uuid, 'PRESENTE'),
  ('10000000-0000-0000-0000-000000000d02'::uuid, 'PRESENTE'),
  ('10000000-0000-0000-0000-000000000d03'::uuid, 'PRESENTE'),
  ('10000000-0000-0000-0000-000000000d04'::uuid, 'PRESENTE'),
  ('10000000-0000-0000-0000-000000000d05'::uuid, 'INFORTUNATO_PRESENTE'),
  ('10000000-0000-0000-0000-000000000d07'::uuid, 'INFORTUNATO_PRESENTE')
) v(p, s);

select private.chigio_tick();

select is(
  (select voters_total from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000d01'),
  6,
  'poll opens with players and spectators as voters, even without an account'
);
select is(
  (select count(*)::int from public.chigio_poll_candidates where event_id = '40000000-0000-0000-0000-000000000d01'),
  4,
  'only non-staff players checked in PRESENT are candidates'
);
select ok(
  exists (select 1 from public.notifications where idempotency_key = 'chigio-open:40000000-0000-0000-0000-000000000d01'),
  'opening notifies voters'
);
select ok(
  exists (select 1 from public.notifications where idempotency_key = 'chigio-checkin-reminder:40000000-0000-0000-0000-000000000d02'),
  'managers get a check-in reminder before the end of the match'
);
select ok(
  not exists (select 1 from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000d02'),
  'a match not yet over has no poll'
);

-- Sara si registra dopo l'apertura: può votare lo stesso (collegata dal manager).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);
update public.profiles set user_id = '00000000-0000-0000-0000-000000000d07'
where id = '10000000-0000-0000-0000-000000000d07';

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Anna
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d02', true);
select throws_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d02')$$,
  '22023', null, 'self vote is rejected'
);
select throws_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d06')$$,
  '22023', null, 'players not checked in cannot be voted'
);
select throws_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d03',
    array['10000000-0000-0000-0000-000000000d03']::uuid[])$$,
  '22023', null, 'top and applause must be different people'
);
select lives_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d04')$$,
  'a voter can vote'
);
select lives_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d03',
    array['10000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d04']::uuid[])$$,
  'a voter can change the vote'
);
select is(
  (select ballots_count from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000d01'),
  1,
  'changing the vote does not count twice'
);
select throws_ok(
  $$select public.close_chigio_poll('40000000-0000-0000-0000-000000000d01')$$,
  '42501', null, 'players cannot close the poll'
);

-- Marta (manager): niente schede altrui, niente risultati prima della chiusura.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);
select is_empty($$select * from public.chigio_ballots$$, 'managers cannot read other ballots');
select is_empty($$select * from public.chigio_results$$, 'no results while the poll is open');
select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d04',
  array['10000000-0000-0000-0000-000000000d03']::uuid[]);

-- Bruno, Carlo, Dario: 🔝 Bruno 2 (Anna, Carlo), Carlo 2 (Marta, Bruno), 👏 Bruno 2, Carlo 1.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d03', true);
select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d04',
  array['10000000-0000-0000-0000-000000000d02']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d04', true);
select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d03');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d05', true);
select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d02',
  array['10000000-0000-0000-0000-000000000d03']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d07', true);
select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d01');

select is(
  (select closed_reason from public.chigio_polls where event_id = '40000000-0000-0000-0000-000000000d01'),
  'ALL_VOTED',
  'the poll closes when everyone voted'
);
select results_eq(
  $$select profile_id from public.chigio_results where event_id = '40000000-0000-0000-0000-000000000d01' and is_winner$$,
  $$values ('10000000-0000-0000-0000-000000000d03'::uuid)$$,
  'tie on 🔝 is broken by 👏'
);
select throws_ok(
  $$select public.submit_chigio_vote('40000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d03')$$,
  'P0001', null, 'no votes after closing'
);
select results_eq(
  $$select wins, tops, applause from public.chigio_season_stats where profile_id = '10000000-0000-0000-0000-000000000d03'$$,
  $$values (1, 2, 2)$$,
  'season stats aggregate wins, 🔝 and 👏'
);

reset role;
select ok(
  exists (select 1 from public.notifications where idempotency_key = 'chigio-closed:40000000-0000-0000-0000-000000000d01'),
  'closing notifies the winner'
);

set local role anon;
select throws_ok($$select * from public.chigio_results$$, '42501', null, 'anon cannot read results');

select * from finish();
rollback;
