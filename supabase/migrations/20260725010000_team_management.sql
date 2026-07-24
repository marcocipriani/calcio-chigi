-- Seasonal team management foundation.
-- Apply before importing Rosa_Squadra_2026-27.xlsx.

begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.membership_category as enum ('PLAYER', 'STAFF');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.membership_status as enum ('INTERESTED', 'PENDING', 'YES', 'MAYBE', 'NO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.registration_status as enum ('TODO', 'SUBMITTED', 'ACTIVE');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('DUE', 'PENDING_REVIEW', 'PAID');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('CASH', 'BANK_TRANSFER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.medical_certificate_status as enum (
    'MISSING', 'PENDING_REVIEW', 'VALID', 'REJECTED', 'EXPIRED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_checkin_status as enum ('PRESENT', 'ABSENT');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.formation_status as enum ('PUBLISHED', 'WITHDRAWN');
exception when duplicate_object then null;
end $$;

create table if not exists public.seasons (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[0-9]{4}-[0-9]{4}$'),
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on >= starts_on),
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);

insert into public.seasons (slug, name, starts_on, ends_on)
values
  ('2025-2026', 'Stagione 2025–2026', '2025-08-01', '2026-07-31'),
  ('2026-2027', 'Stagione 2026–2027', '2026-08-01', '2027-07-31')
on conflict (slug) do update
set name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on;

alter table public.profiles
  add column if not exists joined_on date,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profile_private_details (
  profile_id       uuid primary key references public.profiles(id) on delete cascade,
  phone            text,
  operational_email text,
  tax_code         text,
  nationality      text,
  birth_city       text,
  residence_city   text,
  address          text,
  postal_code      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null
);

insert into public.profile_private_details (profile_id, operational_email)
select id, nullif(trim(email), '')
from public.profiles
where nullif(trim(email), '') is not null
on conflict (profile_id) do update
set operational_email = coalesce(
  public.profile_private_details.operational_email,
  excluded.operational_email
);

create table if not exists public.season_memberships (
  id                              uuid primary key default gen_random_uuid(),
  profile_id                      uuid not null references public.profiles(id) on delete cascade,
  season_id                       uuid not null references public.seasons(id) on delete cascade,
  category                        public.membership_category not null default 'PLAYER',
  role                            text check (
    role is null or role = any (array['PORTIERE','DIFENSORE','CENTROCAMPISTA','ATTACCANTE'])
  ),
  staff_function                  text,
  jersey_number                   integer check (jersey_number is null or jersey_number between 0 and 99),
  uniform_size                    text,
  asi_card_number                 text,
  department                      text,
  is_external                     boolean not null default false,
  is_aggregated                   boolean not null default false,
  training_only                   boolean not null default false,
  operational_notes               text,
  next_contact_on                 date,
  reference_manager_profile_id    uuid references public.profiles(id) on delete set null,
  status                          public.membership_status not null default 'PENDING',
  last_confirmation_requested_at  timestamptz,
  registration_status             public.registration_status not null default 'TODO',
  registration_completed_on       date,
  registration_completed_by       uuid references public.profiles(id) on delete set null,
  passport_photo_path              text,
  passport_photo_unlocked_at       timestamptz,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  updated_by                       uuid references public.profiles(id) on delete set null,
  unique (profile_id, season_id),
  check (category = 'PLAYER' or role is null),
  check (category = 'STAFF' or staff_function is null),
  check (
    registration_status <> 'ACTIVE'
    or (registration_completed_on is not null and registration_completed_by is not null)
  )
);

insert into public.season_memberships (
  profile_id,
  season_id,
  category,
  role,
  staff_function,
  jersey_number,
  uniform_size,
  asi_card_number,
  department,
  is_external,
  is_aggregated,
  status
)
select
  p.id,
  s.id,
  case when coalesce(p.is_staff, false) then 'STAFF'::public.membership_category
       else 'PLAYER'::public.membership_category end,
  case when coalesce(p.is_staff, false) then null else p.ruolo end,
  case when coalesce(p.is_staff, false) then coalesce(p.ruolo, 'Staff') else null end,
  p.numero_maglia,
  p.taglia_divisa,
  p.tessera_asi,
  p.dipartimento,
  coalesce('EXT' = any(p.tags), false),
  coalesce('AGG' = any(p.tags), false),
  'YES'::public.membership_status
from public.profiles p
cross join public.seasons s
where s.slug = '2025-2026'
on conflict (profile_id, season_id) do nothing;

alter table public.events
  add column if not exists season_id uuid references public.seasons(id);

update public.events e
set season_id = (
  select s.id
  from public.seasons s
  where coalesce((e.data_ora at time zone 'Europe/Rome')::date, current_date)
        between s.starts_on and s.ends_on
  order by s.starts_on desc
  limit 1
)
where e.season_id is null;

update public.events e
set season_id = (select id from public.seasons where slug = '2025-2026')
where e.season_id is null;

alter table public.events alter column season_id set not null;

create table if not exists public.medical_certificates (
  id                    uuid primary key default gen_random_uuid(),
  membership_id         uuid not null references public.season_memberships(id) on delete cascade,
  document_path         text,
  competitive_declared  boolean not null default false,
  visit_on              date,
  expires_on            date,
  laboratory            text,
  status                public.medical_certificate_status not null default 'MISSING',
  rejection_reason      text,
  verified_by           uuid references public.profiles(id) on delete set null,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id) on delete set null,
  check (expires_on is null or visit_on is null or expires_on >= visit_on),
  check (
    status = 'MISSING'
    or (
      competitive_declared
      and document_path is not null
      and visit_on is not null
      and expires_on is not null
      and nullif(trim(laboratory), '') is not null
    )
  ),
  check (status <> 'REJECTED' or nullif(trim(rejection_reason), '') is not null)
);

create index if not exists medical_certificates_membership_idx
  on public.medical_certificates (membership_id, expires_on, status);

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  membership_id   uuid not null references public.season_memberships(id) on delete cascade,
  description     text not null check (nullif(trim(description), '') is not null),
  amount_due      numeric(10,2) not null check (amount_due >= 0),
  due_on          date,
  status          public.payment_status not null default 'DUE',
  method          public.payment_method,
  declared_at     timestamptz,
  verified_at     timestamptz,
  verified_by     uuid references public.profiles(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  check (status = 'DUE' or (method is not null and declared_at is not null)),
  check (status <> 'PAID' or (verified_at is not null and verified_by is not null))
);

create index if not exists payments_membership_status_due_idx
  on public.payments (membership_id, status, due_on);

create table if not exists public.event_checkins (
  event_id          uuid not null references public.events(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  status            public.event_checkin_status not null,
  checked_in_by     uuid not null references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index if not exists event_checkins_profile_status_idx
  on public.event_checkins (profile_id, status, event_id);

create table if not exists public.match_player_stats (
  event_id        uuid not null references public.events(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  goals           integer not null default 0 check (goals >= 0),
  assists         integer not null default 0 check (assists >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null references public.profiles(id) on delete restrict,
  primary key (event_id, profile_id)
);

create table if not exists public.match_awards (
  event_id        uuid primary key references public.events(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null references public.profiles(id) on delete restrict
);

create table if not exists public.match_unattributed_stats (
  event_id             uuid primary key references public.events(id) on delete cascade,
  opponent_own_goals   integer not null default 0 check (opponent_own_goals >= 0),
  unattributed_goals   integer not null default 0 check (unattributed_goals >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid not null references public.profiles(id) on delete restrict
);

create table if not exists public.official_formations (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null unique references public.events(id) on delete cascade,
  formation_module      text not null,
  shirt_color            text,
  captain_profile_id     uuid references public.profiles(id) on delete set null,
  vice_captain_profile_id uuid references public.profiles(id) on delete set null,
  snapshot               jsonb not null default '{}'::jsonb,
  status                 public.formation_status not null default 'PUBLISHED',
  published_by           uuid not null references public.profiles(id) on delete restrict,
  published_at           timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  withdrawn_at           timestamptz,
  check (captain_profile_id is distinct from vice_captain_profile_id)
);

create table if not exists public.official_formation_players (
  id              uuid primary key default gen_random_uuid(),
  formation_id    uuid not null references public.official_formations(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  player_snapshot jsonb not null,
  is_starter      boolean not null,
  position_key    text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (formation_id, profile_id),
  check ((is_starter and position_key is not null) or not is_starter)
);

create index if not exists season_memberships_season_status_idx
  on public.season_memberships (season_id, status, category);
create index if not exists season_memberships_next_contact_idx
  on public.season_memberships (next_contact_on)
  where next_contact_on is not null;
create index if not exists events_season_date_idx
  on public.events (season_id, data_ora);
create index if not exists official_formation_players_formation_order_idx
  on public.official_formation_players (formation_id, is_starter desc, sort_order);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_current_user_manager()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_manager = true
  );
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_current_user_associated()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_profile_id() is not null;
$$;

revoke all on function public.is_current_user_manager() from public;
revoke all on function public.current_profile_id() from public;
revoke all on function public.is_current_user_associated() from public;
grant execute on function public.is_current_user_manager() to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_current_user_associated() to authenticated;

create or replace function public.assign_event_season()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select id into new.season_id
  from public.seasons
  where coalesce((new.data_ora at time zone 'Europe/Rome')::date, current_date)
        between starts_on and ends_on
  order by starts_on desc
  limit 1;

  if new.season_id is null then
    raise exception 'No season configured for event date';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_event_season on public.events;
create trigger trg_assign_event_season
before insert or update of data_ora on public.events
for each row execute function public.assign_event_season();

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

  if new.user_id is distinct from old.user_id
     or new.is_manager is distinct from old.is_manager
     or new.is_staff is distinct from old.is_staff
     or new.joined_on is distinct from old.joined_on
     or new.ruolo is distinct from old.ruolo
     or new.numero_maglia is distinct from old.numero_maglia
     or new.tessera_asi is distinct from old.tessera_asi then
    raise exception 'Only managers can modify protected profile fields';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
drop trigger if exists trg_prevent_profile_privilege_changes on public.profiles;
create trigger trg_prevent_profile_privilege_changes
before update on public.profiles
for each row execute function public.prevent_profile_privilege_changes();

create or replace function public.guard_membership_passport_photo()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_current_user_manager() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
     or new.season_id is distinct from old.season_id
     or new.category is distinct from old.category
     or new.role is distinct from old.role
     or new.staff_function is distinct from old.staff_function
     or new.jersey_number is distinct from old.jersey_number
     or new.uniform_size is distinct from old.uniform_size
     or new.asi_card_number is distinct from old.asi_card_number
     or new.department is distinct from old.department
     or new.is_external is distinct from old.is_external
     or new.is_aggregated is distinct from old.is_aggregated
     or new.training_only is distinct from old.training_only
     or new.operational_notes is distinct from old.operational_notes
     or new.next_contact_on is distinct from old.next_contact_on
     or new.reference_manager_profile_id is distinct from old.reference_manager_profile_id
     or new.status is distinct from old.status
     or new.last_confirmation_requested_at is distinct from old.last_confirmation_requested_at
     or new.registration_status is distinct from old.registration_status
     or new.registration_completed_on is distinct from old.registration_completed_on
     or new.registration_completed_by is distinct from old.registration_completed_by
     or new.passport_photo_unlocked_at is distinct from old.passport_photo_unlocked_at then
    raise exception 'Only managers can modify membership fields';
  end if;

  if new.passport_photo_path is distinct from old.passport_photo_path
     and old.registration_status = 'ACTIVE'
     and old.passport_photo_unlocked_at is null then
    raise exception 'Passport photo is locked after active registration';
  end if;
  new.updated_by := public.current_profile_id();
  return new;
end;
$$;

drop trigger if exists trg_guard_membership_passport_photo on public.season_memberships;
create trigger trg_guard_membership_passport_photo
before update on public.season_memberships
for each row execute function public.guard_membership_passport_photo();

create or replace function public.guard_medical_certificate_owner_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_current_user_manager() then
    return new;
  end if;

  if new.status not in ('MISSING', 'PENDING_REVIEW')
     or new.rejection_reason is not null
     or new.verified_by is not null
     or new.verified_at is not null then
    raise exception 'Certificate verification fields are manager-only';
  end if;

  if tg_op = 'UPDATE' and new.membership_id is distinct from old.membership_id then
    raise exception 'Certificate membership cannot be changed';
  end if;

  new.updated_by := public.current_profile_id();
  return new;
end;
$$;

drop trigger if exists trg_guard_medical_certificate_owner_write on public.medical_certificates;
create trigger trg_guard_medical_certificate_owner_write
before insert or update on public.medical_certificates
for each row execute function public.guard_medical_certificate_owner_write();

create or replace function public.guard_payment_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_current_user_manager() then
    return new;
  end if;

  if new.membership_id is distinct from old.membership_id
     or new.description is distinct from old.description
     or new.amount_due is distinct from old.amount_due
     or new.due_on is distinct from old.due_on
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.status not in ('DUE', 'PENDING_REVIEW') then
    raise exception 'Payment verification fields are manager-only';
  end if;

  new.updated_by := public.current_profile_id();
  return new;
end;
$$;

drop trigger if exists trg_guard_payment_owner_update on public.payments;
create trigger trg_guard_payment_owner_update
before update on public.payments
for each row execute function public.guard_payment_owner_update();

create or replace function public.validate_present_match_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.event_checkins c
      on c.event_id = e.id
     and c.profile_id = new.profile_id
     and c.status = 'PRESENT'
    where e.id = new.event_id
      and e.tipo = 'PARTITA'
  ) then
    raise exception 'Match stats require a present player';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_match_player_stats on public.match_player_stats;
create trigger trg_validate_match_player_stats
before insert or update on public.match_player_stats
for each row execute function public.validate_present_match_player();

drop trigger if exists trg_validate_match_award on public.match_awards;
create trigger trg_validate_match_award
before insert or update on public.match_awards
for each row execute function public.validate_present_match_player();

create or replace function public.validate_official_formation_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is null and tg_op = 'INSERT' then
    raise exception 'Formation player is required';
  elsif new.profile_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.official_formations f
    join public.events e on e.id = f.event_id and e.tipo = 'PARTITA'
    join public.season_memberships m
      on m.profile_id = new.profile_id
     and m.season_id = e.season_id
    where f.id = new.formation_id
      and m.category = 'PLAYER'
      and m.status in ('YES', 'MAYBE')
      and m.training_only = false
  ) then
    raise exception 'Player is not eligible for this match formation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_official_formation_player on public.official_formation_players;
create trigger trg_validate_official_formation_player
before insert or update on public.official_formation_players
for each row execute function public.validate_official_formation_player();

do $$
declare
  target text;
begin
  foreach target in array array[
    'seasons',
    'profiles',
    'profile_private_details',
    'season_memberships',
    'medical_certificates',
    'payments',
    'event_checkins',
    'match_player_stats',
    'match_awards',
    'match_unattributed_stats',
    'official_formations'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', target);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      target
    );
  end loop;
end $$;

create or replace function public.update_membership_if_current(
  p_membership_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.season_memberships;
  actor uuid;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  if p_patch - array[
    'category', 'role', 'staff_function', 'jersey_number', 'uniform_size',
    'asi_card_number', 'department', 'is_external', 'is_aggregated',
    'training_only', 'operational_notes', 'next_contact_on',
    'reference_manager_profile_id', 'status', 'registration_status',
    'registration_completed_on', 'registration_completed_by',
    'passport_photo_path', 'passport_photo_unlocked_at'
  ] <> '{}'::jsonb then
    raise exception 'Patch contains unsupported fields';
  end if;

  actor := public.current_profile_id();

  update public.season_memberships
  set category = coalesce((p_patch->>'category')::public.membership_category, category),
      role = case when p_patch ? 'role' then nullif(p_patch->>'role', '') else role end,
      staff_function = case when p_patch ? 'staff_function' then nullif(p_patch->>'staff_function', '') else staff_function end,
      jersey_number = case when p_patch ? 'jersey_number' then (p_patch->>'jersey_number')::integer else jersey_number end,
      uniform_size = case when p_patch ? 'uniform_size' then nullif(p_patch->>'uniform_size', '') else uniform_size end,
      asi_card_number = case when p_patch ? 'asi_card_number' then nullif(p_patch->>'asi_card_number', '') else asi_card_number end,
      department = case when p_patch ? 'department' then nullif(p_patch->>'department', '') else department end,
      is_external = case when p_patch ? 'is_external' then (p_patch->>'is_external')::boolean else is_external end,
      is_aggregated = case when p_patch ? 'is_aggregated' then (p_patch->>'is_aggregated')::boolean else is_aggregated end,
      training_only = case when p_patch ? 'training_only' then (p_patch->>'training_only')::boolean else training_only end,
      operational_notes = case when p_patch ? 'operational_notes' then nullif(p_patch->>'operational_notes', '') else operational_notes end,
      next_contact_on = case when p_patch ? 'next_contact_on' then (p_patch->>'next_contact_on')::date else next_contact_on end,
      reference_manager_profile_id = case when p_patch ? 'reference_manager_profile_id' then (p_patch->>'reference_manager_profile_id')::uuid else reference_manager_profile_id end,
      status = coalesce((p_patch->>'status')::public.membership_status, status),
      registration_status = coalesce((p_patch->>'registration_status')::public.registration_status, registration_status),
      registration_completed_on = case when p_patch ? 'registration_completed_on' then (p_patch->>'registration_completed_on')::date else registration_completed_on end,
      registration_completed_by = case when p_patch ? 'registration_completed_by' then (p_patch->>'registration_completed_by')::uuid else registration_completed_by end,
      passport_photo_path = case when p_patch ? 'passport_photo_path' then nullif(p_patch->>'passport_photo_path', '') else passport_photo_path end,
      passport_photo_unlocked_at = case when p_patch ? 'passport_photo_unlocked_at' then (p_patch->>'passport_photo_unlocked_at')::timestamptz else passport_photo_unlocked_at end,
      updated_by = actor
  where id = p_membership_id
    and updated_at = p_expected_updated_at
  returning * into result;

  if result.id is null then
    raise exception 'Membership changed by another manager'
      using errcode = '40001';
  end if;

  return result;
end;
$$;

revoke all on function public.update_membership_if_current(uuid, timestamptz, jsonb) from public;
grant execute on function public.update_membership_if_current(uuid, timestamptz, jsonb) to authenticated;

create or replace view public.public_profile_directory
with (security_barrier = true)
as
select id, nome, cognome, avatar_url
from public.profiles;

create or replace view public.public_active_roster
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url,
  m.category,
  m.role,
  m.staff_function,
  m.jersey_number,
  m.status,
  m.training_only,
  s.slug as season_slug
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

create or replace view public.authenticated_active_roster
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url,
  p.data_nascita,
  m.category,
  m.role,
  m.staff_function,
  m.jersey_number,
  m.status,
  m.training_only,
  m.department,
  m.is_external,
  m.is_aggregated,
  s.slug as season_slug
from public.profiles p
join public.season_memberships m on m.profile_id = p.id
join public.seasons s on s.id = m.season_id
where (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

create or replace view public.public_player_statistics
with (security_barrier = true)
as
select
  p.id as profile_id,
  p.nome,
  p.cognome,
  p.avatar_url,
  coalesce(sum(ms.goals), 0)::integer as goals,
  coalesce(sum(ms.assists), 0)::integer as assists,
  count(ma.event_id)::integer as player_of_match
from public.profiles p
left join public.match_player_stats ms on ms.profile_id = p.id
left join public.match_awards ma on ma.profile_id = p.id
group by p.id, p.nome, p.cognome, p.avatar_url;

revoke all on public.public_profile_directory from public;
revoke all on public.public_active_roster from public;
revoke all on public.authenticated_active_roster from public;
revoke all on public.public_player_statistics from public;
grant select on public.public_profile_directory to anon, authenticated;
grant select on public.public_active_roster to anon, authenticated;
grant select on public.authenticated_active_roster to authenticated;
grant select on public.public_player_statistics to anon, authenticated;

alter table public.seasons enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private_details enable row level security;
alter table public.season_memberships enable row level security;
alter table public.medical_certificates enable row level security;
alter table public.payments enable row level security;
alter table public.event_checkins enable row level security;
alter table public.match_player_stats enable row level security;
alter table public.match_awards enable row level security;
alter table public.match_unattributed_stats enable row level security;
alter table public.official_formations enable row level security;
alter table public.official_formation_players enable row level security;

drop policy if exists "Profili visibili a tutti" on public.profiles;
drop policy if exists "Utente modifica se stesso" on public.profiles;
drop policy if exists "Managers can insert new profiles" on public.profiles;
drop policy if exists "Managers can update any profile" on public.profiles;
drop policy if exists "Managers can delete profiles" on public.profiles;

create policy seasons_public_select
on public.seasons for select
using (true);

create policy profiles_self_manager_select
on public.profiles for select to authenticated
using (user_id = auth.uid() or public.is_current_user_manager());

create policy profiles_self_update
on public.profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profiles_manager_all
on public.profiles for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy private_details_self_manager_select
on public.profile_private_details for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
);

create policy private_details_self_manager_insert
on public.profile_private_details for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
);

create policy private_details_self_manager_update
on public.profile_private_details for update to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
)
with check (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
);

create policy memberships_self_manager_select
on public.season_memberships for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_current_user_manager()
);

create policy memberships_owner_photo_update
on public.season_memberships for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

create policy memberships_manager_all
on public.season_memberships for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy certificates_self_manager_select
on public.medical_certificates for select to authenticated
using (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
);

create policy certificates_self_insert
on public.medical_certificates for insert to authenticated
with check (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
);

create policy certificates_self_manager_update
on public.medical_certificates for update to authenticated
using (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
)
with check (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
);

create policy certificates_manager_delete
on public.medical_certificates for delete to authenticated
using (public.is_current_user_manager());

create policy payments_self_manager_select
on public.payments for select to authenticated
using (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
);

create policy payments_owner_manager_update
on public.payments for update to authenticated
using (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
)
with check (
  exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
  or public.is_current_user_manager()
);

create policy payments_manager_insert_delete
on public.payments for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

drop policy if exists "Tutti possono leggere attendance" on public.attendance;
create policy attendance_associated_select
on public.attendance for select to authenticated
using (public.is_current_user_associated());

create policy checkins_associated_select
on public.event_checkins for select to authenticated
using (public.is_current_user_associated());

create policy checkins_manager_all
on public.event_checkins for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy match_stats_manager_all
on public.match_player_stats for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy match_awards_manager_all
on public.match_awards for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy match_unattributed_manager_all
on public.match_unattributed_stats for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy official_formations_associated_select
on public.official_formations for select to authenticated
using (
  public.is_current_user_associated()
  and status = 'PUBLISHED'
  or public.is_current_user_manager()
);

create policy official_formations_manager_all
on public.official_formations for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

create policy official_formation_players_associated_select
on public.official_formation_players for select to authenticated
using (
  exists (
    select 1
    from public.official_formations f
    where f.id = formation_id
      and (
        (f.status = 'PUBLISHED' and public.is_current_user_associated())
        or public.is_current_user_manager()
      )
  )
);

create policy official_formation_players_manager_all
on public.official_formation_players for all to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

grant select on public.seasons to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_private_details to authenticated;
grant select, insert, update, delete on public.season_memberships to authenticated;
grant select, insert, update, delete on public.medical_certificates to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select on public.event_checkins to authenticated;
grant select, insert, update, delete on public.event_checkins to authenticated;
grant select, insert, update, delete on public.match_player_stats to authenticated;
grant select, insert, update, delete on public.match_awards to authenticated;
grant select, insert, update, delete on public.match_unattributed_stats to authenticated;
grant select, insert, update, delete on public.official_formations to authenticated;
grant select, insert, update, delete on public.official_formation_players to authenticated;

commit;
