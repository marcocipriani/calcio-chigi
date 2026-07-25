begin;

drop trigger if exists trg_guard_profile_self_update on public.profiles;
drop function if exists public.guard_profile_self_update();

create or replace function public.prevent_profile_privilege_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_current_user_manager() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.is_manager is distinct from old.is_manager
     or new.is_staff is distinct from old.is_staff
     or new.ruolo is distinct from old.ruolo
     or new.numero_maglia is distinct from old.numero_maglia
     or new.tessera_asi is distinct from old.tessera_asi
     or new.joined_on is distinct from old.joined_on then
    raise exception 'Only managers can modify protected profile fields';
  end if;

  return new;
end;
$$;

drop policy if exists passport_photos_owner_manager_delete on storage.objects;
create policy passport_photos_owner_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'passport-photos'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
        and (
          membership.registration_status <> 'ACTIVE'
          or membership.passport_photo_unlocked_at is not null
        )
    )
  )
);

drop policy if exists medical_certificates_owner_manager_delete on storage.objects;
create policy medical_certificates_owner_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'medical-certificates'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
    )
  )
);

commit;
