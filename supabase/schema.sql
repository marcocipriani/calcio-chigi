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
