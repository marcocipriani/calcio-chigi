-- Allow events.data_ora to be NULL to support forfeit matches (partite a tavolino)
-- that have no scheduled date but still count for standings.
alter table public.events alter column data_ora drop not null;
