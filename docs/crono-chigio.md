# CronoChigio

Il test è disponibile ai membri attivi della squadra in Statistiche, sotto Chigio d’Oro, e nella pagina `/crono-chigio`.

Su mobile e desktop Statistiche mostra soltanto partecipanti, medie del gruppo, data e meteo, con «Vedi test completo» per aprire la pagina dedicata. Non mostra vincitori, immagini né risultati individuali nel riepilogo.

La pagina dedicata mostra Profilo G2 come prima colonna, avatar e nome completo dell’atleta, gruppi separati per Giro 1, Giro 2 con tratti e confronto. Il miglior tempo personale fra i due giri è in grassetto; entrambi lo sono in caso di parità. L’ordinamento è crescente o decrescente per tutte le colonne numeriche e per nome/partenza; il filtro distingue Razzo e Treno. Classifiche e profili sono calcolati sull’intero gruppo prima di filtrare o ordinare.

«Esporta CSV» scarica le righe visibili nell’ordine corrente, con nomi completi, tempi, posizioni, velocità medie, differenze e nota sul riscaldamento. Il file UTF-8 include BOM, separatori punto e virgola e decimali italiani. Le celle testuali vengono quotate e protette dalle formule dei fogli di calcolo; i valori numerici negativi restano numeri. I download PNG sono rimossi dall’app.

I profili confrontano il rapporto tra velocità media iniziale e lanciata con il riferimento del gruppo. Non sono misure dirette di accelerazione o velocità massima. Il riepilogo non indica un vincitore; nella tabella si evidenzia soltanto il miglior totale personale fra i due giri.

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
