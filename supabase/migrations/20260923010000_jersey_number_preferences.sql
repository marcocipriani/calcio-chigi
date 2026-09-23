begin;

-- Numeri di maglia stagionali.
-- Il numero ufficiale resta `season_memberships.jersey_number`: una riga per
-- stagione, quindi lo storico è già la sequenza delle membership.
-- I giocatori indicano da 1 a 5 numeri ordinati (PREFERRED/ACCEPTABLE) più
-- una lista di numeri da evitare, oppure dichiarano di non avere preferenze
-- (ricevono il numero libero più basso che nessuno ha scelto); il manager
-- pubblica una bozza e poi la conferma, scrivendo i numeri definitivi nelle
-- membership. Dopo la conferma le preferenze non si modificano più.
-- Il manager può inserire le preferenze al posto di un giocatore: `updated_by`
-- registra chi ha salvato, così la scelta resta riconoscibile come sua.

create table if not exists public.jersey_preferences (
  membership_id  uuid primary key
                 references public.season_memberships(id) on delete cascade,
  -- [{"number": 10, "level": "PREFERRED"}, ...] in ordine di preferenza;
  -- vuoto solo per chi non ha preferenze.
  choices        jsonb not null check (jsonb_typeof(choices) = 'array'),
  no_preference  boolean not null default false,
  updated_by     uuid references public.profiles(id) on delete set null,
  avoid_numbers  integer[] not null default '{}' check (
    cardinality(avoid_numbers) <= 10
    and 1 <= all(avoid_numbers)
    and 99 >= all(avoid_numbers)
  ),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    case when no_preference
      then jsonb_array_length(choices) = 0
      else jsonb_array_length(choices) between 1 and 5
    end
  )
);

-- Versionamento giornaliero: una fotografia per giocatore e giorno (ora di
-- Roma); l'ultimo salvataggio della giornata sostituisce i precedenti.
create table if not exists public.jersey_preference_versions (
  membership_id  uuid not null
                 references public.season_memberships(id) on delete cascade,
  version_on     date not null,
  choices        jsonb not null,
  no_preference  boolean not null default false,
  updated_by     uuid references public.profiles(id) on delete set null,
  avoid_numbers  integer[] not null,
  saved_at       timestamptz not null default now(),
  primary key (membership_id, version_on)
);

-- Una bozza per stagione: esiste solo se pubblicata ed è visibile a tutti gli
-- associati. Ripubblicarla la sostituisce e ne azzera la conferma.
create table if not exists public.jersey_assignment_drafts (
  season_id     uuid primary key
                references public.seasons(id) on delete cascade,
  -- [{"membership_id": "...", "jersey_number": 10 | null}, ...]
  assignments   jsonb not null check (jsonb_typeof(assignments) = 'array'),
  published_at  timestamptz not null default now(),
  published_by  uuid references public.profiles(id) on delete set null,
  confirmed_at  timestamptz,
  confirmed_by  uuid references public.profiles(id) on delete set null
);

alter table public.jersey_preferences enable row level security;
alter table public.jersey_preference_versions enable row level security;
alter table public.jersey_assignment_drafts enable row level security;

drop policy if exists jersey_preferences_self_manager_select
  on public.jersey_preferences;
create policy jersey_preferences_self_manager_select
on public.jersey_preferences for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
);

drop policy if exists jersey_preference_versions_self_manager_select
  on public.jersey_preference_versions;
create policy jersey_preference_versions_self_manager_select
on public.jersey_preference_versions for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.season_memberships m
    where m.id = membership_id
      and m.profile_id = public.current_profile_id()
  )
);

drop policy if exists jersey_assignment_drafts_associated_select
  on public.jersey_assignment_drafts;
create policy jersey_assignment_drafts_associated_select
on public.jersey_assignment_drafts for select to authenticated
using (public.is_current_user_associated());

-- Scritture solo tramite RPC.
revoke all on public.jersey_preferences from public, anon, authenticated;
revoke all on public.jersey_preference_versions from public, anon, authenticated;
revoke all on public.jersey_assignment_drafts from public, anon, authenticated;
grant select on public.jersey_preferences to authenticated;
grant select on public.jersey_preference_versions to authenticated;
grant select on public.jersey_assignment_drafts to authenticated;

-- Tabellone condiviso: chi ha già scelto è visibile a chi deve ancora farlo.
-- I numeri da evitare restano privati (giocatore e manager).
create or replace view public.jersey_preference_board
with (security_barrier = true)
as
select
  membership.season_id,
  membership.id as membership_id,
  profile.id as profile_id,
  profile.nome,
  profile.cognome,
  profile.avatar_url,
  membership.role,
  membership.jersey_number,
  previous.jersey_number as previous_jersey_number,
  preference.choices,
  coalesce(preference.no_preference, false) as no_preference,
  preference.updated_at,
  coalesce(preference.updated_by <> membership.profile_id, false)
    as updated_by_manager
from public.season_memberships membership
join public.profiles profile on profile.id = membership.profile_id
join public.seasons season on season.id = membership.season_id
left join public.jersey_preferences preference
  on preference.membership_id = membership.id
left join lateral (
  select previous_membership.jersey_number
  from public.season_memberships previous_membership
  join public.seasons previous_season
    on previous_season.id = previous_membership.season_id
  where previous_membership.profile_id = membership.profile_id
    and previous_season.ends_on < season.starts_on
    and previous_membership.jersey_number is not null
  order by previous_season.starts_on desc
  limit 1
) previous on true
where public.is_current_user_associated()
  and membership.category = 'PLAYER'
  and membership.status <> 'NO';

revoke all on public.jersey_preference_board from public, anon, authenticated;
grant select on public.jersey_preference_board to authenticated;

-- Un numero per stagione. Si controllano solo inserimenti e cambi di numero:
-- eventuali doppioni storici restano leggibili senza bloccare altre modifiche.
create or replace function public.guard_unique_season_jersey()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.jersey_number is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.jersey_number is not distinct from old.jersey_number
     and new.season_id is not distinct from old.season_id then
    return new;
  end if;

  if exists (
    select 1
    from public.season_memberships other
    where other.season_id = new.season_id
      and other.jersey_number = new.jersey_number
      and other.id <> new.id
  ) then
    raise exception 'Il numero % è già assegnato in questa stagione',
      new.jersey_number
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_unique_season_jersey
  on public.season_memberships;
create trigger trg_guard_unique_season_jersey
before insert or update of jersey_number, season_id
on public.season_memberships
for each row execute function public.guard_unique_season_jersey();

create or replace function public.save_jersey_preferences(
  p_season_id uuid,
  p_choices jsonb,
  p_avoid_numbers integer[],
  p_no_preference boolean default false,
  -- Solo per i manager: salva al posto di questo giocatore.
  p_membership_id uuid default null
)
returns public.jersey_preferences
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  membership_id_value uuid;
  choice jsonb;
  choice_number integer;
  choice_numbers integer[] := array[]::integer[];
  normalized_choices jsonb := '[]'::jsonb;
  normalized_avoid integer[];
  has_preferred boolean := false;
  today date := (now() at time zone 'Europe/Rome')::date;
  saved public.jersey_preferences;
begin
  if public.current_profile_id() is null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_membership_id is not null
     and not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  select membership.id
  into membership_id_value
  from public.season_memberships membership
  join public.seasons season on season.id = membership.season_id
  where membership.season_id = p_season_id
    and (
      membership.id = p_membership_id
      or (
        p_membership_id is null
        and membership.profile_id = public.current_profile_id()
      )
    )
    and membership.category = 'PLAYER'
    and membership.status <> 'NO'
    and season.ends_on >= today;

  if membership_id_value is null then
    raise exception 'Nessun posto in rosa attivo per questa stagione'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.jersey_assignment_drafts draft
    where draft.season_id = p_season_id
      and draft.confirmed_at is not null
  ) then
    raise exception 'La scelta dei numeri di questa stagione è conclusa';
  end if;

  if coalesce(p_no_preference, false) then
    p_choices := '[]'::jsonb;
  elsif p_choices is null
     or jsonb_typeof(p_choices) <> 'array'
     or jsonb_array_length(p_choices) not between 1 and 5 then
    raise exception 'Indica da 1 a 5 numeri';
  end if;

  for choice in select value from jsonb_array_elements(p_choices)
  loop
    if jsonb_typeof(choice) <> 'object'
       or jsonb_typeof(choice->'number') <> 'number'
       or (choice->>'level') not in ('PREFERRED', 'ACCEPTABLE') then
      raise exception 'Preferenza non valida';
    end if;

    choice_number := (choice->>'number')::numeric::integer;
    if (choice->>'number')::numeric <> choice_number
       or choice_number not between 1 and 99 then
      raise exception 'I numeri vanno da 1 a 99';
    end if;
    if choice_number = any(choice_numbers) then
      raise exception 'Il numero % è indicato più volte', choice_number;
    end if;

    choice_numbers := choice_numbers || choice_number;
    has_preferred := has_preferred or choice->>'level' = 'PREFERRED';
    normalized_choices := normalized_choices || jsonb_build_array(
      jsonb_build_object('number', choice_number, 'level', choice->>'level')
    );
  end loop;

  if not has_preferred and not coalesce(p_no_preference, false) then
    raise exception 'Serve almeno un numero preferito';
  end if;

  select coalesce(array_agg(distinct avoid_number order by avoid_number), '{}')
  into normalized_avoid
  from unnest(coalesce(p_avoid_numbers, '{}'::integer[])) avoid_number;

  if exists (
    select 1 from unnest(normalized_avoid) avoid_number
    where avoid_number not between 1 and 99
  ) then
    raise exception 'I numeri vanno da 1 a 99';
  end if;
  if cardinality(normalized_avoid) > 10 then
    raise exception 'Puoi escludere al massimo 10 numeri';
  end if;
  if normalized_avoid && choice_numbers then
    raise exception 'Un numero scelto non può essere anche da evitare';
  end if;

  insert into public.jersey_preferences as preference (
    membership_id,
    choices,
    no_preference,
    avoid_numbers,
    updated_by
  )
  values (
    membership_id_value,
    normalized_choices,
    coalesce(p_no_preference, false),
    normalized_avoid,
    public.current_profile_id()
  )
  on conflict (membership_id) do update
  set choices = excluded.choices,
      no_preference = excluded.no_preference,
      updated_by = excluded.updated_by,
      avoid_numbers = excluded.avoid_numbers,
      updated_at = now()
  returning * into saved;

  insert into public.jersey_preference_versions (
    membership_id,
    version_on,
    choices,
    no_preference,
    avoid_numbers,
    updated_by
  )
  values (
    membership_id_value,
    today,
    normalized_choices,
    coalesce(p_no_preference, false),
    normalized_avoid,
    public.current_profile_id()
  )
  on conflict (membership_id, version_on) do update
  set choices = excluded.choices,
      no_preference = excluded.no_preference,
      updated_by = excluded.updated_by,
      avoid_numbers = excluded.avoid_numbers,
      saved_at = now();

  return saved;
end;
$$;

-- Valida un'assegnazione [{membership_id, jersey_number}] per la stagione e
-- la restituisce normalizzata.
create or replace function public.normalize_jersey_assignments(
  p_season_id uuid,
  p_assignments jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_membership uuid;
  item_number integer;
  seen_memberships uuid[] := array[]::uuid[];
  seen_numbers integer[] := array[]::integer[];
  normalized jsonb := '[]'::jsonb;
begin
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assegnazione non valida';
  end if;

  for item in select value from jsonb_array_elements(p_assignments)
  loop
    item_membership := (item->>'membership_id')::uuid;
    item_number := case
      when item->'jersey_number' is null
        or jsonb_typeof(item->'jersey_number') = 'null' then null
      else (item->>'jersey_number')::integer
    end;

    if item_membership is null or not exists (
      select 1
      from public.season_memberships membership
      where membership.id = item_membership
        and membership.season_id = p_season_id
        and membership.category = 'PLAYER'
    ) then
      raise exception 'Giocatore non valido per questa stagione';
    end if;
    if item_membership = any(seen_memberships) then
      raise exception 'Giocatore indicato più volte';
    end if;
    if item_number is not null then
      if item_number not between 1 and 99 then
        raise exception 'I numeri vanno da 1 a 99';
      end if;
      if item_number = any(seen_numbers) then
        raise exception 'Il numero % è assegnato a più giocatori', item_number;
      end if;
      seen_numbers := seen_numbers || item_number;
    end if;

    seen_memberships := seen_memberships || item_membership;
    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'membership_id', item_membership,
      'jersey_number', item_number
    ));
  end loop;

  return normalized;
end;
$$;

create or replace function public.jersey_season_player_user_ids(
  p_season_id uuid,
  p_only_missing_preferences boolean
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct profile.user_id), array[]::uuid[])
  from public.season_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  where membership.season_id = p_season_id
    and membership.category = 'PLAYER'
    and membership.status <> 'NO'
    and profile.user_id is not null
    and (
      not p_only_missing_preferences
      or not exists (
        select 1
        from public.jersey_preferences preference
        where preference.membership_id = membership.id
      )
    );
$$;

create or replace function public.publish_jersey_draft(
  p_season_id uuid,
  p_assignments jsonb
)
returns public.jersey_assignment_drafts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved public.jersey_assignment_drafts;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  insert into public.jersey_assignment_drafts as draft (
    season_id,
    assignments,
    published_at,
    published_by,
    confirmed_at,
    confirmed_by
  )
  values (
    p_season_id,
    public.normalize_jersey_assignments(p_season_id, p_assignments),
    now(),
    public.current_profile_id(),
    null,
    null
  )
  on conflict (season_id) do update
  set assignments = excluded.assignments,
      published_at = excluded.published_at,
      published_by = excluded.published_by,
      confirmed_at = null,
      confirmed_by = null
  returning * into saved;

  perform public.create_notification(
    'JERSEY_NUMBERS',
    'Bozza numeri di maglia',
    'È pubblicato il riepilogo dei numeri proposti: controllalo prima dell''assegnazione definitiva.',
    '/maglie',
    public.jersey_season_player_user_ids(p_season_id, false),
    false,
    'jersey-draft:' || p_season_id::text || ':' || gen_random_uuid()::text,
    public.current_profile_id()
  );

  return saved;
end;
$$;

-- Conferma la bozza pubblicata così com'è: ogni modifica successiva va
-- ripubblicata, così i giocatori vedono sempre ciò che diventa definitivo.
create or replace function public.confirm_jersey_draft(p_season_id uuid)
returns public.jersey_assignment_drafts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  draft_row public.jersey_assignment_drafts;
  assignments jsonb;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  select * into draft_row
  from public.jersey_assignment_drafts
  where season_id = p_season_id
  for update;

  if draft_row.season_id is null then
    raise exception 'Pubblica prima la bozza';
  end if;

  assignments := public.normalize_jersey_assignments(
    p_season_id,
    draft_row.assignments
  );

  -- Prima si liberano i numeri che cambiano, poi si assegnano: gli scambi
  -- (A 7→10, B 10→7) non collidono col vincolo di unicità.
  update public.season_memberships membership
  set jersey_number = null
  from jsonb_to_recordset(assignments)
    as item(membership_id uuid, jersey_number integer)
  where membership.id = item.membership_id
    and membership.jersey_number is distinct from item.jersey_number
    and membership.jersey_number is not null;

  update public.season_memberships membership
  set jersey_number = item.jersey_number
  from jsonb_to_recordset(assignments)
    as item(membership_id uuid, jersey_number integer)
  where membership.id = item.membership_id
    and membership.jersey_number is distinct from item.jersey_number;

  update public.jersey_assignment_drafts
  set confirmed_at = now(),
      confirmed_by = public.current_profile_id()
  where season_id = p_season_id
  returning * into draft_row;

  perform public.create_notification(
    'JERSEY_NUMBERS',
    'Numeri di maglia assegnati',
    'I numeri di maglia della stagione sono definitivi.',
    '/maglie',
    public.jersey_season_player_user_ids(p_season_id, false),
    false,
    'jersey-confirm:' || p_season_id::text || ':' || gen_random_uuid()::text,
    public.current_profile_id()
  );

  return draft_row;
end;
$$;

create or replace function public.send_jersey_preference_reminder(
  p_season_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  targets uuid[];
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  targets := public.jersey_season_player_user_ids(p_season_id, true);
  if cardinality(targets) = 0 then
    return 0;
  end if;

  perform public.create_notification(
    'JERSEY_NUMBERS',
    'Scegli il tuo numero di maglia',
    'Indica in app i numeri che preferisci per la nuova stagione.',
    '/maglie',
    targets,
    false,
    'jersey-reminder:' || p_season_id::text || ':' || gen_random_uuid()::text,
    public.current_profile_id()
  );

  return cardinality(targets);
end;
$$;

revoke all on function public.guard_unique_season_jersey()
  from public, anon, authenticated;
revoke all on function public.normalize_jersey_assignments(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.jersey_season_player_user_ids(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.save_jersey_preferences(uuid, jsonb, integer[], boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.publish_jersey_draft(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_jersey_draft(uuid)
  from public, anon, authenticated;
revoke all on function public.send_jersey_preference_reminder(uuid)
  from public, anon, authenticated;

grant execute on function public.save_jersey_preferences(uuid, jsonb, integer[], boolean, uuid)
  to authenticated, service_role;
grant execute on function public.publish_jersey_draft(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.confirm_jersey_draft(uuid)
  to authenticated, service_role;
grant execute on function public.send_jersey_preference_reminder(uuid)
  to authenticated, service_role;

commit;
