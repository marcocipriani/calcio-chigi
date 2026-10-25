-- A partita chiusa il "Finale" della diretta mostra il risultato dell'evento,
-- da chiunque arrivi: correzione del riepilogo, risultato inserito dalla
-- pagina torneo, risultato omologato dal sync Enjore (es. 0-3 a tavolino).
-- Stessa regola di match_apply_summary: Chigi in casa se è squadra_casa.

create or replace function private.match_session_follow_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chigi_home boolean := coalesce(new.squadra_casa ilike '%chigi%', false);
begin
  update public.match_sessions
  set score_ours = case when chigi_home then new.gol_casa else new.gol_ospite end,
      score_theirs = case when chigi_home then new.gol_ospite else new.gol_casa end
  where event_id = new.id
    and status = 'FINISHED';
  return null;
end;
$$;

revoke all on function private.match_session_follow_result() from public, anon, authenticated;

drop trigger if exists trg_match_session_follows_result on public.events;
create trigger trg_match_session_follows_result
after update of gol_casa, gol_ospite on public.events
for each row
when (
  new.gol_casa is not null and new.gol_ospite is not null
  and (new.gol_casa is distinct from old.gol_casa or new.gol_ospite is distinct from old.gol_ospite)
)
execute function private.match_session_follow_result();
