begin;
select plan(8);

insert into public.crono_chigio_tests (tested_on, results)
select '2026-11-12', jsonb_agg(jsonb_build_object('name', 'Test ' || n, 'first', 700, 'split', 300, 'total', 650, 'incompleteWarmup', false))
from generate_series(1, 14) n;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
('00000000-0000-0000-0000-000000000f01', 'crono-active@test.local', 'authenticated', 'authenticated', now(), now()),
('00000000-0000-0000-0000-000000000f02', 'crono-archived@test.local', 'authenticated', 'authenticated', now(), now()),
('00000000-0000-0000-0000-000000000f03', 'crono-unassociated@test.local', 'authenticated', 'authenticated', now(), now());
insert into public.profiles (id, user_id, nome, cognome) values
('10000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000f01', 'Test', 'Active'),
('10000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000f02', 'Test', 'Archived');
insert into public.seasons (id, slug, name, starts_on, ends_on) values
('20000000-0000-0000-0000-000000000f01', '2099-2100', 'Test Crono', '2099-08-01', '2100-07-31');
insert into public.season_memberships (profile_id, season_id, category, status) values
('10000000-0000-0000-0000-000000000f01', '20000000-0000-0000-0000-000000000f01', 'PLAYER', 'YES'),
('10000000-0000-0000-0000-000000000f02', '20000000-0000-0000-0000-000000000f01', 'PLAYER', 'NO');

select ok(not has_table_privilege('anon', 'public.crono_chigio_tests', 'select'), 'anonymous users cannot read results');
select ok(not has_table_privilege('authenticated', 'public.crono_chigio_tests', 'insert'), 'clients cannot write results');
select ok((select relrowsecurity from pg_class where oid = 'public.crono_chigio_tests'::regclass), 'RLS enabled');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000f01', true);
set local role authenticated;
select is((select count(*)::int from public.crono_chigio_tests), 1, 'active associated member reads results');
select throws_ok($$insert into public.crono_chigio_tests values ('2027-01-01', '[]')$$, '42501', null, 'associated users cannot write');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000f02', true);
select is((select count(*)::int from public.crono_chigio_tests), 0, 'archived members cannot read results');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000f03', true);
select is((select count(*)::int from public.crono_chigio_tests), 0, 'unassociated users cannot read results');
reset role;
select throws_ok($$insert into public.crono_chigio_tests values ('2027-01-01', '[]')$$, '23514', null, 'an empty test is rejected');
select * from finish();
rollback;
