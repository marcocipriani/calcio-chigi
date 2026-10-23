-- "Sono io" senza approvazione non deve concedere i permessi da manager: chi
-- controlla l'email salvata su un profilo manager libero diventerebbe manager.
-- I profili manager passano sempre dalla richiesta approvata.

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
      and p.is_manager is not true
      and lower(trim(p.email)) = me.email
  )
  -- Più profili con la stessa email: ambiguo, decide il manager.
  select * from candidates where (select count(*) from candidates) = 1;
$$;

revoke execute on function public.my_email_profile_match() from public, anon;
grant execute on function public.my_email_profile_match() to authenticated, service_role;
