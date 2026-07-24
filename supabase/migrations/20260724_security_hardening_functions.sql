-- Security hardening da advisors Supabase (2026-07-24).
-- NON ancora applicata al DB live: applicare via SQL editor / supabase db push.

-- 1. Fissa search_path (previene hijack): le funzioni referenziano tabelle public non qualificate.
alter function public.update_attendance_updated_at() set search_path = public;
alter function public.link_profile_to_user() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.calculate_standings() set search_path = public;

-- 2. Revoca EXECUTE su funzioni SECURITY DEFINER trigger: non devono essere invocabili via RPC (/rest/v1/rpc/...).
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.link_profile_to_user() from anon, authenticated;
revoke execute on function public.prevent_role_escalation() from anon, authenticated;

-- Note (non in questa migration):
-- - Bucket storage `avatars` ha SELECT policy ampia (listing). Public URL non richiede listing;
--   valutare di restringere per evitare enumerazione dei file.
-- - Leaked password protection (HaveIBeenPwned): abilitare da dashboard Auth > Policies.
