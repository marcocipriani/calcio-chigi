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
test -s supabase/.temp/project-ref
linked_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
env_ref="$(
  node --input-type=module -e '
    import { loadDotEnv } from "./scripts/import-enjore-history.mjs"
    const env = {}
    loadDotEnv(".env.local", env)
    const value = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
    if (!value) throw new Error("URL Supabase assente in .env.local")
    const match = new URL(value).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)
    if (!match) throw new Error("Hostname Supabase remoto non valido")
    process.stdout.write(match[1])
  '
)"
test "$linked_ref" = "$env_ref"
npx supabase migration list --linked
backup_path="/tmp/calcio-chigi-pre-enjore-2025-2026.sql"
npx supabase db dump --linked --data-only -f "$backup_path"
test -s "$backup_path"
shasum -a 256 "$backup_path" > "${backup_path}.sha256"
npx supabase db push --linked --dry-run
npm run import:enjore-history -- --dry-run
```

Il confronto tra `supabase/.temp/project-ref` e il project ref ricavato
dall’hostname in `.env.local` deve riuscire prima di migration, dump o import.
I comandi non stampano URL, chiavi o altri secret. Il dry-run scarica 15
risposte, stampa le righe per giocatore/fase e i totali per fase, risolve i
profili remoti e non invoca la RPC di import. La riconciliazione con le
classifiche all-phases è un controllo interno dello script: non viene stampata
come sezione separata.

Evidenza del 29 luglio 2026:

```text
Dry-run: 27 righe storiche validate; nessuna scrittura database.
FASE_1: G=26 MVP=19 A=5 ESP=0
FASE_2_CALCIATORI: G=0 MVP=0 A=0 ESP=0
FASE_2_PROFESSIONISTI: G=12 MVP=10 A=3 ESP=0
COPPA_LAZIO_PROFESSIONISTI: G=11 MVP=6 A=0 ESP=0
```

Esecuzione live del 29 luglio 2026:

```text
project ref: fandfnvxrceqsjonvjtw
backup: /tmp/calcio-chigi-pre-enjore-2025-2026.sql (409306 byte)
SHA-256: a9418ff9d2b77c77b9b8d1e9e66e10371b66690c5d0e5153657a38d8a28cf3f3
migrazione applicata: 20260729010000_season_stats_player_access.sql
import applicato: 27 righe
```

Il secondo dry-run ha riprodotto esattamente i totali del preflight prima
dell’import atomico.

### Verifica post-import

Eseguire sul database collegato:

```sql
with expected_phases(phase_key, sort_order) as (
  values
    ('FASE_1'::text, 1),
    ('FASE_2_CALCIATORI'::text, 2),
    ('FASE_2_PROFESSIONISTI'::text, 3),
    ('COPPA_LAZIO_PROFESSIONISTI'::text, 4)
),
phase_totals as (
  select
    h.phase_key,
    count(*) as players,
    sum(h.goals) as goals,
    sum(h.mvp) as mvp,
    sum(h.yellow_cards) as yellow_cards,
    sum(h.red_cards) as red_cards
  from public.historical_player_stats h
  join public.seasons s on s.id = h.season_id
  where s.slug = '2025-2026'
  group by h.phase_key
)
select
  e.phase_key,
  coalesce(t.players, 0) as players,
  coalesce(t.goals, 0) as goals,
  coalesce(t.mvp, 0) as mvp,
  coalesce(t.yellow_cards, 0) as yellow_cards,
  coalesce(t.red_cards, 0) as red_cards
from expected_phases e
left join phase_totals t using (phase_key)
order by e.sort_order;

select
  h.phase_key,
  h.profile_id,
  p.cognome,
  p.nome,
  h.goals,
  h.mvp,
  h.yellow_cards,
  h.red_cards
from public.historical_player_stats h
join public.seasons s on s.id = h.season_id
join public.profiles p on p.id = h.profile_id
where s.slug = '2025-2026'
order by
  case h.phase_key
    when 'FASE_1' then 1
    when 'FASE_2_CALCIATORI' then 2
    when 'FASE_2_PROFESSIONISTI' then 3
    when 'COPPA_LAZIO_PROFESSIONISTI' then 4
  end,
  p.cognome,
  p.nome;
```

Confrontare il primo risultato con i quattro totali per fase del dry-run,
inclusa la riga a zero di `FASE_2_CALCIATORI`. Confrontare ogni riga
giocatore/fase del secondo risultato con la corrispondente riga stampata dal
dry-run. La riconciliazione all-phases resta validata internamente dallo
script. Dopo il deploy verificare `/statistiche`: 2026/27 a zero, 2025/26 con
assist `—` e presenze `Dati non disponibili`.

Verifica live del 29 luglio 2026:

```text
27 righe totali
FASE_1: 10 righe, G=26, MVP=19, A=5, ESP=0
FASE_2_CALCIATORI: 0 righe, G=0, MVP=0, A=0, ESP=0
FASE_2_PROFESSIONISTI: 10 righe, G=12, MVP=10, A=3, ESP=0
COPPA_LAZIO_PROFESSIONISTI: 7 righe, G=11, MVP=6, A=0, ESP=0
```

### Errore e recupero

- Errori di rete, parsing, mapping o riconciliazione avvengono prima della RPC:
  non c’è nulla da ripristinare.
- La RPC sostituisce l’intero dataset 2025/26 in una transazione; un errore DB
  esegue rollback completo. Verificare le query sopra prima di rilanciare.
- Un import completato ma errato si corregge sul mapping/script e si rilancia:
  `npm run import:enjore-history -- --dry-run`, revisione dell’output, poi
  `npm run import:enjore-history -- --apply`. Il secondo apply sostituisce
  atomicamente il dataset precedente.
- Il dump è diagnostico finché un ripristino non viene provato in un ambiente
  isolato e verificato applicativamente; checksum e file non dimostrano da
  soli la recuperabilità.
- Per un incidente di produzione più ampio, bloccare le scritture, annotare il
  timestamp e avviare il Point-in-Time Recovery Supabase secondo il piano del
  progetto. Non dichiarare il recupero riuscito prima dei controlli
  applicativi. Non eseguire `db reset` sul progetto collegato e non tentare un
  down manuale della migration: applicare una migration correttiva.

## Account e onboarding

1. L’utente si registra.
2. Se non è associato, sceglie nome e cognome dalla rosa.
3. Il manager riceve una notifica e approva o rifiuta.
4. Fino all’approvazione l’utente vede soltanto l’area pubblica.
5. L’approvazione non tocca lo stato in rosa.

La rosa è binaria: `YES` (in rosa) o `NO` (archiviato). L’archiviazione è
manuale dalla dashboard: la persona resta in gestione nell’elenco archiviati
con tutto lo storico, ma non compare nelle pagine pubbliche, non entra in
formazione, non riceve check-in e non può usare l’area di squadra.

Check-in e formazione leggono sempre la rosa della stagione assegnata
all’evento, anche consultando partite storiche dopo il cambio stagione.

## Check-in e presenze

La pagina evento ha una lista sola: ogni riga mostra la disponibilità
dichiarata dal giocatore e, per il manager, lo switch di check-in ufficiale.
Sono due dati distinti — la disponibilità è una previsione, il check-in è la
presenza reale — ma restano sulla stessa riga.

- Check-in singolo: switch sulla riga. ON scrive `PRESENT`, OFF `ABSENT`.
  `PRESENT` allinea anche la disponibilità a `PRESENTE`.
- Check-in di gruppo: si selezionano le righe con le checkbox (scorciatoie
  «Seleziona disponibili» e «Tutti»), poi lo switch in testata applica lo
  stesso stato a tutta la selezione.
- Lo staff compare in lista senza check-in. I `training_only` sono esclusi
  dal check-in nelle partite, non negli allenamenti.
- Le statistiche partita (goal, assist, cartellini, MVP) si aprono sotto la
  riga di chi ha check-in `PRESENT`.

La percentuale presenze della dashboard conta **solo i check-in ufficiali**:

- numeratore: check-in `PRESENT`;
- denominatore: tutti gli allenamenti non annullati della stagione successivi
  a `joined_on`, **esclusi** quelli in cui il giocatore aveva dichiarato KO
  (`INFORTUNATO_PRESENTE`);
- le partite non entrano nel conteggio.

Un allenamento senza check-in del manager conta quindi come assenza: se la
percentuale sembra bassa, controllare prima che i check-in siano stati fatti.

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
backup_path="/tmp/calcio-chigi-data.sql"
npx supabase db dump --linked --data-only -f "$backup_path"
test -s "$backup_path"
shasum -a 256 "$backup_path" > "${backup_path}.sha256"
```

Conservare dump e checksum fuori dalla repository. Il dump è diagnostico a
meno che il restore sia stato provato in un ambiente isolato. In produzione,
per un incidente limitare prima le scritture, raccogliere log, identificativi e
timestamp, quindi usare il Point-in-Time Recovery Supabase previsto dal piano;
non eseguire reset sul database remoto.
