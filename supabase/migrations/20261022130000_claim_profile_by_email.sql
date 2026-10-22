-- Auto-associazione: se l'email verificata dell'account coincide con l'email
-- di un solo profilo libero, l'utente conferma "Sono io" e si collega senza
-- approvazione del manager. Nessuna corrispondenza → richiesta come prima.

create or replace function public.my_email_profile_match()
returns table (id uuid, nome text, cognome text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select lower(trim(u.email)) as email
    from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and public.current_profile_id() is null
  ),
  candidates as (
    select p.id, p.nome, p.cognome
    from public.profiles p, me
    where p.user_id is null
      and p.deleted_at is null
      and lower(trim(p.email)) = me.email
  )
  -- Più profili con la stessa email: ambiguo, decide il manager.
  select * from candidates where (select count(*) from candidates) = 1;
$$;

-- Unica eccezione per i non manager: collegare a sé un profilo libero, solo
-- se il flag di transazione lo imposta claim_profile_by_email (set_config non
-- è esposto via PostgREST).
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
     or new.joined_on is distinct from old.joined_on then
    raise exception 'Only managers can modify protected profile fields';
  end if;

  return new;
end;
$$;

create or replace function public.claim_profile_by_email(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
  manager_user_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select concat_ws(' ', m.nome, m.cognome) into profile_name
  from public.my_email_profile_match() m
  where m.id = p_profile_id;

  if profile_name is null then
    raise exception 'Profile does not match account email' using errcode = '42501';
  end if;

  perform set_config('app.email_claim_profile', p_profile_id::text, true);
  update public.profiles
  set user_id = auth.uid(),
      updated_at = now()
  where id = p_profile_id
    and user_id is null;
  -- Prima di perform: perform sovrascrive FOUND.
  if not found then
    raise exception 'Profile is already associated';
  end if;
  perform set_config('app.email_claim_profile', '', true);

  -- Richieste in sospeso su questo profilo (di altri) e qualunque richiesta di
  -- questo utente (unique user_id) non servono più.
  delete from public.account_association_requests
  where (status = 'PENDING' and profile_id = p_profile_id)
     or user_id = auth.uid();

  insert into public.account_association_requests (
    user_id, profile_id, status, reviewed_at
  )
  values (auth.uid(), p_profile_id, 'APPROVED', now());

  select array_agg(user_id) into manager_user_ids
  from public.profiles
  where is_manager = true
    and user_id is not null;

  perform public.create_notification(
    'ACCOUNT_ASSOCIATION_REQUEST',
    'Account collegato',
    profile_name || ' ha collegato l’account tramite email.',
    '/gestione?view=account',
    manager_user_ids,
    false,
    'association-email:' || p_profile_id::text,
    null
  );
end;
$$;

revoke execute on function public.my_email_profile_match() from public, anon;
revoke execute on function public.claim_profile_by_email(uuid) from public, anon;
grant execute on function public.my_email_profile_match() to authenticated, service_role;
grant execute on function public.claim_profile_by_email(uuid) to authenticated, service_role;
