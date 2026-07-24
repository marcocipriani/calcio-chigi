-- Restringe il bucket storage `avatars` (advisor 0025_public_bucket_allows_listing).
-- Applicato al DB live 2026-07-24.
--
-- Rimuove SOLO la SELECT per il ruolo anon: chiude l'enumerazione anonima esterna
-- (il rischio reale). Il display avatar usa URL pubblici (/storage/v1/object/public/...)
-- che NON passano da RLS, quindi non serve alcuna SELECT policy per mostrarli.
drop policy if exists "Public Avatar 1oj01fe_0" on storage.objects;

-- NB: la SELECT per `authenticated` ("Upload Avatar Authenticated 1oj01fe_2") va TENUTA.
-- Supabase Storage la richiede per l'upsert (overwrite): per sovrascrivere un file
-- esistente legge l'oggetto coi permessi dell'utente. Rimuoverla rompe il re-upload
-- avatar con "new row violates row-level security policy".
--
-- Trade-off residuo: un utente autenticato (membro del team) può listare gli avatar.
-- Rischio basso. Per chiudere anche questo senza rompere l'upsert, si potrebbe scopare
-- la SELECT al proprietario:
--   using (bucket_id = 'avatars' and owner = auth.uid())
-- ma questo rompe il re-upload cross-manager (avatar caricato da un altro manager).
