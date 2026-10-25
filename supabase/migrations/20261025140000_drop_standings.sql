-- Classifica legacy: on_match_change ricalcolava public.standings a ogni
-- modifica di un evento, sommando le partite di tutte le stagioni e fasi.
-- L'app non la legge: la classifica si calcola in calculateStandings
-- (src/lib/utils.ts) per stagione e fase, con i criteri del regolamento.
-- I dati sono derivati dagli eventi: niente da migrare.

drop trigger if exists on_match_change on public.events;
drop function if exists public.calculate_standings();
drop table if exists public.standings;
