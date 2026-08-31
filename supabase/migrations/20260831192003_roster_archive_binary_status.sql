begin;

-- La rosa è binaria: 'YES' = in rosa, 'NO' = archiviato.
-- Gli stati intermedi (interessamento/conferma) non sono più scritti da nessuno.
-- Il guard sulle membership ammette solo manager o service_role: qui la
-- migration gira come owner, quindi va sospeso per la sola riscrittura dati.
alter table public.season_memberships
  disable trigger trg_guard_membership_passport_photo;

update public.season_memberships
set status = 'YES'
where status in ('INTERESTED', 'PENDING', 'MAYBE');

alter table public.season_memberships
  enable trigger trg_guard_membership_passport_photo;

alter table public.season_memberships
  alter column status set default 'YES';

-- ponytail: l'enum membership_status resta com'è; senza scrittori i valori
-- intermedi sono irraggiungibili e i filtri esistenti `in ('YES','MAYBE')`
-- continuano a valere. Rimuovere i valori richiederebbe ricreare il tipo.
drop function if exists public.respond_to_season_confirmation(text, text);
drop function if exists public.mark_season_confirmation_prompted(text);

-- Un archiviato non può rivendicare un account.
create or replace view public.claimable_profile_directory
with (security_barrier = true)
as
select p.id, p.nome, p.cognome
from public.profiles p
where p.user_id is null
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

revoke all on public.claimable_profile_directory from public;
grant select on public.claimable_profile_directory to authenticated;

-- L'approvazione di un account non tocca più lo stato in rosa: era l'unico
-- punto che riportava una persona a 'PENDING'.
create or replace function public.approve_account_association(
  p_request_id uuid,
  p_reviewer_profile_id uuid
)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.account_association_requests;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_reviewer_profile_id
      and is_manager = true
  ) then
    raise exception 'Reviewer must be a manager' using errcode = '42501';
  end if;

  select * into request_row
  from public.account_association_requests
  where id = p_request_id
    and status = 'PENDING'
  for update;

  if request_row.id is null then
    raise exception 'Pending association request not found';
  end if;

  update public.profiles
  set user_id = request_row.user_id,
      updated_at = now()
  where id = request_row.profile_id
    and user_id is null;

  if not found then
    raise exception 'Profile is already associated';
  end if;

  update public.account_association_requests
  set status = 'APPROVED',
      reviewed_at = now(),
      reviewed_by = p_reviewer_profile_id
  where id = request_row.id
  returning * into request_row;

  return request_row;
end;
$$;

revoke all on function public.approve_account_association(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_account_association(uuid, uuid)
  to service_role;

commit;
