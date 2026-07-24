-- Restringe il bucket storage `avatars` (advisor 0025_public_bucket_allows_listing).
-- NON ancora applicata al DB live: applicare via SQL editor Supabase.
--
-- Contesto: il bucket è public. Il display avatar avviene via URL pubblico
-- (/storage/v1/object/public/avatars/...) che NON passa da RLS. L'upload avviene con
-- INSERT (nuovo) + UPDATE (upsert overwrite). Nessun path dell'app fa listing.
-- Quindi le due policy SELECT (che abilitano il listing/enumerazione) non servono e
-- vengono rimosse. Restano INSERT e UPDATE per l'upload.

-- Chiude l'enumerazione anonima esterna (rischio principale):
drop policy if exists "Public Avatar 1oj01fe_0" on storage.objects;

-- Chiude anche il listing per utenti autenticati:
drop policy if exists "Upload Avatar Authenticated 1oj01fe_2" on storage.objects;

-- Rollback (se dopo l'apply l'upload avatar si rompe, ricreare la SELECT authenticated):
-- create policy "Upload Avatar Authenticated 1oj01fe_2" on storage.objects
--   for select to authenticated using (bucket_id = 'avatars');
