-- Un giocatore non può mettersi nel cestino da solo: con deleted_at nel
-- passato purge_trashed_profiles cancellava per sempre il suo profilo con
-- presenze, statistiche, pagamenti e documenti. Il cestino passa solo da
-- manager_trash_person. Protetto anche created_at.

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

  if current_setting('app.email_claim_profile', true) = old.id::text
     and old.user_id is null
     and new.user_id = auth.uid() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.is_manager is distinct from old.is_manager
     or new.is_staff is distinct from old.is_staff
     or new.ruolo is distinct from old.ruolo
     or new.numero_maglia is distinct from old.numero_maglia
     or new.tessera_asi is distinct from old.tessera_asi
     or new.joined_on is distinct from old.joined_on
     or new.deleted_at is distinct from old.deleted_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Only managers can modify protected profile fields';
  end if;

  return new;
end;
$$;
