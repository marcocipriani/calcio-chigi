begin;

select plan(10);

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000d01', 'rate-player@test.local', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000d02', 'rate-manager@test.local', now(), 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager)
values
  ('10000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000d01', 'Rino', 'Rate', false),
  ('10000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d02', 'Mara', 'Manager', true);

insert into public.season_memberships (id, profile_id, season_id, status)
select '20000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000d01', s.id, 'YES'
from public.seasons s
order by s.starts_on desc
limit 1;

insert into public.payments (id, membership_id, description, amount_due, due_on)
values ('30000000-0000-0000-0000-000000000d01', '20000000-0000-0000-0000-000000000d01', 'Quota – rata 1/2', 150, current_date + 30);

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

select lives_ok(
  $$select public.declare_payment_entry(
      '30000000-0000-0000-0000-000000000d01', 100, current_date, 'CASH',
      '10000000-0000-0000-0000-000000000d02')$$,
  'player declares a partial cash payment'
);
select results_eq(
  $$select status::text from public.payments where id = '30000000-0000-0000-0000-000000000d01'$$,
  $$values ('PENDING_REVIEW')$$,
  'pending entry puts the instalment under review'
);
select throws_like(
  $$select public.declare_payment_entry(
      '30000000-0000-0000-0000-000000000d01', 60, current_date, 'BANK_TRANSFER')$$,
  'Importo oltre il residuo%',
  'cannot declare more than the remaining amount'
);
select throws_like(
  $$select public.declare_payment_entry(
      '30000000-0000-0000-0000-000000000d01', 10, current_date + 2, 'BANK_TRANSFER')$$,
  '%futuro%',
  'payment date cannot be in the future'
);
select throws_like(
  $$select public.declare_payment_entry(
      '30000000-0000-0000-0000-000000000d01', 10, current_date, 'CASH')$$,
  'Indica a chi%',
  'cash needs a recipient'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d02', true);
select lives_ok(
  $$select public.manager_review_payment_entry(
      (select id from public.payment_entries
        where payment_id = '30000000-0000-0000-0000-000000000d01'), 'VERIFIED')$$,
  'manager verifies the entry'
);
select results_eq(
  $$select status::text, amount_paid from public.payments
     where id = '30000000-0000-0000-0000-000000000d01'$$,
  $$values ('DUE', 100.00::numeric)$$,
  'partially paid instalment stays due'
);
select throws_like(
  $$update public.payments set amount_due = 50
     where id = '30000000-0000-0000-0000-000000000d01'$$,
  'Importo della quota inferiore%',
  'amount due cannot drop below declared entries'
);
select lives_ok(
  $$select public.manager_record_payment_entry(
      '30000000-0000-0000-0000-000000000d01', 50, current_date, 'BANK_TRANSFER')$$,
  'manager records the rest'
);
select results_eq(
  $$select status::text, amount_paid from public.payments
     where id = '30000000-0000-0000-0000-000000000d01'$$,
  $$values ('PAID', 150.00::numeric)$$,
  'verified entries covering the amount mark it paid'
);

reset role;

select * from finish();
rollback;
