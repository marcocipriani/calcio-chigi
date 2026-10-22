begin;

select plan(7);

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000c01', 'Luca@Test.local ', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000c02', 'nonverificato@test.local', null, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000c03', 'altro@test.local', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000c04', 'doppio@test.local', now(), 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, email)
values
  ('10000000-0000-0000-0000-000000000c01', null, 'Luca', 'Email', 'luca@test.local'),
  ('10000000-0000-0000-0000-000000000c02', null, 'Nino', 'Nonverificato', 'nonverificato@test.local'),
  ('10000000-0000-0000-0000-000000000c03', null, 'Dora', 'Doppio', 'doppio@test.local'),
  ('10000000-0000-0000-0000-000000000c04', null, 'Dino', 'Doppio', 'doppio@test.local');

-- Richiesta sbagliata di un altro utente sul profilo di Luca.
insert into public.account_association_requests (user_id, profile_id)
values ('00000000-0000-0000-0000-000000000c03', '10000000-0000-0000-0000-000000000c01');

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c02', true);
select is_empty(
  $$select * from public.my_email_profile_match()$$,
  'unconfirmed email never matches'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c04', true);
select is_empty(
  $$select * from public.my_email_profile_match()$$,
  'ambiguous email matches nobody'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c03', true);
select throws_ok(
  $$select public.claim_profile_by_email('10000000-0000-0000-0000-000000000c01')$$,
  '42501',
  null,
  'a different email cannot claim the profile'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c01', true);
select results_eq(
  $$select id from public.my_email_profile_match()$$,
  $$values ('10000000-0000-0000-0000-000000000c01'::uuid)$$,
  'email match ignores case and spaces'
);

select lives_ok(
  $$select public.claim_profile_by_email('10000000-0000-0000-0000-000000000c01')$$,
  'matching email claims the profile'
);

reset role;

select is(
  (select user_id from public.profiles where id = '10000000-0000-0000-0000-000000000c01'),
  '00000000-0000-0000-0000-000000000c01'::uuid,
  'profile is linked to the account'
);

select is(
  (select count(*)::int from public.account_association_requests
   where profile_id = '10000000-0000-0000-0000-000000000c01' and status = 'PENDING'),
  0,
  'stale pending requests on the profile are cleared'
);

select * from finish();
rollback;
