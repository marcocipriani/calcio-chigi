-- Security hardening da advisors Supabase (2026-07-24).
-- NON ancora applicata al DB live: applicare via SQL editor / supabase db push.

-- 1. Fissa search_path sulle funzioni presenti. Alcuni ambienti storici hanno
-- trigger auth non inclusi nella baseline; la migration deve restare applicabile
-- anche a un progetto nuovo.
do $$
begin
  if to_regprocedure('public.update_attendance_updated_at()') is not null then
    execute 'alter function public.update_attendance_updated_at() set search_path = public';
  end if;
  if to_regprocedure('public.link_profile_to_user()') is not null then
    execute 'alter function public.link_profile_to_user() set search_path = public';
    execute 'revoke execute on function public.link_profile_to_user() from public';
  end if;
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() set search_path = public';
    execute 'revoke execute on function public.handle_new_user() from public';
  end if;
  if to_regprocedure('public.calculate_standings()') is not null then
    execute 'alter function public.calculate_standings() set search_path = public';
  end if;
  if to_regprocedure('public.prevent_role_escalation()') is not null then
    execute 'revoke execute on function public.prevent_role_escalation() from public';
  end if;
end
$$;

-- Note (non in questa migration):
-- - Bucket storage `avatars` ha SELECT policy ampia (listing). Public URL non richiede listing;
--   valutare di restringere per evitare enumerazione dei file.
-- - Leaked password protection (HaveIBeenPwned): abilitare da dashboard Auth > Policies.
