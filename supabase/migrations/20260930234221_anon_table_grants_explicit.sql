-- Le migrazioni assumevano auto_expose_new_tables=false (grant espliciti, vedi
-- 20260725011500_api_grants), ma i default privileges di postgres danno ALL ad anon su
-- ogni tabella nuova: l'unica barriera era RLS. Anon torna a leggere solo le tabelle
-- pubbliche; le proiezioni sicure restano viste e RPC con grant espliciti.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $$;

grant select on public.events, public.comunicati, public.standings, public.teams, public.seasons
  to anon;
revoke all on all sequences in schema public from anon;

-- Tabelle e sequenze future: niente ad anon finché una migrazione non lo concede.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
