-- Manager account approval, active-season context and collaboration presence.

begin;

create table if not exists public.manager_activity (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at  timestamptz not null default now(),
  last_route    text,
  updated_at    timestamptz not null default now()
);

alter table public.manager_activity enable row level security;

create policy manager_activity_manager_select
on public.manager_activity for select to authenticated
using (public.is_current_user_manager());

create policy manager_activity_self_insert
on public.manager_activity for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  and public.is_current_user_manager()
);

create policy manager_activity_self_update
on public.manager_activity for update to authenticated
using (
  profile_id = public.current_profile_id()
  and public.is_current_user_manager()
)
with check (
  profile_id = public.current_profile_id()
  and public.is_current_user_manager()
);

grant select, insert, update on public.manager_activity to authenticated;
grant all privileges on public.manager_activity to service_role;

create or replace function public.touch_manager_activity(p_route text default null)
returns public.manager_activity
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile uuid := public.current_profile_id();
  result public.manager_activity;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  insert into public.manager_activity (profile_id, last_seen_at, last_route)
  values (current_profile, now(), left(nullif(trim(p_route), ''), 255))
  on conflict (profile_id) do update
  set last_seen_at = excluded.last_seen_at,
      last_route = excluded.last_route,
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.touch_manager_activity(text)
  from public, anon;
grant execute on function public.touch_manager_activity(text)
  to authenticated, service_role;

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

create or replace function public.get_app_context()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with own_profile as (
    select p.*
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
  ),
  association as (
    select r.id, r.profile_id, r.status, r.requested_at
    from public.account_association_requests r
    where r.user_id = auth.uid()
    limit 1
  ),
  target_season as (
    select s.*
    from public.seasons s
    order by s.starts_on desc
    limit 1
  ),
  membership as (
    select m.*
    from public.season_memberships m
    join own_profile p on p.id = m.profile_id
    join target_season s on s.id = m.season_id
    limit 1
  )
  select jsonb_build_object(
    'profile',
    (
      select jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'cognome', p.cognome,
        'avatar_url', p.avatar_url,
        'data_nascita', p.data_nascita,
        'is_manager', p.is_manager
      )
      from own_profile p
    ),
    'associationStatus',
    case
      when exists(select 1 from own_profile) then 'ACTIVE'
      when exists(select 1 from association where status = 'PENDING') then 'REQUESTED'
      else 'NONE'
    end,
    'associationRequest',
    (select to_jsonb(a) from association a),
    'targetSeason',
    (
      select jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'starts_on', s.starts_on,
        'ends_on', s.ends_on
      )
      from target_season s
    ),
    'membership',
    (select to_jsonb(m) from membership m),
    'unreadNotifications',
    (
      select count(*)
      from public.notification_recipients nr
      where nr.user_id = auth.uid()
        and nr.read_at is null
    )
  );
$$;

revoke all on function public.get_app_context() from public;
grant execute on function public.get_app_context() to authenticated, service_role;

commit;
