-- Nelle policy auth.uid() e gli helper di ruolo vengono rivalutati per ogni riga.
-- Dentro (select ...) Postgres li calcola una volta per query (initPlan):
-- stessa semantica, scansioni più leggere (lint Supabase "auth_rls_initplan").
-- Riscrive le policy di public partendo dal testo deparsato; idempotente,
-- perché le chiamate già precedute da SELECT non si toccano.

do $$
declare
  pol record;
  fn text;
  new_qual text;
  new_check text;
  clauses text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    foreach fn in array array[
      'auth\.uid\(\)',
      'auth\.role\(\)',
      'auth\.jwt\(\)',
      '(?:public\.)?is_current_user_manager\(\)',
      '(?:public\.)?is_current_user_associated\(\)',
      '(?:public\.)?current_profile_id\(\)'
    ]
    loop
      -- Non preceduta da "." o da un identificatore (es. "public." già incluso
      -- nel match) né da "SELECT " (già avvolta).
      new_qual := regexp_replace(new_qual, '(?<![.\w])(?<!SELECT )(' || fn || ')', '(select \1)', 'gi');
      new_check := regexp_replace(new_check, '(?<![.\w])(?<!SELECT )(' || fn || ')', '(select \1)', 'gi');
    end loop;

    clauses := '';
    if new_qual is distinct from pol.qual then
      clauses := clauses || format(' using (%s)', new_qual);
    end if;
    if new_check is distinct from pol.with_check then
      clauses := clauses || format(' with check (%s)', new_check);
    end if;

    if clauses <> '' then
      execute format(
        'alter policy %I on %I.%I%s',
        pol.policyname,
        pol.schemaname,
        pol.tablename,
        clauses
      );
    end if;
  end loop;
end;
$$;
