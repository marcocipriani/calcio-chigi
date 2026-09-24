begin;

-- "Solo allenamenti" diventa un terzo stato esclusivo, non un flag
-- combinabile con qualunque status. Va aggiunto in una migration a parte:
-- un valore enum appena creato non è utilizzabile nella stessa transazione
-- in cui viene aggiunto.
alter type public.membership_status add value if not exists 'TRAINING_ONLY';

commit;
