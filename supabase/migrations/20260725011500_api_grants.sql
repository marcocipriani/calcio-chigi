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
