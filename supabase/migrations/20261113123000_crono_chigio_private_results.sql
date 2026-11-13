-- I risultati reali si importano separatamente: il repository è pubblico.
create table public.crono_chigio_tests (
  tested_on date primary key,
  results jsonb not null check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) = 14)
);

alter table public.crono_chigio_tests enable row level security;
revoke all on public.crono_chigio_tests from public, anon, authenticated;
grant select on public.crono_chigio_tests to authenticated;
grant all on public.crono_chigio_tests to service_role;

create policy crono_chigio_team_select on public.crono_chigio_tests
for select to authenticated using (
  (select public.is_current_user_associated())
  and coalesce(((select public.get_app_context()) #>> '{membership,status}'), '') <> 'NO'
);
