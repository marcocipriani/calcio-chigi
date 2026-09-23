begin;

-- Cestino persone.
-- Diverso dall'archiviazione (stato stagionale reversibile): chi finisce nel
-- cestino esce da tutte le stagioni, perde l'account collegato e dopo 30
-- giorni viene eliminato con tutto lo storico (presenze, statistiche,
-- pagamenti, documenti collegati). Nei 30 giorni un manager può ripristinarlo:
-- torna tra gli archiviati, senza account. I manager non vanno nel cestino.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

create or replace function public.manager_trash_person(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  update public.profiles
  set deleted_at = now(),
      user_id = null
  where id = p_profile_id
    and deleted_at is null
    and not is_manager;
  if not found then
    raise exception 'Person not found, already trashed or manager'
      using errcode = 'P0002';
  end if;

  update public.season_memberships
  set status = 'NO',
      updated_by = public.current_profile_id()
  where profile_id = p_profile_id
    and status <> 'NO';

  -- `unique (user_id)`: senza questa pulizia l'account scollegato non potrebbe
  -- più chiedere un'associazione.
  delete from public.account_association_requests
  where profile_id = p_profile_id;
end;
$$;

create or replace function public.manager_restore_person(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  update public.profiles
  set deleted_at = null
  where id = p_profile_id
    and deleted_at is not null;
  if not found then
    raise exception 'Person not in trash' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.purge_trashed_profiles()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target uuid;
begin
  for target in
    select id
    from public.profiles
    where deleted_at < now() - interval '30 days'
  loop
    begin
      -- Le righe proprie prima del profilo: `checked_in_by`/`modified_by`
      -- possono puntare a sé stessi e bloccare il cascade.
      delete from public.event_checkins where profile_id = target;
      delete from public.attendance where profile_id = target;
      delete from public.profiles where id = target;
    exception when foreign_key_violation then
      -- ponytail: chi ha firmato dati altrui (updated_by, published_by) resta
      -- nel cestino e va ripulito a mano; i manager non ci arrivano mai.
      raise warning 'Profilo % non eliminabile: %', target, sqlerrm;
    end;
  end loop;
end;
$$;

-- Un profilo nel cestino non si reclama da un nuovo account.
create or replace view public.claimable_profile_directory
with (security_barrier = true)
as
select p.id, p.nome, p.cognome
from public.profiles p
where p.user_id is null
  and p.deleted_at is null
  and not exists (
    select 1
    from public.account_association_requests r
    where r.profile_id = p.id
      and r.status = 'PENDING'
  )
  and not exists (
    select 1
    from public.season_memberships m
    join public.seasons s on s.id = m.season_id
    where m.profile_id = p.id
      and m.status = 'NO'
      and (now() at time zone 'Europe/Rome')::date
          between s.starts_on and s.ends_on
  );

revoke all on function public.manager_trash_person(uuid)
  from public, anon, authenticated;
revoke all on function public.manager_restore_person(uuid)
  from public, anon, authenticated;
revoke all on function private.purge_trashed_profiles() from public;
grant execute on function public.manager_trash_person(uuid)
  to authenticated, service_role;
grant execute on function public.manager_restore_person(uuid)
  to authenticated, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'purge-trashed-profiles'
   limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'purge-trashed-profiles',
    '15 3 * * *',
    'select private.purge_trashed_profiles();'
  );
end;
$$;

commit;
