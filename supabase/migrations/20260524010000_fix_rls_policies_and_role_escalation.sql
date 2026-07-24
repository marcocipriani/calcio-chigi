-- Fix RLS policies: remove privilege escalation vectors, deduplicate policies.
-- Applied 2026-05-24.

-- Drop dangerous broad UPDATE on profiles (any authenticated user could set is_manager=true)
drop policy if exists "Authenticated can update profiles" on public.profiles;

-- Drop buggy manager UPDATE (compares profiles.id to auth.uid() which is user_id — never matches)
drop policy if exists "Managers can update everything" on public.profiles;

-- Drop duplicate manager UPDATE (kept: "Managers can update any profile")
drop policy if exists "Manager modifica tutto" on public.profiles;

-- Drop duplicate SELECT on profiles
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

-- Drop broad INSERT on events (any authenticated user could create events)
drop policy if exists "Authenticated can create events" on public.events;

-- Drop duplicate SELECT/ALL policies on events
drop policy if exists "Events are viewable by everyone" on public.events;
drop policy if exists "Public Read" on public.events;
drop policy if exists "Public read events" on public.events;
drop policy if exists "Solo Manager modifica eventi" on public.events;

-- Drop duplicate SELECT on standings and teams
drop policy if exists "Standings viewable by everyone" on public.standings;
drop policy if exists "Teams viewable by everyone" on public.teams;

-- Trigger: prevent non-managers from flipping is_manager / is_staff.
-- RLS cannot restrict by column, so this is the correct enforcement point.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Service role (sync scripts, admin) bypasses this check
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

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();
