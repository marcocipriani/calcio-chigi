# CronoChigio

Il test è disponibile ai membri attivi della squadra in Statistiche, sotto Chigio d’Oro, e nella pagina `/crono-chigio`.

Su mobile Statistiche mostra un riepilogo e il pulsante «Vedi completo». Da desktop i dettagli sono aperti. La pagina dedicata mostra la tabella completa, l’ordinamento crescente o decrescente per tutte le colonne numeriche e per nome/partenza, il filtro Razzo/Treno e i download PNG. Classifiche e profili sono calcolati sull’intero gruppo prima di filtrare o ordinare.

I profili confrontano il rapporto tra velocità media iniziale e lanciata con il riferimento del gruppo. Non sono misure dirette di accelerazione o velocità massima. Le medaglie si basano sul miglior totale personale fra i due giri, con un solo risultato per atleta.

## Dati riservati

I risultati reali risiedono in `public.crono_chigio_tests`, protetta da RLS. La migrazione crea solo lo schema, senza nomi o tempi. L’API verifica sessione e associazione attiva prima di leggere il risultato; né gli anonimi né gli utenti archiviati accedono ai dati. Le risposte dell’API non vengono memorizzate in cache.

Il JSON di origine, il documento dei risultati e le immagini esportate sono esclusi da Git. Non caricarli nel repository pubblico. I test usano una fixture interamente fittizia in `src/test/fixtures/crono-chigio.json`.

## Importazione del test

Dopo aver applicato la migrazione alla destinazione corretta, configurare nell’ambiente locale `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, poi eseguire:

```sh
node scripts/import-crono-chigio.mjs /percorso/privato/risultati.json
```

L’importazione valida 14 risultati con tempi in centesimi interi positivi, ordine di partenza e nota sul riscaldamento. Aggiorna solo il test del 12 novembre 2026. Non scrive credenziali o risultati nei log. La service role key serve soltanto all’importazione locale: l’app pubblicata legge con la sessione dell’utente e le policy RLS, senza service role key.

Per verificare il validatore:

```sh
node --test scripts/import-crono-chigio.test.mjs
```
