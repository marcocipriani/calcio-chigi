-- Prevent recipient identity swaps and revalidate private paths on updates.

create or replace function public.guard_notification_recipient_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.notification_id is distinct from old.notification_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state can be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_notification_recipient_identity
  on public.notification_recipients;
create trigger trg_guard_notification_recipient_identity
before update on public.notification_recipients
for each row execute function public.guard_notification_recipient_identity();

drop policy if exists passport_photos_owner_manager_update on storage.objects;
create policy passport_photos_owner_manager_update
on storage.objects for update to authenticated
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
)
with check (
  bucket_id = 'passport-photos'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
        and (storage.foldername(name))[1] = membership.profile_id::text
        and (
          membership.registration_status <> 'ACTIVE'
          or membership.passport_photo_unlocked_at is not null
        )
    )
  )
);

drop policy if exists medical_certificates_owner_manager_update on storage.objects;
create policy medical_certificates_owner_manager_update
on storage.objects for update to authenticated
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
)
with check (
  bucket_id = 'medical-certificates'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
        and (storage.foldername(name))[1] = membership.profile_id::text
    )
  )
);

revoke execute on function public.guard_notification_recipient_identity() from public;
