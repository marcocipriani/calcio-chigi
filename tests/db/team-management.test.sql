begin;

select plan(39);

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
select has_table('public'::name, 'account_association_requests'::name);
select has_table('public'::name, 'rejected_account_hashes'::name);
select has_table('public'::name, 'notifications'::name);
select has_table('public'::name, 'notification_recipients'::name);
select has_table('public'::name, 'push_subscriptions'::name);
select has_table('public'::name, 'notification_preferences'::name);
select has_table('public'::name, 'notification_outbox'::name);
select has_view('public'::name, 'claimable_profile_directory'::name);
select has_function('public', 'get_app_context', array[]::text[]);
select has_function('public', 'request_profile_association', array['uuid']);
select has_function('public', 'respond_to_season_confirmation', array['text', 'text']);
select has_function('public', 'set_event_checkin', array['uuid', 'uuid', 'event_checkin_status']);
select has_function('public', 'get_event_roster', array['uuid']);
select has_function('public', 'guard_notification_recipient_identity', array[]::text[]);
select has_function('public', 'claim_notification_outbox', array['integer']);
select has_function(
  'public',
  'complete_notification_delivery',
  array['uuid', 'boolean', 'text']
);
select has_table('public'::name, 'manager_activity'::name);
select has_function(
  'public',
  'approve_account_association',
  array['uuid', 'uuid']
);
select has_function('public', 'touch_manager_activity', array['text']);
select has_function(
  'public',
  'manager_create_person',
  array[
    'text',
    'text',
    'text',
    'membership_category',
    'membership_status',
    'text',
    'text',
    'text',
    'boolean',
    'date'
  ]
);
select has_function(
  'public',
  'manager_update_person',
  array[
    'uuid',
    'uuid',
    'timestamptz',
    'timestamptz',
    'timestamptz',
    'jsonb',
    'jsonb',
    'jsonb'
  ]
);
select has_function(
  'public',
  'manager_verify_payment',
  array['uuid', 'payment_method']
);
select has_function(
  'public',
  'manager_review_certificate',
  array['uuid', 'medical_certificate_status', 'text']
);
select has_function(
  'public',
  'publish_official_formation',
  array['uuid', 'text', 'text', 'uuid', 'uuid', 'jsonb', 'jsonb']
);
select has_function(
  'private',
  'dispatch_pending_notifications',
  array[]::text[]
);
select results_eq(
  $$select count(*)::bigint
      from cron.job
     where jobname = 'dispatch-team-notifications'
       and schedule = '* * * * *'
       and active$$,
  array[1::bigint],
  'push outbox dispatcher is scheduled every minute'
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
select results_eq(
  $$select public, file_size_limit
      from storage.buckets
     where id = 'avatars'$$,
  $$values (true, 2097152::bigint)$$,
  'avatar bucket is provisioned declaratively with a 2 MB limit'
);
select results_eq(
  $$select count(*)::bigint
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname like 'avatars_owner_manager_%'$$,
  array[4::bigint],
  'avatar objects have explicit owner-or-manager policies'
);

select * from finish();
rollback;
