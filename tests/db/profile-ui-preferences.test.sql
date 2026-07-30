begin;

select plan(7);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000091', 'prefs-one@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000092', 'prefs-two@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager)
values
  ('10000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000091', 'Uno', 'Manager', true),
  ('10000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000092', 'Due', 'Manager', true);

select has_table('public'::name, 'profile_ui_preferences'::name);
select has_column(
  'public'::name,
  'profile_ui_preferences'::name,
  'management_columns'::name,
  'preferences include management columns'
);
select ok(
  has_table_privilege('authenticated', 'public.profile_ui_preferences', 'SELECT'),
  'authenticated can select preferences'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true);

select lives_ok(
  $$insert into public.profile_ui_preferences (profile_id, management_columns)
    values (
      '10000000-0000-0000-0000-000000000091',
      '{"PEOPLE":["person","confirmation"]}'::jsonb
    )$$,
  'profile can create own preferences'
);
select results_eq(
  $$select management_columns
      from public.profile_ui_preferences
     where profile_id = '10000000-0000-0000-0000-000000000091'$$,
  $$values ('{"PEOPLE":["person","confirmation"]}'::jsonb)$$,
  'profile reads own preferences'
);
select throws_ok(
  $$insert into public.profile_ui_preferences (profile_id)
    values ('10000000-0000-0000-0000-000000000092')$$,
  '42501',
  'new row violates row-level security policy for table "profile_ui_preferences"',
  'profile cannot create another profile preferences'
);
select results_eq(
  $$select count(*)::bigint
      from public.profile_ui_preferences
     where profile_id = '10000000-0000-0000-0000-000000000092'$$,
  array[0::bigint],
  'profile cannot read another profile preferences'
);

reset role;
select * from finish();
rollback;
