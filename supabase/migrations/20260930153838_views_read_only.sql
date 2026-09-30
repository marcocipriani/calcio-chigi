-- I default privileges di Supabase danno ALL su ogni nuova vista ad anon e
-- authenticated. Le viste semplici sono aggiornabili e scrivono con i permessi
-- del proprietario, quindi scavalcano RLS: un anonimo poteva modificare o
-- cancellare righe di official_formations e profiles passando da
-- public_published_formation_summaries e claimable_profile_directory.
-- Le viste restano di sola lettura; i permessi di select non cambiano.
do $$
declare
  view_name text;
begin
  for view_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated',
      view_name
    );
  end loop;
end;
$$;
