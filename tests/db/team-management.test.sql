begin;

select plan(60);

select has_table('public'::name, 'seasons'::name);
select has_table('public'::name, 'season_memberships'::name);
select has_table('public'::name, 'profile_private_details'::name);
select has_table('public'::name, 'payments'::name);
select has_table('public'::name, 'medical_certificates'::name);
select has_table('public'::name, 'event_checkins'::name);
select has_view('public'::name, 'public_active_roster'::name);
select has_column(
  'public'::name,
  'public_active_roster'::name,
  'is_u35'::name,
  'public roster exposes only derived U35 eligibility'
);
select results_eq(
  $$select count(*)::bigint
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'public_active_roster'
       and column_name = 'data_nascita'$$,
  array[0::bigint],
  'public roster does not expose birth dates'
);
select has_view('public'::name, 'public_published_formation_summaries'::name);
select has_function('public', 'is_current_user_manager', array[]::text[]);
select has_function('public', 'import_roster_plan', array['jsonb']);
select has_table('public'::name, 'historical_player_stats'::name);
select has_column(
  'public'::name,
  'match_player_stats'::name,
  'yellow_cards'::name,
  'match player statistics include yellow cards'
);
select has_column(
  'public'::name,
  'match_player_stats'::name,
  'red_cards'::name,
  'match player statistics include red cards'
);
select has_view('public'::name, 'public_season_player_directory'::name);
select has_view('public'::name, 'public_player_statistics_by_phase'::name);
select has_function(
  'public',
  'get_player_profile',
  array['uuid', 'uuid']
);
select has_function(
  'public',
  'import_historical_player_stats',
  array['text', 'text', 'jsonb']
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.historical_player_stats',
    'SELECT'
  ),
  'clients cannot read historical storage directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.import_historical_player_stats(text,text,jsonb)',
    'EXECUTE'
  ),
  'history import remains service-only'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.import_historical_player_stats(text,text,jsonb)',
    'EXECUTE'
  ),
  'service role can execute the historical importer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_player_profile(uuid,uuid)',
    'EXECUTE'
  ),
  'associated clients can execute the safe player RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_player_profile(uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the safe player RPC'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service role can read profiles for administrative scripts'
);
select ok(
  not has_function_privilege('anon', 'public.current_profile_id()', 'EXECUTE'),
  'anonymous users cannot execute authenticated identity helpers'
);
select ok(
  not has_function_privilege('anon', 'public.get_app_context()', 'EXECUTE'),
  'anonymous users cannot execute the authenticated app context RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.declare_payment(uuid, public.payment_method)',
    'EXECUTE'
  ),
  'anonymous users cannot declare payments'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.guard_payment_owner_update()',
    'EXECUTE'
  ),
  'anonymous users cannot execute internal trigger functions'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.notify_payment_change()',
    'EXECUTE'
  ),
  'authenticated users cannot execute internal notification triggers directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_app_context()',
    'EXECUTE'
  ),
  'authenticated users retain access to intended client RPCs'
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
select hasnt_function('public', 'respond_to_season_confirmation', array['text', 'text']);
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
