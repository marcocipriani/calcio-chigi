-- Fix una tantum: riapre il Chigio d'Oro della partita contro Madama del 22/10/2026,
-- chiuso per errore da un manager. Mantiene la scadenza originale (opened_at + 24h)
-- e le schede già inviate; cancella podio e notifica del vincitore, così alla
-- prossima chiusura vengono ricalcolati e la notifica riparte (stessa idempotency key).
-- Da lanciare nello SQL editor di Supabase, tutto in un'unica transazione.

begin;

do $$
declare
  target_event uuid;
  poll public.chigio_polls;
  removed_results int;
  removed_notifications int;
begin
  select e.id into strict target_event
  from public.events e
  where e.avversario ilike '%madama%'
    and (e.data_ora at time zone 'Europe/Rome')::date = date '2026-10-22';

  select * into strict poll from public.chigio_polls where event_id = target_event for update;

  if poll.closed_at is null then
    raise exception 'Il sondaggio % è già aperto', target_event;
  end if;
  -- chigio_tick (ogni 5 min) lo richiuderebbe subito con TIMEOUT.
  if poll.closes_at <= now() then
    raise exception 'Scadenza originale (%) già passata: serve un nuovo closes_at', poll.closes_at;
  end if;

  delete from public.chigio_results where event_id = target_event;
  get diagnostics removed_results = row_count;

  -- recipients e outbox vanno via in cascata.
  delete from public.notifications where idempotency_key = 'chigio-closed:' || target_event::text;
  get diagnostics removed_notifications = row_count;

  update public.chigio_polls
  set closed_at = null, closed_reason = null
  where event_id = target_event;

  raise notice 'Riaperto % (era chiuso con %): % risultati e % notifiche rimossi, chiude alle %',
    target_event, poll.closed_reason, removed_results, removed_notifications,
    poll.closes_at at time zone 'Europe/Rome';
end;
$$;

commit;
