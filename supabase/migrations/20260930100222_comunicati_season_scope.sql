-- Comunicati per stagione: quelli delle stagioni passate restano nel torneo storico
-- invece di mescolarsi a quelli dell'edizione in corso.
alter table public.comunicati
  add column season_id uuid references public.seasons(id);

update public.comunicati c
set season_id = s.id
from public.seasons s
where c.data between s.starts_on and s.ends_on;

alter table public.comunicati alter column season_id set not null;
