-- Run in Supabase SQL editor to create the comunicati table.
-- Safe to re-run (uses IF NOT EXISTS).

create table if not exists public.comunicati (
  id         uuid primary key default gen_random_uuid(),
  enjore_url text not null unique,
  titolo     text not null,
  data       date,
  created_at timestamptz not null default now()
);

alter table public.comunicati enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'comunicati' and policyname = 'comunicati_select_public'
  ) then
    create policy "comunicati_select_public"
      on public.comunicati for select using (true);
  end if;
end $$;
