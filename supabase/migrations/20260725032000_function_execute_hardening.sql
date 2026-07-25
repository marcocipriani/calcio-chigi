-- Keep PostgREST RPC exposure explicit. Hosted Supabase grants EXECUTE on new
-- functions to API roles by default, including SECURITY DEFINER trigger helpers.

begin;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke execute on all functions in schema public
  from public, anon, authenticated;

-- Authenticated client RPCs. Authorization is enforced inside each function.
grant execute on function public.current_profile_id()
  to authenticated, service_role;
grant execute on function public.is_current_user_associated()
  to authenticated, service_role;
grant execute on function public.is_current_user_manager()
  to authenticated, service_role;
grant execute on function public.get_app_context()
  to authenticated, service_role;
grant execute on function public.get_event_roster(uuid)
  to authenticated, service_role;
grant execute on function public.request_profile_association(uuid)
  to authenticated, service_role;
grant execute on function public.respond_to_season_confirmation(text, text)
  to authenticated, service_role;
grant execute on function public.mark_season_confirmation_prompted(text)
  to authenticated, service_role;
grant execute on function public.set_event_checkin(
  uuid,
  uuid,
  public.event_checkin_status
) to authenticated, service_role;
grant execute on function public.declare_payment(
  uuid,
  public.payment_method
) to authenticated, service_role;
grant execute on function public.send_manager_notification(
  text,
  text,
  text,
  text,
  uuid[],
  boolean
) to authenticated, service_role;
grant execute on function public.update_membership_if_current(
  uuid,
  timestamptz,
  jsonb
) to authenticated, service_role;
grant execute on function public.touch_manager_activity(text)
  to authenticated, service_role;
grant execute on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) to authenticated, service_role;
grant execute on function public.manager_update_person(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to authenticated, service_role;
grant execute on function public.manager_verify_payment(
  uuid,
  public.payment_method
) to authenticated, service_role;
grant execute on function public.manager_review_certificate(
  uuid,
  public.medical_certificate_status,
  text
) to authenticated, service_role;
grant execute on function public.publish_official_formation(
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb,
  jsonb
) to authenticated, service_role;

-- Administrative RPCs are called only with the service-role key.
grant execute on function public.import_roster_plan(jsonb)
  to service_role;
grant execute on function public.approve_account_association(uuid, uuid)
  to service_role;
grant execute on function public.create_notification(
  text,
  text,
  text,
  text,
  uuid[],
  boolean,
  text,
  uuid
) to service_role;
grant execute on function public.claim_notification_outbox(integer)
  to service_role;
grant execute on function public.complete_notification_delivery(
  uuid,
  boolean,
  text
) to service_role;

commit;
