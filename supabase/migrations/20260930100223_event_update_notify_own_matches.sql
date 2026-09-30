-- "Evento aggiornato" partiva anche per le partite delle altre squadre del girone
-- (la sync Enjore ne ritocca data e campo): ora solo eventi nostri.
drop trigger if exists trg_notify_event_update on public.events;
create trigger trg_notify_event_update
after update on public.events
for each row
when (
  new.tipo is distinct from 'PARTITA'
  or new.squadra_casa ilike '%chigi%'
  or new.squadra_ospite ilike '%chigi%'
  or (new.squadra_casa is null and new.squadra_ospite is null)
)
execute function public.notify_event_update();
