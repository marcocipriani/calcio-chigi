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

## Import storico Enjore 2025/26

L’import usa esclusivamente le classifiche aggregate Enjore per goal, MVP,
ammonizioni ed espulsioni. Non crea eventi sintetici, assist o presenze.
`FASE_2_CALCIATORI` è una fase valida anche quando non contiene righe Chigi.

### Preflight e dry-run

Prima di qualsiasi scrittura:

```bash
npx supabase migration list --linked
npx supabase db dump --linked --data-only \
  -f /tmp/calcio-chigi-pre-enjore-2025-2026.sql
npx supabase db push --dry-run
npm run import:enjore-history -- --dry-run
```

Il dry-run scarica 15 risposte, riconcilia le quattro fasi con le classifiche
all-phases, risolve i profili remoti e non invoca la RPC di import.

Evidenza del 29 luglio 2026:

```text
Dry-run: 27 righe storiche validate; nessuna scrittura database.
FASE_1: G=26 MVP=19 A=5 ESP=0
FASE_2_CALCIATORI: G=0 MVP=0 A=0 ESP=0
FASE_2_PROFESSIONISTI: G=12 MVP=10 A=3 ESP=0
COPPA_LAZIO_PROFESSIONISTI: G=11 MVP=6 A=0 ESP=0
```

In questo task non sono stati eseguiti `db push`, import `--apply` o deploy
Web. I comandi operativi da eseguire dopo review sono:

```bash
npx supabase db push
npm run import:enjore-history -- --dry-run
npm run import:enjore-history -- --apply
vercel --prod
```

Non proseguire se il secondo dry-run differisce dal preflight approvato.

### Verifica post-import

Eseguire sul database collegato:

```sql
select
  phase_key,
  count(*) as players,
  sum(goals) as goals,
  sum(mvp) as mvp,
  sum(yellow_cards) as yellow_cards,
  sum(red_cards) as red_cards
from public.historical_player_stats h
join public.seasons s on s.id = h.season_id
where s.slug = '2025-2026'
group by phase_key
order by phase_key;

select
  h.profile_id,
  p.cognome,
  p.nome,
  sum(h.goals) as goals,
  sum(h.mvp) as mvp,
  sum(h.yellow_cards) as yellow_cards,
  sum(h.red_cards) as red_cards
from public.historical_player_stats h
join public.seasons s on s.id = h.season_id
join public.profiles p on p.id = h.profile_id
where s.slug = '2025-2026'
group by h.profile_id, p.cognome, p.nome
order by p.cognome, p.nome;
```

Confrontare il secondo risultato con la sezione all-phases del dry-run. Dopo
il deploy verificare `/statistiche`: 2026/27 a zero, 2025/26 con assist `—` e
presenze `Dati non disponibili`.

### Errore e recupero

- Errori di rete, parsing, mapping o riconciliazione avvengono prima della RPC:
  non c’è nulla da ripristinare.
- La RPC sostituisce l’intero dataset 2025/26 in una transazione; un errore DB
  esegue rollback completo. Verificare le query sopra prima di rilanciare.
- Un import completato ma errato si corregge sul mapping/script e si rilancia:
  `npm run import:enjore-history -- --dry-run`, revisione dell’output, poi
  `npm run import:enjore-history -- --apply`. Il secondo apply sostituisce
  atomicamente il dataset precedente.
- Per un incidente più ampio, bloccare le scritture e usare il dump
  `/tmp/calcio-chigi-pre-enjore-2025-2026.sql` o il ripristino puntuale
  Supabase. Non eseguire `db reset` sul progetto collegato e non tentare un
  down manuale della migration: applicare una migration correttiva.

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

## Controlli di sicurezza Supabase

Eseguire periodicamente:

```bash
npx supabase db advisors --linked --type security
```

Le RPC esposte sono concesse esplicitamente ai soli ruoli necessari; le
funzioni trigger interne non devono essere eseguibili da `anon` o
`authenticated`.

Le viste `public_profile_directory`, `public_active_roster`,
`public_player_statistics`, `authenticated_active_roster` e
`claimable_profile_directory` usano intenzionalmente il proprietario della
vista insieme a `security_barrier`: espongono solo colonne sicure mentre le
tabelle di base restano protette da RLS. L’advisor può quindi segnalarle come
`security_definer_view`; non convertirle in `security_invoker` senza
riprogettare l’accesso pubblico e rieseguire i test RLS.

## Backup e ripristino

Prima di migrazioni o import:

```bash
npx supabase db dump --linked --data-only -f /tmp/calcio-chigi-data.sql
```

Conservare il dump fuori dalla repository. Per un incidente limitare prima le
scritture, raccogliere log e identificativi, quindi scegliere un ripristino
puntuale; non eseguire reset sul database remoto.
