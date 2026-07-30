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
