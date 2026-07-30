-- Calcio Chigi — complete database schema
-- Snapshot: 2026-05-24
-- Run against a fresh Supabase project to recreate the database from scratch.
-- Incremental changes live in supabase/migrations/.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.teams (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  logo_url  text,
  slug      text
);

create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id),
  nome           text not null,
  cognome        text not null,
  data_nascita   date,
  ruolo          text check (ruolo = any (array['PORTIERE','DIFENSORE','CENTROCAMPISTA','ATTACCANTE'])),
  dipartimento   text,
  numero_maglia  integer,
  tessera_asi    text,
  taglia_divisa  text,
  note_mediche   text,
  avatar_url     text,
  email          text,
  default_view   text default 'ACTIVITY',
  is_manager     boolean default false,
  is_staff       boolean default false,
  tags           text[] default '{}',
  created_at     timestamptz not null default timezone('utc', now())
);

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  tipo           text check (tipo = any (array['PARTITA','ALLENAMENTO'])),
  data_ora       timestamptz,
  data_fine_ora  timestamptz,
  luogo          text,
  tipo_campo     text check (tipo_campo = any (array['a8','a11'])),
  avversario     text,
  note           text,
  giocata        boolean default false,
  cancellato     boolean default false,
  giornata       integer,
  fase           text default 'FASE_1',
  squadra_casa   text,
  squadra_ospite text,
  gol_casa       integer,
  gol_ospite     integer,
  gol_nostri     integer,
  gol_avversario integer,
  created_at     timestamptz not null default timezone('utc', now())
);

create table if not exists public.attendance (
  id          uuid not null default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  modified_by uuid references public.profiles(id),
  status      text check (status = any (array['PRESENTE','ASSENTE','INFORTUNATO_PRESENTE'])),
  note        text,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz default now(),
  primary key (event_id, profile_id)
);

-- standings: DB-level cache kept in sync by on_match_change trigger.
-- The app calculates standings dynamically in TypeScript (src/lib/utils.ts);
-- this table is not queried by the main standings UI.
create table if not exists public.standings (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams(id),
  punti      integer default 0,
  giocate    integer default 0,
  vinte      integer default 0,
  nulle      integer default 0,
  perse      integer default 0,
  gol_fatti  integer default 0,
  gol_subiti integer default 0
);

create table if not exists public.comunicati (
  id         uuid primary key default gen_random_uuid(),
  enjore_url text not null unique,
  titolo     text not null,
  data       date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.teams      enable row level security;
alter table public.profiles   enable row level security;
alter table public.events     enable row level security;
alter table public.attendance enable row level security;
alter table public.standings  enable row level security;
alter table public.comunicati enable row level security;

-- teams
create policy "Public read teams"
  on public.teams for select using (true);

-- profiles
create policy "Profili visibili a tutti"
  on public.profiles for select using (true);

create policy "Utente modifica se stesso"
  on public.profiles for update using (auth.uid() = user_id);

create policy "Managers can insert new profiles"
  on public.profiles for insert to authenticated
  with check (auth.uid() in (select user_id from public.profiles where is_manager = true));

create policy "Managers can update any profile"
  on public.profiles for update to authenticated
  using (auth.uid() in (select user_id from public.profiles where is_manager = true));

create policy "Managers can delete profiles"
  on public.profiles for delete to authenticated
  using (auth.uid() in (select user_id from public.profiles where is_manager = true));

-- events
create policy "Eventi visibili a tutti"
  on public.events for select using (true);

create policy "Manager Write"
  on public.events for all
  using (exists (select 1 from public.profiles where user_id = auth.uid() and is_manager = true));

-- attendance
create policy "Tutti possono leggere attendance"
  on public.attendance for select using (true);

create policy "Utenti gestiscono il proprio profilo"
  on public.attendance for all
  using  (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Manager gestiscono tutto"
  on public.attendance for all
  using (exists (select 1 from public.profiles where user_id = auth.uid() and is_manager = true));

-- standings
create policy "Classifica visibile a tutti"
  on public.standings for select using (true);

-- comunicati
create policy "comunicati_select_public"
  on public.comunicati for select using (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function public.update_attendance_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keeps public.standings in sync after every event change.
-- Note: standings table is a DB-level cache; the app UI uses TypeScript calculateStandings().
create or replace function public.calculate_standings()
returns trigger language plpgsql as $$
begin
  with match_stats as (
    select squadra_casa as team_name,
           case when gol_casa > gol_ospite then 3 when gol_casa = gol_ospite then 1 else 0 end as pts,
           1 as played,
           case when gol_casa > gol_ospite then 1 else 0 end as w,
           case when gol_casa = gol_ospite then 1 else 0 end as d,
           case when gol_casa < gol_ospite then 1 else 0 end as l,
           gol_casa as gf, gol_ospite as ga
    from events where tipo = 'PARTITA' and giocata = true
    union all
    select squadra_ospite as team_name,
           case when gol_ospite > gol_casa then 3 when gol_ospite = gol_casa then 1 else 0 end as pts,
           1 as played,
           case when gol_ospite > gol_casa then 1 else 0 end as w,
           case when gol_ospite = gol_casa then 1 else 0 end as d,
           case when gol_ospite < gol_casa then 1 else 0 end as l,
           gol_ospite as gf, gol_casa as ga
    from events where tipo = 'PARTITA' and giocata = true
  ),
  totals as (
    select team_name,
           sum(pts) as points, sum(played) as played,
           sum(w) as wins, sum(d) as draws, sum(l) as losses,
           sum(gf) as gf, sum(ga) as ga
    from match_stats
    group by team_name
  )
  update standings s
  set punti      = coalesce(t.points, 0),
      giocate    = coalesce(t.played, 0),
      vinte      = coalesce(t.wins, 0),
      nulle      = coalesce(t.draws, 0),
      perse      = coalesce(t.losses, 0),
      gol_fatti  = coalesce(t.gf, 0),
      gol_subiti = coalesce(t.ga, 0)
  from teams tm
  left join totals t on tm.nome = t.team_name
  where s.team_id = tm.id;

  return null;
end;
$$;

-- Prevents non-managers from escalating is_manager / is_staff via UPDATE.
-- RLS cannot restrict by column; this trigger is the enforcement point.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.is_manager is distinct from old.is_manager)
     or (new.is_staff is distinct from old.is_staff) then
    if not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_manager = true
    ) then
      raise exception 'Only managers can modify role assignments';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger update_attendance_timestamp
  before update on public.attendance
  for each row execute function public.update_attendance_updated_at();

create trigger on_match_change
  after insert or update or delete on public.events
  for each row execute function public.calculate_standings();

create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- GENERATED TEAM MANAGEMENT MIGRATIONS
-- Regenerate with: npm run db:snapshot

-- Source: supabase/migrations/20260725010000_team_management.sql
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

-- Source: supabase/migrations/20260725011000_roster_import_rpc.sql
-- Transactional one-time import for Rosa_Squadra_2026-27.xlsx.

create or replace function public.import_roster_plan(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  item jsonb;
  profile_id_value uuid;
  current_season_id uuid;
  history_season_id uuid;
  created_count integer := 0;
  matched_count integer := 0;
  imported_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_plan->'people') <> 'array' then
    raise exception 'Import plan people must be an array';
  end if;

  select id into current_season_id
  from public.seasons
  where slug = p_plan->>'seasonSlug';

  select id into history_season_id
  from public.seasons
  where slug = p_plan->>'historySeasonSlug';

  if current_season_id is null or history_season_id is null then
    raise exception 'Import seasons are not configured';
  end if;

  for item in select value from jsonb_array_elements(p_plan->'people')
  loop
    profile_id_value := nullif(item->>'existingProfileId', '')::uuid;

    if profile_id_value is null then
      insert into public.profiles (
        nome,
        cognome,
        data_nascita,
        avatar_url,
        joined_on
      )
      values (
        item #>> '{profile,nome}',
        item #>> '{profile,cognome}',
        nullif(item #>> '{profile,data_nascita}', '')::date,
        nullif(item #>> '{profile,avatar_url}', ''),
        null
      )
      returning id into profile_id_value;
      created_count := created_count + 1;
    else
      update public.profiles p
      set nome = coalesce(nullif(trim(p.nome), ''), item #>> '{profile,nome}'),
          cognome = coalesce(nullif(trim(p.cognome), ''), item #>> '{profile,cognome}'),
          data_nascita = coalesce(
            p.data_nascita,
            nullif(item #>> '{profile,data_nascita}', '')::date
          ),
          avatar_url = coalesce(
            nullif(trim(p.avatar_url), ''),
            nullif(item #>> '{profile,avatar_url}', '')
          )
      where p.id = profile_id_value;

      if not found then
        raise exception 'Existing profile % not found', profile_id_value;
      end if;
      matched_count := matched_count + 1;
    end if;

    insert into public.profile_private_details (
      profile_id,
      phone,
      operational_email,
      tax_code,
      nationality,
      birth_city,
      residence_city,
      address,
      postal_code
    )
    values (
      profile_id_value,
      nullif(item #>> '{private,phone}', ''),
      nullif(item #>> '{private,operational_email}', ''),
      upper(nullif(item #>> '{private,tax_code}', '')),
      nullif(item #>> '{private,nationality}', ''),
      nullif(item #>> '{private,birth_city}', ''),
      nullif(item #>> '{private,residence_city}', ''),
      nullif(item #>> '{private,address}', ''),
      nullif(item #>> '{private,postal_code}', '')
    )
    on conflict (profile_id) do update
    set phone = coalesce(public.profile_private_details.phone, excluded.phone),
        operational_email = coalesce(
          public.profile_private_details.operational_email,
          excluded.operational_email
        ),
        tax_code = coalesce(public.profile_private_details.tax_code, excluded.tax_code),
        nationality = coalesce(
          public.profile_private_details.nationality,
          excluded.nationality
        ),
        birth_city = coalesce(
          public.profile_private_details.birth_city,
          excluded.birth_city
        ),
        residence_city = coalesce(
          public.profile_private_details.residence_city,
          excluded.residence_city
        ),
        address = coalesce(public.profile_private_details.address, excluded.address),
        postal_code = coalesce(
          public.profile_private_details.postal_code,
          excluded.postal_code
        );

    if item->'historyMembership' is not null
       and item->'historyMembership' <> 'null'::jsonb then
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
        training_only,
        status
      )
      values (
        profile_id_value,
        history_season_id,
        (item #>> '{historyMembership,category}')::public.membership_category,
        nullif(item #>> '{historyMembership,role}', ''),
        nullif(item #>> '{historyMembership,staff_function}', ''),
        nullif(item #>> '{historyMembership,jersey_number}', '')::integer,
        nullif(item #>> '{historyMembership,uniform_size}', ''),
        nullif(item #>> '{historyMembership,asi_card_number}', ''),
        nullif(item #>> '{historyMembership,department}', ''),
        coalesce((item #>> '{historyMembership,is_external}')::boolean, false),
        coalesce((item #>> '{historyMembership,is_aggregated}')::boolean, false),
        false,
        'YES'
      )
      on conflict (profile_id, season_id) do update
      set category = excluded.category,
          role = excluded.role,
          staff_function = excluded.staff_function,
          jersey_number = excluded.jersey_number,
          uniform_size = excluded.uniform_size,
          asi_card_number = excluded.asi_card_number,
          department = excluded.department,
          is_external = excluded.is_external,
          is_aggregated = excluded.is_aggregated,
          status = excluded.status;
    end if;

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
      training_only,
      operational_notes,
      status
    )
    values (
      profile_id_value,
      current_season_id,
      (item #>> '{membership,category}')::public.membership_category,
      nullif(item #>> '{membership,role}', ''),
      nullif(item #>> '{membership,staff_function}', ''),
      nullif(item #>> '{membership,jersey_number}', '')::integer,
      nullif(item #>> '{membership,uniform_size}', ''),
      nullif(item #>> '{membership,asi_card_number}', ''),
      nullif(item #>> '{membership,department}', ''),
      coalesce((item #>> '{membership,is_external}')::boolean, false),
      coalesce((item #>> '{membership,is_aggregated}')::boolean, false),
      coalesce((item #>> '{membership,training_only}')::boolean, false),
      nullif(item #>> '{membership,operational_notes}', ''),
      (item #>> '{membership,status}')::public.membership_status
    )
    on conflict (profile_id, season_id) do update
    set category = excluded.category,
        role = excluded.role,
        staff_function = excluded.staff_function,
        jersey_number = excluded.jersey_number,
        uniform_size = excluded.uniform_size,
        asi_card_number = excluded.asi_card_number,
        department = excluded.department,
        is_external = excluded.is_external,
        is_aggregated = excluded.is_aggregated,
        training_only = excluded.training_only,
        operational_notes = excluded.operational_notes,
        status = excluded.status;

    imported_count := imported_count + 1;
  end loop;

  return jsonb_build_object(
    'imported', imported_count,
    'created', created_count,
    'matched', matched_count,
    'profilesTotal', (select count(*) from public.profiles),
    'memberships2026', (
      select count(*)
      from public.season_memberships
      where season_id = current_season_id
    )
  );
end;
$$;

revoke all on function public.import_roster_plan(jsonb) from public;
grant execute on function public.import_roster_plan(jsonb) to service_role;

-- Source: supabase/migrations/20260725011500_api_grants.sql
-- Explicit Data API privileges for projects with auto_expose_new_tables=false.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.teams to anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant select on public.standings to anon, authenticated;
grant select on public.comunicati to anon, authenticated;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- Preserve the one-time importer as service-only after the broad function grant.
revoke execute on function public.import_roster_plan(jsonb) from anon, authenticated;

-- Source: supabase/migrations/20260725020000_accounts_notifications_storage.sql
-- Account association, notifications, private storage and operational RPCs.

begin;

do $$ begin
  create type public.association_request_status as enum ('PENDING', 'APPROVED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_delivery_status as enum (
    'PENDING', 'PROCESSING', 'DELIVERED', 'FAILED'
  );
exception when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_touch_updated_at on public.events;
create trigger trg_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create table if not exists public.account_association_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  status                public.association_request_status not null default 'PENDING',
  requested_at          timestamptz not null default now(),
  reviewed_at           timestamptz,
  reviewed_by           uuid references public.profiles(id) on delete set null,
  unique (user_id)
);

create unique index if not exists association_pending_profile_idx
  on public.account_association_requests (profile_id)
  where status = 'PENDING';

create table if not exists public.rejected_account_hashes (
  email_hash    text primary key,
  rejected_at   timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),
  check (expires_at > rejected_at)
);

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null,
  title               text not null check (nullif(trim(title), '') is not null),
  body                text not null check (nullif(trim(body), '') is not null),
  deep_link           text,
  critical            boolean not null default false,
  actor_profile_id    uuid references public.profiles(id) on delete set null,
  idempotency_key     text not null unique,
  created_at          timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  notification_id   uuid not null references public.notifications(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_recipients_user_unread_idx
  on public.notification_recipients (user_id, created_at desc)
  where read_at is null;

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  endpoint          text not null unique,
  p256dh            text not null,
  auth_secret       text not null,
  platform          text,
  user_agent        text,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, last_seen_at desc);

create table if not exists public.notification_preferences (
  user_id         uuid not null references auth.users(id) on delete cascade,
  category        text not null,
  push_enabled    boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (user_id, category)
);

create table if not exists public.notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid not null references public.notifications(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  subscription_id     uuid references public.push_subscriptions(id) on delete set null,
  idempotency_key     text not null unique,
  status              public.notification_delivery_status not null default 'PENDING',
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz not null default now(),
  last_error          text,
  delivered_at        timestamptz,
  locked_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, next_attempt_at)
  where status in ('PENDING', 'FAILED');

drop trigger if exists trg_touch_updated_at on public.notification_preferences;
create trigger trg_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at on public.notification_outbox;
create trigger trg_touch_updated_at
before update on public.notification_outbox
for each row execute function public.touch_updated_at();

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
  );

revoke all on public.claimable_profile_directory from public;
grant select on public.claimable_profile_directory to authenticated;

create or replace function public.create_notification(
  p_type text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_target_user_ids uuid[],
  p_critical boolean,
  p_idempotency_key text,
  p_actor_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  notification_id_value uuid;
begin
  if nullif(trim(p_type), '') is null
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_body), '') is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Notification type, title, body and idempotency key are required';
  end if;

  insert into public.notifications (
    type,
    title,
    body,
    deep_link,
    critical,
    actor_profile_id,
    idempotency_key
  )
  values (
    p_type,
    p_title,
    p_body,
    nullif(trim(p_deep_link), ''),
    coalesce(p_critical, false),
    p_actor_profile_id,
    p_idempotency_key
  )
  on conflict (idempotency_key) do update
  set idempotency_key = excluded.idempotency_key
  returning id into notification_id_value;

  insert into public.notification_recipients (notification_id, user_id)
  select notification_id_value, target_user_id
  from unnest(coalesce(p_target_user_ids, array[]::uuid[])) target_user_id
  where target_user_id is not null
  on conflict do nothing;

  insert into public.notification_outbox (
    notification_id,
    user_id,
    subscription_id,
    idempotency_key
  )
  select
    notification_id_value,
    subscription.user_id,
    subscription.id,
    notification_id_value::text || ':' || subscription.id::text
  from public.push_subscriptions subscription
  left join public.notification_preferences preference
    on preference.user_id = subscription.user_id
   and preference.category = p_type
  where subscription.user_id = any(coalesce(p_target_user_ids, array[]::uuid[]))
    and (coalesce(p_critical, false) or coalesce(preference.push_enabled, true))
  on conflict (idempotency_key) do nothing;

  return notification_id_value;
end;
$$;

revoke all on function public.create_notification(
  text, text, text, text, uuid[], boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_notification(
  text, text, text, text, uuid[], boolean, text, uuid
) to service_role;

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
grant execute on function public.get_app_context() to authenticated;

create or replace function public.request_profile_association(p_profile_id uuid)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.account_association_requests;
  profile_name text;
  manager_user_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.current_profile_id() is not null then
    raise exception 'Account is already associated';
  end if;

  select concat_ws(' ', nome, cognome) into profile_name
  from public.profiles
  where id = p_profile_id
    and user_id is null
    and not exists (
      select 1
      from public.account_association_requests
      where profile_id = p_profile_id
        and status = 'PENDING'
    )
  for update;

  if profile_name is null then
    raise exception 'Profile is not available';
  end if;

  insert into public.account_association_requests (user_id, profile_id)
  values (auth.uid(), p_profile_id)
  returning * into result;

  select array_agg(user_id) into manager_user_ids
  from public.profiles
  where is_manager = true
    and user_id is not null;

  perform public.create_notification(
    'ACCOUNT_ASSOCIATION_REQUEST',
    'Nuova richiesta account',
    profile_name || ' ha richiesto l’associazione del profilo.',
    '/gestione?view=account',
    manager_user_ids,
    true,
    'association-request:' || result.id::text,
    null
  );

  return result;
end;
$$;

revoke all on function public.request_profile_association(uuid) from public;
grant execute on function public.request_profile_association(uuid) to authenticated;

create or replace function public.respond_to_season_confirmation(
  p_season_slug text,
  p_response text
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.season_memberships;
  mapped_status public.membership_status;
begin
  mapped_status := case upper(trim(p_response))
    when 'YES' then 'YES'::public.membership_status
    when 'MAYBE' then 'MAYBE'::public.membership_status
    when 'NO' then 'NO'::public.membership_status
    when 'DEFER' then 'PENDING'::public.membership_status
    else null
  end;

  if mapped_status is null then
    raise exception 'Unsupported confirmation response';
  end if;

  update public.season_memberships m
  set status = mapped_status,
      last_confirmation_requested_at = now(),
      updated_by = public.current_profile_id()
  from public.seasons s
  where m.profile_id = public.current_profile_id()
    and m.season_id = s.id
    and s.slug = p_season_slug
  returning m.* into result;

  if result.id is null then
    raise exception 'Season membership not found';
  end if;

  return result;
end;
$$;

revoke all on function public.respond_to_season_confirmation(text, text) from public;
grant execute on function public.respond_to_season_confirmation(text, text) to authenticated;

create or replace function public.mark_season_confirmation_prompted(
  p_season_slug text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  prompted_at timestamptz;
begin
  update public.season_memberships m
  set last_confirmation_requested_at = now()
  from public.seasons s
  where m.profile_id = public.current_profile_id()
    and m.season_id = s.id
    and s.slug = p_season_slug
    and m.status = 'PENDING'
  returning m.last_confirmation_requested_at into prompted_at;
  return prompted_at;
end;
$$;

revoke all on function public.mark_season_confirmation_prompted(text) from public;
grant execute on function public.mark_season_confirmation_prompted(text) to authenticated;

create or replace function public.set_event_checkin(
  p_event_id uuid,
  p_profile_id uuid,
  p_status public.event_checkin_status
)
returns public.event_checkins
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid;
  result public.event_checkins;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  actor := public.current_profile_id();

  if not exists (
    select 1
    from public.events e
    join public.season_memberships m
      on m.season_id = e.season_id
     and m.profile_id = p_profile_id
     and m.status in ('YES', 'MAYBE')
    where e.id = p_event_id
  ) then
    raise exception 'Profile is not in the event season roster';
  end if;

  insert into public.event_checkins (
    event_id,
    profile_id,
    status,
    checked_in_by
  )
  values (p_event_id, p_profile_id, p_status, actor)
  on conflict (event_id, profile_id) do update
  set status = excluded.status,
      checked_in_by = excluded.checked_in_by
  returning * into result;

  if p_status = 'PRESENT' then
    insert into public.attendance (
      event_id,
      profile_id,
      modified_by,
      status
    )
    values (p_event_id, p_profile_id, actor, 'PRESENTE')
    on conflict (event_id, profile_id) do update
    set status = 'PRESENTE',
        modified_by = excluded.modified_by;
  end if;

  return result;
end;
$$;

revoke all on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) from public;
grant execute on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) to authenticated;

create or replace function public.declare_payment(
  p_payment_id uuid,
  p_method public.payment_method
)
returns public.payments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.payments;
begin
  update public.payments p
  set status = 'PENDING_REVIEW',
      method = p_method,
      declared_at = now(),
      updated_by = public.current_profile_id()
  where p.id = p_payment_id
    and exists (
      select 1
      from public.season_memberships m
      where m.id = p.membership_id
        and m.profile_id = public.current_profile_id()
    )
    and p.status <> 'PAID'
  returning p.* into result;

  if result.id is null then
    raise exception 'Payment not available';
  end if;
  return result;
end;
$$;

revoke all on function public.declare_payment(uuid, public.payment_method) from public;
grant execute on function public.declare_payment(uuid, public.payment_method) to authenticated;

create or replace function public.send_manager_notification(
  p_type text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_target_user_ids uuid[],
  p_critical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  return public.create_notification(
    p_type,
    p_title,
    p_body,
    p_deep_link,
    p_target_user_ids,
    p_critical,
    'manual:' || gen_random_uuid()::text,
    public.current_profile_id()
  );
end;
$$;

revoke all on function public.send_manager_notification(
  text, text, text, text, uuid[], boolean
) from public;
grant execute on function public.send_manager_notification(
  text, text, text, text, uuid[], boolean
) to authenticated;

create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
  manager_users uuid[];
begin
  select p.user_id into target_user
  from public.season_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.id = new.membership_id;

  if tg_op = 'INSERT' and target_user is not null then
    perform public.create_notification(
      'PAYMENT_DUE',
      'Nuova quota',
      new.description,
      '/profilo?section=quote',
      array[target_user],
      true,
      'payment-due:' || new.id::text,
      new.created_by
    );
  elsif tg_op = 'UPDATE'
        and new.status = 'PENDING_REVIEW'
        and old.status is distinct from new.status then
    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager = true and user_id is not null;

    perform public.create_notification(
      'PAYMENT_DECLARED',
      'Pagamento da verificare',
      new.description,
      '/gestione?view=quote',
      manager_users,
      true,
      'payment-declared:' || new.id::text || ':' || new.declared_at::text,
      new.updated_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_payment_change on public.payments;
create trigger trg_notify_payment_change
after insert or update on public.payments
for each row execute function public.notify_payment_change();

create or replace function public.notify_certificate_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
  manager_users uuid[];
begin
  select p.user_id into target_user
  from public.season_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.id = new.membership_id;

  if new.status = 'PENDING_REVIEW'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager = true and user_id is not null;

    perform public.create_notification(
      'CERTIFICATE_REVIEW',
      'Certificato da verificare',
      'È stato caricato un certificato agonistico.',
      '/gestione?view=certificati',
      manager_users,
      true,
      'certificate-review:' || new.id::text || ':' || new.updated_at::text,
      new.updated_by
    );
  elsif tg_op = 'UPDATE'
        and new.status in ('VALID', 'REJECTED')
        and old.status is distinct from new.status
        and target_user is not null then
    perform public.create_notification(
      'CERTIFICATE_RESULT',
      case when new.status = 'VALID'
        then 'Certificato verificato'
        else 'Certificato respinto'
      end,
      coalesce(new.rejection_reason, 'Il certificato agonistico è valido.'),
      '/profilo?section=certificato',
      array[target_user],
      true,
      'certificate-result:' || new.id::text || ':' || new.status::text,
      new.verified_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_certificate_change on public.medical_certificates;
create trigger trg_notify_certificate_change
after insert or update on public.medical_certificates
for each row execute function public.notify_certificate_change();

create or replace function public.notify_event_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_users uuid[];
begin
  if row(
    new.data_ora,
    new.data_fine_ora,
    new.luogo,
    new.cancellato,
    new.note
  ) is distinct from row(
    old.data_ora,
    old.data_fine_ora,
    old.luogo,
    old.cancellato,
    old.note
  ) then
    select array_agg(distinct p.user_id) into target_users
    from public.profiles p
    join public.season_memberships m on m.profile_id = p.id
    where m.season_id = new.season_id
      and m.status in ('YES', 'MAYBE')
      and p.user_id is not null;

    perform public.create_notification(
      'EVENT_UPDATED',
      'Evento aggiornato',
      case when new.tipo = 'PARTITA' then 'La partita è stata aggiornata.'
           else 'L’allenamento è stato aggiornato.' end,
      '/evento/' || new.id::text,
      target_users,
      true,
      'event-update:' || new.id::text || ':' || txid_current()::text,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_event_update on public.events;
create trigger trg_notify_event_update
after update on public.events
for each row execute function public.notify_event_update();

alter table public.account_association_requests enable row level security;
alter table public.rejected_account_hashes enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;

create policy association_request_self_manager_select
on public.account_association_requests for select to authenticated
using (user_id = auth.uid() or public.is_current_user_manager());

create policy notifications_recipient_manager_select
on public.notifications for select to authenticated
using (
  exists (
    select 1
    from public.notification_recipients recipient
    where recipient.notification_id = id
      and recipient.user_id = auth.uid()
  )
  or public.is_current_user_manager()
);

create policy notification_recipients_self_manager_select
on public.notification_recipients for select to authenticated
using (user_id = auth.uid() or public.is_current_user_manager());

create policy notification_recipients_self_update
on public.notification_recipients for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy push_subscriptions_self_all
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy notification_preferences_self_all
on public.notification_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.account_association_requests to authenticated;
grant select on public.notifications to authenticated;
grant select, update on public.notification_recipients to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'passport-photos',
    'passport-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'medical-certificates',
    'medical-certificates',
    false,
    10485760,
    array['application/pdf']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists passport_photos_owner_manager_select on storage.objects;
create policy passport_photos_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'passport-photos'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

drop policy if exists passport_photos_owner_manager_insert on storage.objects;
create policy passport_photos_owner_manager_insert
on storage.objects for insert to authenticated
with check (
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
with check (bucket_id = 'passport-photos');

drop policy if exists medical_certificates_owner_manager_select on storage.objects;
create policy medical_certificates_owner_manager_select
on storage.objects for select to authenticated
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

drop policy if exists medical_certificates_owner_manager_insert on storage.objects;
create policy medical_certificates_owner_manager_insert
on storage.objects for insert to authenticated
with check (
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
with check (bucket_id = 'medical-certificates');

grant all privileges on public.account_association_requests to service_role;
grant all privileges on public.rejected_account_hashes to service_role;
grant all privileges on public.notifications to service_role;
grant all privileges on public.notification_recipients to service_role;
grant all privileges on public.push_subscriptions to service_role;
grant all privileges on public.notification_preferences to service_role;
grant all privileges on public.notification_outbox to service_role;

commit;

-- Source: supabase/migrations/20260725021000_notification_storage_hardening.sql
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

-- Source: supabase/migrations/20260725022000_notification_outbox_rpc.sql
-- Atomic notification outbox claiming and retry bookkeeping.

begin;

create or replace function public.claim_notification_outbox(
  p_limit integer default 25
)
returns table (
  outbox_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  title text,
  body text,
  deep_link text,
  notification_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_limit, 0) < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100';
  end if;

  update public.notification_outbox
  set status = 'FAILED',
      locked_at = null,
      next_attempt_at = now(),
      last_error = coalesce(last_error, 'Worker lease expired')
  where status = 'PROCESSING'
    and locked_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('PENDING', 'FAILED')
      and outbox.next_attempt_at <= now()
      and outbox.attempts < 5
      and outbox.subscription_id is not null
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_outbox outbox
    set status = 'PROCESSING',
        attempts = outbox.attempts + 1,
        locked_at = now(),
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_secret,
    notification.title,
    notification.body,
    notification.deep_link,
    notification.type
  from claimed
  join public.notifications notification
    on notification.id = claimed.notification_id
  join public.push_subscriptions subscription
    on subscription.id = claimed.subscription_id;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_outbox_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.notification_outbox
  set status = case
        when p_success then 'DELIVERED'::public.notification_delivery_status
        else 'FAILED'::public.notification_delivery_status
      end,
      delivered_at = case when p_success then now() else null end,
      locked_at = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Push delivery failed'), 1000) end,
      next_attempt_at = case
        when p_success then next_attempt_at
        else now() + make_interval(
          mins => least(60, greatest(1, power(2, attempts)::integer))
        )
      end
  where id = p_outbox_id
    and status = 'PROCESSING';

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Outbox item is not being processed';
  end if;
end;
$$;

revoke all on function public.claim_notification_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer)
  to service_role;
grant execute on function public.complete_notification_delivery(uuid, boolean, text)
  to service_role;

commit;

-- Source: supabase/migrations/20260725023000_manager_account_activity.sql
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

-- Source: supabase/migrations/20260725024000_manager_people_rpc.sql
-- Transactional manager workflow for adding people to a season.

begin;

create or replace function public.manager_create_person(
  p_season_slug text,
  p_nome text,
  p_cognome text,
  p_category public.membership_category,
  p_status public.membership_status,
  p_phone text default null,
  p_role text default null,
  p_staff_function text default null,
  p_training_only boolean default false,
  p_joined_on date default null
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id_value uuid;
  season_id_value uuid;
  result public.season_memberships;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null or nullif(trim(p_cognome), '') is null then
    raise exception 'Name and surname are required';
  end if;
  if p_category = 'PLAYER' and p_role is not null
     and p_role <> all(array['PORTIERE','DIFENSORE','CENTROCAMPISTA','ATTACCANTE']) then
    raise exception 'Unsupported player role';
  end if;

  select id into season_id_value
  from public.seasons
  where slug = p_season_slug;
  if season_id_value is null then
    raise exception 'Season not found';
  end if;

  insert into public.profiles (
    nome,
    cognome,
    ruolo,
    is_staff,
    joined_on,
    updated_at
  )
  values (
    trim(p_nome),
    trim(p_cognome),
    case when p_category = 'PLAYER' then p_role else null end,
    p_category = 'STAFF',
    p_joined_on,
    now()
  )
  returning id into profile_id_value;

  insert into public.profile_private_details (profile_id, phone, updated_by)
  values (
    profile_id_value,
    nullif(trim(p_phone), ''),
    public.current_profile_id()
  );

  insert into public.season_memberships (
    profile_id,
    season_id,
    category,
    role,
    staff_function,
    training_only,
    status,
    updated_by
  )
  values (
    profile_id_value,
    season_id_value,
    p_category,
    case when p_category = 'PLAYER' then p_role else null end,
    case when p_category = 'STAFF'
      then coalesce(nullif(trim(p_staff_function), ''), 'Staff')
      else null
    end,
    coalesce(p_training_only, false),
    p_status,
    public.current_profile_id()
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) from public, anon;
grant execute on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) to authenticated, service_role;

commit;

-- Source: supabase/migrations/20260725025000_manager_update_rpcs.sql
-- Transactional manager edits for profiles, memberships, payments and certificates.

begin;

create or replace function public.manager_update_person(
  p_profile_id uuid,
  p_membership_id uuid,
  p_profile jsonb,
  p_membership jsonb,
  p_private jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.season_memberships;
  next_category public.membership_category;
  next_registration public.registration_status;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'nome'), '') is null
     or nullif(trim(p_profile->>'cognome'), '') is null then
    raise exception 'Name and surname are required';
  end if;

  select (p_membership->>'category')::public.membership_category,
         (p_membership->>'registration_status')::public.registration_status
  into next_category, next_registration;

  update public.profiles
  set nome = trim(p_profile->>'nome'),
      cognome = trim(p_profile->>'cognome'),
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  if not found then raise exception 'Profile not found'; end if;

  update public.profile_private_details
  set phone = nullif(trim(p_private->>'phone'), ''),
      operational_email = nullif(trim(p_private->>'operational_email'), ''),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where profile_id = p_profile_id;

  if not found then
    insert into public.profile_private_details (
      profile_id, phone, operational_email, updated_by
    )
    values (
      p_profile_id,
      nullif(trim(p_private->>'phone'), ''),
      nullif(trim(p_private->>'operational_email'), ''),
      public.current_profile_id()
    );
  end if;

  update public.season_memberships
  set category = next_category,
      status = (p_membership->>'status')::public.membership_status,
      role = case when next_category = 'PLAYER'
        then nullif(p_membership->>'role', '') else null end,
      staff_function = case when next_category = 'STAFF'
        then coalesce(nullif(trim(p_membership->>'staff_function'), ''), 'Staff')
        else null end,
      jersey_number = nullif(p_membership->>'jersey_number', '')::integer,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
      training_only = coalesce((p_membership->>'training_only')::boolean, false),
      operational_notes = nullif(trim(p_membership->>'operational_notes'), ''),
      next_contact_on = nullif(p_membership->>'next_contact_on', '')::date,
      registration_status = next_registration,
      registration_completed_on = case when next_registration = 'ACTIVE'
        then coalesce(
          nullif(p_membership->>'registration_completed_on', '')::date,
          current_date
        )
        else null
      end,
      registration_completed_by = case when next_registration = 'ACTIVE'
        then public.current_profile_id()
        else null
      end,
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_membership_id
    and profile_id = p_profile_id
  returning * into result;

  if result.id is null then raise exception 'Membership not found'; end if;
  return result;
end;
$$;

create or replace function public.manager_verify_payment(
  p_payment_id uuid,
  p_method public.payment_method
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.payments;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  update public.payments
  set status = 'PAID',
      method = p_method,
      declared_at = coalesce(declared_at, now()),
      verified_at = now(),
      verified_by = public.current_profile_id(),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_payment_id
  returning * into result;

  if result.id is null then raise exception 'Payment not found'; end if;
  return result;
end;
$$;

create or replace function public.manager_review_certificate(
  p_certificate_id uuid,
  p_status public.medical_certificate_status,
  p_rejection_reason text default null
)
returns public.medical_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.medical_certificates;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_status not in ('VALID', 'REJECTED') then
    raise exception 'Review status must be VALID or REJECTED';
  end if;
  if p_status = 'REJECTED' and nullif(trim(p_rejection_reason), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.medical_certificates
  set status = p_status,
      rejection_reason = case when p_status = 'REJECTED'
        then trim(p_rejection_reason) else null end,
      verified_at = now(),
      verified_by = public.current_profile_id(),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_certificate_id
  returning * into result;

  if result.id is null then raise exception 'Certificate not found'; end if;
  return result;
end;
$$;

revoke all on function public.manager_update_person(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon;
revoke all on function public.manager_verify_payment(uuid, public.payment_method)
  from public, anon;
revoke all on function public.manager_review_certificate(
  uuid, public.medical_certificate_status, text
) from public, anon;

grant execute on function public.manager_update_person(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.manager_verify_payment(uuid, public.payment_method)
  to authenticated, service_role;
grant execute on function public.manager_review_certificate(
  uuid, public.medical_certificate_status, text
) to authenticated, service_role;

commit;

-- Source: supabase/migrations/20260725026000_public_stats_official_formation.sql
-- Correct public statistics aggregation and transactional official formations.

begin;

create or replace view public.public_player_statistics
with (security_barrier = true)
as
with stats as (
  select
    profile_id,
    sum(goals)::integer as goals,
    sum(assists)::integer as assists
  from public.match_player_stats
  group by profile_id
),
awards as (
  select profile_id, count(*)::integer as player_of_match
  from public.match_awards
  group by profile_id
)
select
  p.id as profile_id,
  p.nome,
  p.cognome,
  p.avatar_url,
  coalesce(stats.goals, 0)::integer as goals,
  coalesce(stats.assists, 0)::integer as assists,
  coalesce(awards.player_of_match, 0)::integer as player_of_match
from public.profiles p
left join stats on stats.profile_id = p.id
left join awards on awards.profile_id = p.id;

revoke all on public.public_player_statistics from public;
grant select on public.public_player_statistics to anon, authenticated;

create or replace function public.publish_official_formation(
  p_event_id uuid,
  p_formation_module text,
  p_shirt_color text,
  p_captain_profile_id uuid,
  p_vice_captain_profile_id uuid,
  p_snapshot jsonb,
  p_players jsonb
)
returns public.official_formations
language plpgsql
security definer
set search_path = public
as $$
declare
  formation public.official_formations;
  target_users uuid[];
  event_label text;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_formation_module), '') is null then
    raise exception 'Formation module is required';
  end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_players, '[]'::jsonb)) = 0 then
    raise exception 'At least one player is required';
  end if;

  insert into public.official_formations (
    event_id,
    formation_module,
    shirt_color,
    captain_profile_id,
    vice_captain_profile_id,
    snapshot,
    status,
    published_by,
    published_at,
    withdrawn_at
  )
  values (
    p_event_id,
    trim(p_formation_module),
    nullif(trim(p_shirt_color), ''),
    p_captain_profile_id,
    p_vice_captain_profile_id,
    coalesce(p_snapshot, '{}'::jsonb),
    'PUBLISHED',
    public.current_profile_id(),
    now(),
    null
  )
  on conflict (event_id) do update
  set formation_module = excluded.formation_module,
      shirt_color = excluded.shirt_color,
      captain_profile_id = excluded.captain_profile_id,
      vice_captain_profile_id = excluded.vice_captain_profile_id,
      snapshot = excluded.snapshot,
      status = 'PUBLISHED',
      published_by = excluded.published_by,
      published_at = now(),
      withdrawn_at = null,
      updated_at = now()
  returning * into formation;

  delete from public.official_formation_players
  where formation_id = formation.id;

  insert into public.official_formation_players (
    formation_id,
    profile_id,
    player_snapshot,
    is_starter,
    position_key,
    sort_order
  )
  select
    formation.id,
    player.profile_id,
    player.player_snapshot,
    player.is_starter,
    nullif(trim(player.position_key), ''),
    player.sort_order
  from jsonb_to_recordset(p_players) as player(
    profile_id uuid,
    player_snapshot jsonb,
    is_starter boolean,
    position_key text,
    sort_order integer
  );

  select
    coalesce(e.avversario, e.squadra_ospite, e.squadra_casa, 'prossima partita'),
    array_agg(distinct p.user_id) filter (where p.user_id is not null)
  into event_label, target_users
  from public.events e
  join public.season_memberships membership
    on membership.season_id = e.season_id
   and membership.status in ('YES', 'MAYBE')
  join public.profiles p on p.id = membership.profile_id
  where e.id = p_event_id
  group by e.id;

  perform public.create_notification(
    'OFFICIAL_FORMATION_PUBLISHED',
    'Formazione ufficiale pubblicata',
    'È disponibile la formazione per ' || coalesce(event_label, 'la prossima partita') || '.',
    '/evento/' || p_event_id::text,
    target_users,
    true,
    'official-formation:' || formation.id::text || ':' || formation.published_at::text,
    public.current_profile_id()
  );

  return formation;
end;
$$;

revoke all on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
) to authenticated, service_role;

commit;

-- Source: supabase/migrations/20260725027000_profile_self_service_hardening.sql
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

-- Source: supabase/migrations/20260725028000_app_context_open_payments.sql
begin;

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
  ),
  open_payments as (
    select count(*)::integer as count, coalesce(sum(p.amount_due), 0) as amount
    from public.payments p
    join membership m on m.id = p.membership_id
    where p.status <> 'PAID'
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
    'openPayments',
    (
      select jsonb_build_object('count', p.count, 'amount', p.amount)
      from open_payments p
    ),
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

-- Source: supabase/migrations/20260725029000_notification_dispatch_schedule.sql
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_pending_notifications()
returns void
language plpgsql
security definer
set search_path = private, vault, net, pg_catalog
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret
    into dispatch_url
    from vault.decrypted_secrets
   where name = 'notification_dispatch_url'
   limit 1;

  select decrypted_secret
    into dispatch_secret
    from vault.decrypted_secrets
   where name = 'notification_dispatch_secret'
   limit 1;

  if dispatch_url is null or dispatch_secret is null then
    return;
  end if;

  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.dispatch_pending_notifications() from public;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'dispatch-team-notifications'
   limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'dispatch-team-notifications',
    '* * * * *',
    'select private.dispatch_pending_notifications();'
  );
end;
$$;

commit;

-- Source: supabase/migrations/20260725030000_review_hardening.sql
-- Close review findings around data boundaries, concurrent edits and storage.

begin;

create or replace view public.public_profile_directory
with (security_barrier = true)
as
select
  p.id,
  p.nome,
  p.cognome,
  p.avatar_url
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
where public.is_current_user_associated()
  and (now() at time zone 'Europe/Rome')::date between s.starts_on and s.ends_on
  and m.status in ('YES', 'MAYBE');

create or replace view public.public_player_statistics
with (security_barrier = true)
as
with active_season as (
  select id
  from public.seasons
  where (now() at time zone 'Europe/Rome')::date between starts_on and ends_on
),
public_players as (
  select distinct p.id, p.nome, p.cognome, p.avatar_url
  from public.profiles p
  join public.season_memberships membership on membership.profile_id = p.id
  join active_season season on season.id = membership.season_id
  where membership.category = 'PLAYER'
    and membership.status in ('YES', 'MAYBE')
),
stats as (
  select
    player_stats.profile_id,
    sum(player_stats.goals)::integer as goals,
    sum(player_stats.assists)::integer as assists
  from public.match_player_stats player_stats
  join public.events event on event.id = player_stats.event_id
  join active_season season on season.id = event.season_id
  group by player_stats.profile_id
),
awards as (
  select award.profile_id, count(*)::integer as player_of_match
  from public.match_awards award
  join public.events event on event.id = award.event_id
  join active_season season on season.id = event.season_id
  group by award.profile_id
)
select
  player.id as profile_id,
  player.nome,
  player.cognome,
  player.avatar_url,
  coalesce(stats.goals, 0)::integer as goals,
  coalesce(stats.assists, 0)::integer as assists,
  coalesce(awards.player_of_match, 0)::integer as player_of_match
from public_players player
left join stats on stats.profile_id = player.id
left join awards on awards.profile_id = player.id;

revoke all on public.public_profile_directory from public;
revoke all on public.authenticated_active_roster from public;
revoke all on public.public_player_statistics from public;
grant select on public.public_profile_directory to anon, authenticated;
grant select on public.authenticated_active_roster to authenticated;
grant select on public.public_player_statistics to anon, authenticated;

create or replace function public.request_profile_association(p_profile_id uuid)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.account_association_requests;
  profile_name text;
  manager_user_ids uuid[];
  requester_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.current_profile_id() is not null then
    raise exception 'Account is already associated';
  end if;

  select email into requester_email
  from auth.users
  where id = auth.uid();

  if requester_email is not null and exists (
    select 1
    from public.rejected_account_hashes rejected
    where rejected.email_hash =
      encode(extensions.digest(lower(trim(requester_email)), 'sha256'), 'hex')
      and rejected.expires_at > now()
  ) then
    raise exception 'Account temporarily blocked after rejection';
  end if;

  select concat_ws(' ', nome, cognome) into profile_name
  from public.profiles
  where id = p_profile_id
    and user_id is null
    and not exists (
      select 1
      from public.account_association_requests
      where profile_id = p_profile_id
        and status = 'PENDING'
    )
  for update;

  if profile_name is null then
    raise exception 'Profile is not available';
  end if;

  insert into public.account_association_requests (user_id, profile_id)
  values (auth.uid(), p_profile_id)
  returning * into result;

  select array_agg(user_id) into manager_user_ids
  from public.profiles
  where is_manager = true
    and user_id is not null;

  perform public.create_notification(
    'ACCOUNT_ASSOCIATION_REQUEST',
    'Nuova richiesta account',
    profile_name || ' ha richiesto l’associazione del profilo.',
    '/gestione?view=account',
    manager_user_ids,
    true,
    'association-request:' || result.id::text,
    null
  );

  return result;
end;
$$;

revoke all on function public.request_profile_association(uuid)
  from public, anon;
grant execute on function public.request_profile_association(uuid)
  to authenticated;

create or replace function public.set_event_checkin(
  p_event_id uuid,
  p_profile_id uuid,
  p_status public.event_checkin_status
)
returns public.event_checkins
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid;
  result public.event_checkins;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  actor := public.current_profile_id();

  if not exists (
    select 1
    from public.events e
    join public.season_memberships m
      on m.season_id = e.season_id
     and m.profile_id = p_profile_id
     and m.status in ('YES', 'MAYBE')
    where e.id = p_event_id
  ) then
    raise exception 'Profile is not in the event season roster';
  end if;

  insert into public.event_checkins (
    event_id,
    profile_id,
    status,
    checked_in_by
  )
  values (p_event_id, p_profile_id, p_status, actor)
  on conflict (event_id, profile_id) do update
  set status = excluded.status,
      checked_in_by = excluded.checked_in_by
  returning * into result;

  if p_status = 'PRESENT' then
    insert into public.attendance (
      event_id,
      profile_id,
      modified_by,
      status
    )
    values (p_event_id, p_profile_id, actor, 'PRESENTE')
    on conflict (event_id, profile_id) do update
    set status = 'PRESENTE',
        modified_by = excluded.modified_by;
  else
    delete from public.match_player_stats
    where event_id = p_event_id
      and profile_id = p_profile_id;

    delete from public.match_awards
    where event_id = p_event_id
      and profile_id = p_profile_id;
  end if;

  return result;
end;
$$;

revoke all on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) from public, anon;
grant execute on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) to authenticated;

drop function if exists public.manager_update_person(
  uuid, uuid, jsonb, jsonb, jsonb
);

create function public.manager_update_person(
  p_profile_id uuid,
  p_membership_id uuid,
  p_expected_profile_updated_at timestamptz,
  p_expected_membership_updated_at timestamptz,
  p_expected_private_updated_at timestamptz,
  p_profile jsonb,
  p_membership jsonb,
  p_private jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.season_memberships;
  profile_row public.profiles;
  private_row public.profile_private_details;
  private_exists boolean;
  next_category public.membership_category;
  next_registration public.registration_status;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'nome'), '') is null
     or nullif(trim(p_profile->>'cognome'), '') is null then
    raise exception 'Name and surname are required';
  end if;

  select * into profile_row
  from public.profiles
  where id = p_profile_id
  for update;

  if profile_row.id is null then
    raise exception 'Profile not found';
  end if;

  select * into private_row
  from public.profile_private_details
  where profile_id = p_profile_id
  for update;
  private_exists := found;

  select * into result
  from public.season_memberships
  where id = p_membership_id
    and profile_id = p_profile_id
  for update;

  if result.id is null then
    raise exception 'Membership not found';
  end if;
  if profile_row.updated_at is distinct from p_expected_profile_updated_at
     or result.updated_at is distinct from p_expected_membership_updated_at
     or (
       private_exists
       and private_row.updated_at is distinct from p_expected_private_updated_at
     )
     or (
       not private_exists
       and p_expected_private_updated_at is not null
     ) then
    raise exception 'Person changed by another manager'
      using errcode = '40001';
  end if;

  select (p_membership->>'category')::public.membership_category,
         (p_membership->>'registration_status')::public.registration_status
  into next_category, next_registration;

  update public.profiles
  set nome = trim(p_profile->>'nome'),
      cognome = trim(p_profile->>'cognome'),
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.profile_private_details
  set phone = nullif(trim(p_private->>'phone'), ''),
      operational_email = nullif(trim(p_private->>'operational_email'), ''),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where profile_id = p_profile_id;

  if not found then
    insert into public.profile_private_details (
      profile_id, phone, operational_email, updated_by
    )
    values (
      p_profile_id,
      nullif(trim(p_private->>'phone'), ''),
      nullif(trim(p_private->>'operational_email'), ''),
      public.current_profile_id()
    );
  end if;

  update public.season_memberships
  set category = next_category,
      status = (p_membership->>'status')::public.membership_status,
      role = case when next_category = 'PLAYER'
        then nullif(p_membership->>'role', '') else null end,
      staff_function = case when next_category = 'STAFF'
        then coalesce(nullif(trim(p_membership->>'staff_function'), ''), 'Staff')
        else null end,
      jersey_number = nullif(p_membership->>'jersey_number', '')::integer,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
      training_only = coalesce((p_membership->>'training_only')::boolean, false),
      operational_notes = nullif(trim(p_membership->>'operational_notes'), ''),
      next_contact_on = nullif(p_membership->>'next_contact_on', '')::date,
      registration_status = next_registration,
      registration_completed_on = case when next_registration = 'ACTIVE'
        then coalesce(
          nullif(p_membership->>'registration_completed_on', '')::date,
          current_date
        )
        else null
      end,
      registration_completed_by = case when next_registration = 'ACTIVE'
        then public.current_profile_id()
        else null
      end,
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_membership_id
    and profile_id = p_profile_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public Avatar 1oj01fe_0" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_1" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_2" on storage.objects;
drop policy if exists "Upload Avatar Authenticated 1oj01fe_3" on storage.objects;
drop policy if exists avatars_owner_manager_select on storage.objects;
drop policy if exists avatars_owner_manager_insert on storage.objects;
drop policy if exists avatars_owner_manager_update on storage.objects;
drop policy if exists avatars_owner_manager_delete on storage.objects;

do $$
declare
  legacy_policy record;
begin
  for legacy_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%avatar%'
        or coalesce(qual, '') ilike '%avatars%'
        or coalesce(with_check, '') ilike '%avatars%'
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      legacy_policy.policyname
    );
  end loop;
end;
$$;

create policy avatars_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy avatars_owner_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'players'
  and (
    split_part(storage.filename(name), '.', 1) =
      public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

commit;

-- Source: supabase/migrations/20260725031000_spec_completion.sql
-- Complete season-aware event rosters and interested-account onboarding.

begin;

create or replace function public.get_event_roster(p_event_id uuid)
returns table (
  profile_id uuid,
  nome text,
  cognome text,
  avatar_url text,
  data_nascita date,
  category public.membership_category,
  role text,
  staff_function text,
  jersey_number integer,
  status public.membership_status,
  training_only boolean,
  department text,
  is_external boolean,
  is_aggregated boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_current_user_associated() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.nome,
    profile.cognome,
    profile.avatar_url,
    profile.data_nascita,
    membership.category,
    membership.role,
    membership.staff_function,
    membership.jersey_number,
    membership.status,
    membership.training_only,
    membership.department,
    membership.is_external,
    membership.is_aggregated
  from public.events event
  join public.season_memberships membership
    on membership.season_id = event.season_id
  join public.profiles profile
    on profile.id = membership.profile_id
  where event.id = p_event_id
    and membership.status in ('YES', 'MAYBE')
  order by profile.cognome, profile.nome;
end;
$$;

revoke all on function public.get_event_roster(uuid) from public, anon;
grant execute on function public.get_event_roster(uuid)
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

  update public.season_memberships membership
  set status = 'PENDING',
      last_confirmation_requested_at = null,
      updated_by = p_reviewer_profile_id,
      updated_at = now()
  where membership.profile_id = request_row.profile_id
    and membership.status = 'INTERESTED'
    and membership.season_id = (
      select season.id
      from public.seasons season
      order by season.starts_on desc
      limit 1
    );

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

create or replace function public.manager_update_person(
  p_profile_id uuid,
  p_membership_id uuid,
  p_expected_profile_updated_at timestamptz,
  p_expected_membership_updated_at timestamptz,
  p_expected_private_updated_at timestamptz,
  p_profile jsonb,
  p_membership jsonb,
  p_private jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.season_memberships;
  profile_row public.profiles;
  private_row public.profile_private_details;
  private_exists boolean;
  next_category public.membership_category;
  next_registration public.registration_status;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'nome'), '') is null
     or nullif(trim(p_profile->>'cognome'), '') is null then
    raise exception 'Name and surname are required';
  end if;

  select * into profile_row
  from public.profiles
  where id = p_profile_id
  for update;

  if profile_row.id is null then
    raise exception 'Profile not found';
  end if;

  select * into private_row
  from public.profile_private_details
  where profile_id = p_profile_id
  for update;
  private_exists := found;

  select * into result
  from public.season_memberships
  where id = p_membership_id
    and profile_id = p_profile_id
  for update;

  if result.id is null then
    raise exception 'Membership not found';
  end if;
  if profile_row.updated_at is distinct from p_expected_profile_updated_at
     or result.updated_at is distinct from p_expected_membership_updated_at
     or (
       private_exists
       and private_row.updated_at is distinct from p_expected_private_updated_at
     )
     or (
       not private_exists
       and p_expected_private_updated_at is not null
     ) then
    raise exception 'Person changed by another manager'
      using errcode = '40001';
  end if;

  select (p_membership->>'category')::public.membership_category,
         (p_membership->>'registration_status')::public.registration_status
  into next_category, next_registration;

  update public.profiles
  set nome = trim(p_profile->>'nome'),
      cognome = trim(p_profile->>'cognome'),
      data_nascita = nullif(p_profile->>'data_nascita', '')::date,
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  update public.profile_private_details
  set phone = nullif(trim(p_private->>'phone'), ''),
      operational_email = nullif(trim(p_private->>'operational_email'), ''),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where profile_id = p_profile_id;

  if not found then
    insert into public.profile_private_details (
      profile_id, phone, operational_email, updated_by
    )
    values (
      p_profile_id,
      nullif(trim(p_private->>'phone'), ''),
      nullif(trim(p_private->>'operational_email'), ''),
      public.current_profile_id()
    );
  end if;

  update public.season_memberships
  set category = next_category,
      status = (p_membership->>'status')::public.membership_status,
      role = case when next_category = 'PLAYER'
        then nullif(p_membership->>'role', '') else null end,
      staff_function = case when next_category = 'STAFF'
        then coalesce(nullif(trim(p_membership->>'staff_function'), ''), 'Staff')
        else null end,
      jersey_number = nullif(p_membership->>'jersey_number', '')::integer,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
      training_only = coalesce((p_membership->>'training_only')::boolean, false),
      operational_notes = nullif(trim(p_membership->>'operational_notes'), ''),
      next_contact_on = nullif(p_membership->>'next_contact_on', '')::date,
      registration_status = next_registration,
      registration_completed_on = case when next_registration = 'ACTIVE'
        then coalesce(
          nullif(p_membership->>'registration_completed_on', '')::date,
          current_date
        )
        else null
      end,
      registration_completed_by = case when next_registration = 'ACTIVE'
        then public.current_profile_id()
        else null
      end,
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_membership_id
    and profile_id = p_profile_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.manager_update_person(
  uuid, uuid, timestamptz, timestamptz, timestamptz, jsonb, jsonb, jsonb
) to authenticated, service_role;

commit;

-- Source: supabase/migrations/20260725032000_function_execute_hardening.sql
-- Keep PostgREST RPC exposure explicit. Hosted Supabase grants EXECUTE on new
-- functions to API roles by default, including SECURITY DEFINER trigger helpers.

begin;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke execute on all functions in schema public
  from public, anon, authenticated;

-- Authenticated client RPCs. Authorization is enforced inside each function.
grant execute on function public.current_profile_id()
  to authenticated, service_role;
grant execute on function public.is_current_user_associated()
  to authenticated, service_role;
grant execute on function public.is_current_user_manager()
  to authenticated, service_role;
grant execute on function public.get_app_context()
  to authenticated, service_role;
grant execute on function public.get_event_roster(uuid)
  to authenticated, service_role;
grant execute on function public.request_profile_association(uuid)
  to authenticated, service_role;
grant execute on function public.respond_to_season_confirmation(text, text)
  to authenticated, service_role;
grant execute on function public.mark_season_confirmation_prompted(text)
  to authenticated, service_role;
grant execute on function public.set_event_checkin(
  uuid,
  uuid,
  public.event_checkin_status
) to authenticated, service_role;
grant execute on function public.declare_payment(
  uuid,
  public.payment_method
) to authenticated, service_role;
grant execute on function public.send_manager_notification(
  text,
  text,
  text,
  text,
  uuid[],
  boolean
) to authenticated, service_role;
grant execute on function public.update_membership_if_current(
  uuid,
  timestamptz,
  jsonb
) to authenticated, service_role;
grant execute on function public.touch_manager_activity(text)
  to authenticated, service_role;
grant execute on function public.manager_create_person(
  text,
  text,
  text,
  public.membership_category,
  public.membership_status,
  text,
  text,
  text,
  boolean,
  date
) to authenticated, service_role;
grant execute on function public.manager_update_person(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to authenticated, service_role;
grant execute on function public.manager_verify_payment(
  uuid,
  public.payment_method
) to authenticated, service_role;
grant execute on function public.manager_review_certificate(
  uuid,
  public.medical_certificate_status,
  text
) to authenticated, service_role;
grant execute on function public.publish_official_formation(
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb,
  jsonb
) to authenticated, service_role;

-- Administrative RPCs are called only with the service-role key.
grant execute on function public.import_roster_plan(jsonb)
  to service_role;
grant execute on function public.approve_account_association(uuid, uuid)
  to service_role;
grant execute on function public.create_notification(
  text,
  text,
  text,
  text,
  uuid[],
  boolean,
  text,
  uuid
) to service_role;
grant execute on function public.claim_notification_outbox(integer)
  to service_role;
grant execute on function public.complete_notification_delivery(
  uuid,
  boolean,
  text
) to service_role;

commit;

-- Source: supabase/migrations/20260725033000_roster_role_corrections.sql
-- Keep public roster roles aligned with the confirmed real-world team roles.
-- Migrations do not carry JWT claims, while the protection triggers require
-- the same service-role claim used by administrative scripts.
select set_config('request.jwt.claim.role', 'service_role', false);

update public.profiles
set
  is_staff = false,
  ruolo = coalesce(ruolo, 'CENTROCAMPISTA')
where id = '9cdd5f23-5b99-4fb6-b7c9-54d7a978a8ff'
  and lower(nome) = 'elio'
  and lower(cognome) in ('dorbolò', 'dorbolo');

update public.season_memberships
set
  category = 'PLAYER',
  role = coalesce(
    role,
    (
      select profile.ruolo
      from public.profiles as profile
      where profile.id = season_memberships.profile_id
    ),
    'CENTROCAMPISTA'
  ),
  staff_function = null
where profile_id = '9cdd5f23-5b99-4fb6-b7c9-54d7a978a8ff'
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = season_memberships.profile_id
      and lower(profile.nome) = 'elio'
      and lower(profile.cognome) in ('dorbolò', 'dorbolo')
  );

update public.profiles
set
  is_staff = true,
  ruolo = null
where id = '65710aa2-96e3-49ad-973e-d4ddbe1b6f8d'
  and lower(nome) = 'maria carla'
  and lower(cognome) = 'menichini';

update public.season_memberships
set
  category = 'STAFF',
  role = null,
  staff_function = 'Presidente'
where profile_id = '65710aa2-96e3-49ad-973e-d4ddbe1b6f8d'
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = season_memberships.profile_id
      and lower(profile.nome) = 'maria carla'
      and lower(profile.cognome) = 'menichini'
  );

-- Source: supabase/migrations/20260728010000_public_formation_summaries.sql
-- Public next-match UI needs publication state without access to private
-- formation or player rows.
begin;

create or replace view public.public_published_formation_summaries
with (security_barrier = true)
as
select
  event_id,
  published_at
from public.official_formations
where status = 'PUBLISHED'
  and withdrawn_at is null;

revoke all on public.public_published_formation_summaries from public;
grant select on public.public_published_formation_summaries
  to anon, authenticated;

commit;

-- Source: supabase/migrations/20260729010000_season_stats_player_access.sql
-- Seasonal statistics projections and associated-player profile access.

begin;

alter table public.match_player_stats
  add column if not exists yellow_cards integer not null default 0
    check (yellow_cards >= 0),
  add column if not exists red_cards integer not null default 0
    check (red_cards >= 0);

create table public.historical_player_stats (
  season_id uuid not null references public.seasons(id) on delete cascade,
  phase_key text not null check (phase_key in (
    'FASE_1',
    'FASE_2_CALCIATORI',
    'FASE_2_PROFESSIONISTI',
    'COPPA_LAZIO_PROFESSIONISTI'
  )),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  goals integer not null default 0 check (goals >= 0),
  mvp integer not null default 0 check (mvp >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  source_url text not null check (nullif(trim(source_url), '') is not null),
  imported_at timestamptz not null default now(),
  primary key (season_id, phase_key, profile_id)
);

alter table public.historical_player_stats enable row level security;

revoke all on public.historical_player_stats
  from public, anon, authenticated;
grant select, insert, update, delete on public.historical_player_stats
  to service_role;

create or replace view public.public_player_statistics_by_phase
with (security_barrier = true)
as
with live_match_stats as (
  select
    event.season_id,
    coalesce(event.fase, 'FASE_1') as phase_key,
    player_stats.profile_id,
    sum(player_stats.goals)::integer as goals,
    sum(player_stats.assists)::integer as assists,
    sum(player_stats.yellow_cards)::integer as yellow_cards,
    sum(player_stats.red_cards)::integer as red_cards
  from public.match_player_stats player_stats
  join public.events event on event.id = player_stats.event_id
  where event.tipo = 'PARTITA'
  group by
    event.season_id,
    coalesce(event.fase, 'FASE_1'),
    player_stats.profile_id
),
live_awards as (
  select
    event.season_id,
    coalesce(event.fase, 'FASE_1') as phase_key,
    award.profile_id,
    count(*)::integer as mvp
  from public.match_awards award
  join public.events event on event.id = award.event_id
  where event.tipo = 'PARTITA'
  group by
    event.season_id,
    coalesce(event.fase, 'FASE_1'),
    award.profile_id
),
live_statistics as (
  select
    coalesce(stats.season_id, awards.season_id) as season_id,
    coalesce(stats.phase_key, awards.phase_key) as phase_key,
    coalesce(stats.profile_id, awards.profile_id) as profile_id,
    coalesce(stats.goals, 0)::integer as goals,
    coalesce(stats.assists, 0)::integer as assists,
    coalesce(awards.mvp, 0)::integer as mvp,
    coalesce(stats.yellow_cards, 0)::integer as yellow_cards,
    coalesce(stats.red_cards, 0)::integer as red_cards
  from live_match_stats stats
  full join live_awards awards
    on awards.season_id = stats.season_id
   and awards.phase_key = stats.phase_key
   and awards.profile_id = stats.profile_id
)
select
  history.season_id,
  history.phase_key,
  history.profile_id,
  history.goals,
  null::integer as assists,
  history.mvp,
  history.yellow_cards,
  history.red_cards
from public.historical_player_stats history
union all
select
  live.season_id,
  live.phase_key,
  live.profile_id,
  live.goals,
  live.assists,
  live.mvp,
  live.yellow_cards,
  live.red_cards
from live_statistics live
where not exists (
  select 1
  from public.historical_player_stats history
  where history.season_id = live.season_id
    and history.phase_key = live.phase_key
    and history.profile_id = live.profile_id
);

revoke all on public.public_player_statistics_by_phase from public;
grant select on public.public_player_statistics_by_phase
  to anon, authenticated;

create or replace view public.public_season_player_directory
with (security_barrier = true)
as
select
  membership.season_id,
  profile.id as profile_id,
  profile.nome,
  profile.cognome,
  profile.avatar_url,
  membership.role,
  membership.jersey_number
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
where membership.category = 'PLAYER'
  and (
    membership.status in ('YES', 'MAYBE')
    or exists (
      select 1
      from public.public_player_statistics_by_phase statistics
      where statistics.season_id = membership.season_id
        and statistics.profile_id = membership.profile_id
    )
  );

revoke all on public.public_season_player_directory from public;
grant select on public.public_season_player_directory
  to anon, authenticated;

create or replace function public.get_player_profile(
  p_profile_id uuid,
  p_season_id uuid
)
returns table (
  profile_id uuid,
  season_id uuid,
  nome text,
  cognome text,
  avatar_url text,
  role text,
  jersey_number integer,
  goals integer,
  assists integer,
  mvp integer,
  yellow_cards integer,
  red_cards integer
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.current_profile_id() is null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    directory.profile_id,
    directory.season_id,
    directory.nome,
    directory.cognome,
    directory.avatar_url,
    directory.role,
    directory.jersey_number,
    coalesce(sum(statistics.goals), 0)::integer,
    case
      when count(statistics.profile_id) = 0 then 0
      when count(statistics.assists) < count(statistics.profile_id) then null
      else sum(statistics.assists)::integer
    end,
    coalesce(sum(statistics.mvp), 0)::integer,
    coalesce(sum(statistics.yellow_cards), 0)::integer,
    coalesce(sum(statistics.red_cards), 0)::integer
  from public.public_season_player_directory directory
  left join public.public_player_statistics_by_phase statistics
    on statistics.season_id = directory.season_id
   and statistics.profile_id = directory.profile_id
  where directory.profile_id = p_profile_id
    and directory.season_id = p_season_id
  group by
    directory.profile_id,
    directory.season_id,
    directory.nome,
    directory.cognome,
    directory.avatar_url,
    directory.role,
    directory.jersey_number;
end;
$$;

revoke all on function public.get_player_profile(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_profile(uuid, uuid)
  to authenticated, service_role;

create or replace function public.import_historical_player_stats(
  p_season_slug text,
  p_source_url text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_season_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'Historical rows must be a non-empty JSON array';
  end if;

  if nullif(trim(p_source_url), '') is null then
    raise exception 'Historical source URL is required';
  end if;

  select season.id into target_season_id
  from public.seasons season
  where season.slug = p_season_slug;

  if target_season_id is null then
    raise exception 'Season not found: %', p_season_slug;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) incoming(row_data)
    where jsonb_typeof(incoming.row_data) <> 'object'
      or not incoming.row_data ?& array[
        'phase_key',
        'profile_id',
        'goals',
        'mvp',
        'yellow_cards',
        'red_cards'
      ]
      or incoming.row_data - array[
        'phase_key',
        'profile_id',
        'goals',
        'mvp',
        'yellow_cards',
        'red_cards'
      ] <> '{}'::jsonb
  ) then
    raise exception 'Historical rows have an invalid shape';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming(
      phase_key text,
      profile_id uuid,
      goals integer,
      mvp integer,
      yellow_cards integer,
      red_cards integer
    )
    where incoming.phase_key not in (
      'FASE_1',
      'FASE_2_CALCIATORI',
      'FASE_2_PROFESSIONISTI',
      'COPPA_LAZIO_PROFESSIONISTI'
    )
      or incoming.profile_id is null
      or incoming.goals is null
      or incoming.mvp is null
      or incoming.yellow_cards is null
      or incoming.red_cards is null
      or incoming.goals < 0
      or incoming.mvp < 0
      or incoming.yellow_cards < 0
      or incoming.red_cards < 0
      or not exists (
        select 1
        from public.season_memberships membership
        where membership.season_id = target_season_id
          and membership.profile_id = incoming.profile_id
          and membership.category = 'PLAYER'
      )
  ) then
    raise exception 'Historical rows contain invalid player statistics';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming(
      phase_key text,
      profile_id uuid
    )
    group by incoming.phase_key, incoming.profile_id
    having count(*) > 1
  ) then
    raise exception 'Historical rows contain duplicate player phases';
  end if;

  delete from public.historical_player_stats
  where season_id = target_season_id;

  insert into public.historical_player_stats (
    season_id,
    phase_key,
    profile_id,
    goals,
    mvp,
    yellow_cards,
    red_cards,
    source_url
  )
  select
    target_season_id,
    incoming.phase_key,
    incoming.profile_id,
    incoming.goals,
    incoming.mvp,
    incoming.yellow_cards,
    incoming.red_cards,
    trim(p_source_url)
  from jsonb_to_recordset(p_rows) as incoming(
    phase_key text,
    profile_id uuid,
    goals integer,
    mvp integer,
    yellow_cards integer,
    red_cards integer
  );
end;
$$;

revoke all on function public.import_historical_player_stats(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_historical_player_stats(text, text, jsonb)
  to service_role;

commit;

-- Source: supabase/migrations/20260730010000_profile_ui_preferences.sql
begin;

create table public.profile_ui_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  management_columns jsonb not null default '{}'::jsonb
    check (jsonb_typeof(management_columns) = 'object'),
  updated_at timestamptz not null default now()
);

create trigger trg_touch_updated_at
before update on public.profile_ui_preferences
for each row execute function public.touch_updated_at();

alter table public.profile_ui_preferences enable row level security;

revoke all on public.profile_ui_preferences from public, anon, authenticated;
grant select, insert, update on public.profile_ui_preferences to authenticated;
grant all privileges on public.profile_ui_preferences to service_role;

create policy profile_ui_preferences_self_select
on public.profile_ui_preferences for select to authenticated
using (profile_id = public.current_profile_id());

create policy profile_ui_preferences_self_insert
on public.profile_ui_preferences for insert to authenticated
with check (profile_id = public.current_profile_id());

create policy profile_ui_preferences_self_update
on public.profile_ui_preferences for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

commit;
