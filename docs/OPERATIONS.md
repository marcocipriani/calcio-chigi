# Operazioni

## Ruoli

- `is_staff`: classifica la persona come staff e la esclude dalle formazioni.
- `is_manager`: permesso applicativo assegnabile a giocatori o staff; abilita
  dashboard, check-in, statistiche operative e pubblicazione formazioni.
- Un account è operativo solo quando la richiesta di associazione è `ACTIVE`.

Il rifiuto di una richiesta elimina Auth user e richiesta; il profilo della
rosa resta disponibile per una futura associazione.

## Stagioni

Le date sono in `public.seasons`. La stagione attiva è calcolata in fuso
`Europe/Rome`; non serve un cambio manuale:

- `2025-2026`: fino al 31 luglio 2026.
- `2026-2027`: dal 1 agosto 2026 al 31 luglio 2027.

Prima di aggiungere una stagione verificare che gli intervalli non si
sovrappongano.

## Import rosa da Excel

Il workbook non deve essere versionato. Il formato atteso è il foglio `Rosa`
con intestazioni alla riga 3.

1. Preparare `.env.local` con URL remoto e service role.
2. Eseguire sempre il dry-run e salvare il report fuori dalla repository:

```bash
npm run import:roster -- \
  --file /percorso/Rosa_Squadra_2026-27.xlsx \
  --report /tmp/calcio-chigi-roster-plan.json
```

3. Se `conflicts` è maggiore di zero, correggere nomi duplicati o ambigui.
4. Applicare:

```bash
npm run import:roster -- \
  --file /percorso/Rosa_Squadra_2026-27.xlsx \
  --apply
```

5. Verificare:

```sql
select status, count(*)
from season_memberships sm
join seasons s on s.id = sm.season_id
where s.slug = '2026-2027'
group by status
order by status;

select
  count(*) filter (where is_external) as ext,
  count(*) filter (where is_aggregated) as agg,
  count(*) filter (where training_only) as solo_allenamenti
from season_memberships sm
join seasons s on s.id = sm.season_id
where s.slug = '2026-2027';
```

Eliminare il workbook locale solo dopo verifica remota riuscita.

## Account e onboarding

1. L’utente si registra.
2. Se non è associato, sceglie nome e cognome dalla rosa.
3. Il manager riceve una notifica e approva o rifiuta.
4. Fino all’approvazione l’utente vede soltanto l’area pubblica.
5. Se il profilo era `INTERESTED`, l’approvazione lo porta a `PENDING`.
6. Alla prima apertura della nuova stagione, giocatore o manager registra
   `YES`, `MAYBE` o `NO`.

I profili `INTERESTED` sono contatti senza account e non entrano in formazione
finché non vengono confermati.

Check-in e formazione leggono sempre la rosa della stagione assegnata
all’evento, anche consultando partite storiche dopo il cambio stagione.

## Pagamenti e certificati

- Il manager crea quote massive con importo e scadenza.
- Il giocatore dichiara `CASH` o `BANK_TRANSFER`; il manager verifica.
- Il promemoria quota è non bloccante e compare una volta al giorno.
- Il certificato deve essere agonistico, in PDF, con data visita, scadenza e
  laboratorio.
- Il manager approva o respinge indicando un motivo.
- `passport-photos` e `medical-certificates` sono bucket privati.

## Notifiche

La scrittura in `notifications` alimenta `notification_outbox`. Ogni minuto
`pg_cron` invoca `notification-dispatch`, che consegna Web Push e applica retry.

Controlli:

```sql
select status, count(*)
from notification_outbox
group by status
order by status;

select *
from cron.job
where jobname = 'dispatch-team-notifications';
```

Se la coda cresce:

1. verificare i due secret Vault;
2. verificare i secret Edge VAPID e dispatch;
3. invocare manualmente `private.dispatch_pending_notifications()`;
4. controllare i log della funzione `notification-dispatch`;
5. non reinviare manualmente elementi già `DELIVERED`.

Gli endpoint scaduti con risposta 404/410 vengono rimossi automaticamente.

## Backup e ripristino

Prima di migrazioni o import:

```bash
npx supabase db dump --linked --data-only -f /tmp/calcio-chigi-data.sql
```

Conservare il dump fuori dalla repository. Per un incidente limitare prima le
scritture, raccogliere log e identificativi, quindi scegliere un ripristino
puntuale; non eseguire reset sul database remoto.
