begin;

select plan(11);

select has_table('public'::name, 'seasons'::name);
select has_table('public'::name, 'season_memberships'::name);
select has_table('public'::name, 'profile_private_details'::name);
select has_table('public'::name, 'payments'::name);
select has_table('public'::name, 'medical_certificates'::name);
select has_table('public'::name, 'event_checkins'::name);
select has_view('public'::name, 'public_active_roster'::name);
select has_function('public', 'is_current_user_manager', array[]::text[]);
select has_function('public', 'import_roster_plan', array['jsonb']);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service role can read profiles for administrative scripts'
);
select results_eq(
  $$select count(*)::bigint
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'public_profile_directory'
       and column_name in ('email', 'phone', 'tax_code')$$,
  array[0::bigint],
  'public directory excludes private fields'
);

select * from finish();
rollback;
