# Chigio d'Oro — votazione interna del migliore in campo

## Intento

Dopo ogni partita la squadra vota chi ha giocato meglio. È un premio interno, goliardico, separato dall'MVP ufficiale che arriva dal torneo (Enjore, già in Statistiche e profilo come "MVP"). Nome: **Chigio d'Oro**. Il voto principale si chiama **Er Mejo** (in UI sempre l'emoji 🔝), quelli secondari **Applausi** (👏).

Successo: dopo la partita i giocatori aprono l'app, votano in pochi tap, e a votazione chiusa c'è un podio da commentare in chat; a fine stagione una classifica.

## Regole

### Su quali eventi
- Solo `events.tipo in ('PARTITA','AMICHEVOLE')`, non cancellati. Allenamenti esclusi.
- Due classifiche separate: **Torneo** (`PARTITA`) e **Amichevoli** (`AMICHEVOLE`).

### Finestra
- **Fine partita** = `data_fine_ora` se presente, altrimenti `data_ora + 2h` (le partite sincronizzate da Enjore hanno `data_fine_ora` nullo). *Scelta di Claude.*
- **Apertura automatica** (deciso: opzione A): la votazione si apre al primo momento, dopo la fine partita, in cui esiste almeno un votabile (formazione pubblicata + almeno un convocato con check-in PRESENT). Il cron continua a controllare; se il check-in arriva tardi, la votazione si apre allora.
- **Ritardo massimo:** se entro `fine partita + 48h` non c'è alcun votabile, la votazione per quella partita non si apre mai (niente notifiche).
- **Snapshot all'apertura:** votanti e votabili sono congelati al momento dell'apertura. Check-in o presenze modificati dopo non cambiano liste né voti. *Scelta di Claude.*
- **Chiusura** al primo di:
  1. `apertura + 24h` (dall'apertura reale, non dalla fine partita);
  2. tutti i votanti dello snapshot hanno votato;
  3. il manager chiude manualmente (slide "Scorri per chiudere la votazione", viola = azione manager).
- Il risultato della partita non influisce in nessun modo.
- **Solo partite nuove:** la funzione vale per partite la cui fine è successiva al rilascio; le partite passate vengono ignorate (nessuna votazione, nessuna notifica). *Scelta di Claude.*
- **Eventi modificati:** se data/ora cambia prima dell'apertura, la finestra segue la nuova data (calcolata al volo). Dopo l'apertura la votazione resta com'è. Eventi annullati (`cancellato`) o eliminati: la votazione non si apre; se già aperta/chiusa, l'evento è escluso da Statistiche e profilo. *Scelta di Claude.*

### Chi vota (votanti)
- Profili con `attendance.status in ('PRESENTE','INFORTUNATO_PRESENTE')` ("Ci sono" o "Spettatore") per quell'evento.
- Serve un account collegato (utente autenticato il cui profilo è quello).
- Lo snapshot dei votanti è preso all'apertura: è il denominatore di "X/Y hanno votato" e della chiusura per "tutti hanno votato". *Scelta di Claude.*

### Chi si può votare (votabili)
- Convocati = `official_formation_players` della formazione pubblicata dell'evento, **e** con `event_checkins.status = 'PRESENT'`.
- Non si può votare sé stessi. *Scelta di Claude.*

### Il voto
- **1 🔝 obbligatorio**, **da 0 a 2 👏 facoltativi**, tutte persone diverse. I 👏 hanno lo stesso peso fra loro, nessun ordine.
- Modificabile fino alla chiusura (un solo voto per votante, sovrascritto).
- **Anonimo per tutti, manager compresi**: nessuna UI né API espone chi ha votato chi. Visibile solo il conteggio "X/Y hanno votato" (pubblico agli utenti associati). Il votante vede il proprio voto per poterlo modificare.

### Vincitore
- Più 🔝 vince. Parità → più 👏. Ancora parità → ex aequo (più vincitori, tutti contano un 🏆).
- Chi ha 0 🔝 non può vincere. *Scelta di Claude* (con almeno un voto il primo ha sempre ≥1 🔝).

## UI

Mockup di riferimento: `.superpowers/brainstorm/9015-1792694940/content/` (`votazione.html`, `risultati-layout-v3.html`, `statistiche.html`). Colori dell'app (neutri + blu `primary`), niente viola tranne l'azione manager (vedi `DESIGN.md`). Avatar = foto profilo, fallback iniziali, nessun badge maglia.

### Pagina partita (`/evento/[id]`) — card "🏆 Chigio d'Oro"
- **Prima dell'apertura:** card assente. *Scelta di Claude.*
- **Votazione aperta, utente votante:**
  - riga in evidenza con chiusura massima: "Chiude gio 23/10 alle 23:30 · tra 19 h";
  - "Scegli 1 🔝 e fino a 2 👏 · X/Y hanno votato";
  - griglia avatar dei votabili (escluso sé stesso). Tap ciclico: nessuno → 🔝 → 👏 → nessuno. Un nuovo 🔝 sposta il precedente a nessuno; un terzo 👏 non è accettato;
  - riepilogo "🔝 Rossi · 👏 Bianchi, Neri" e bottone blu "Invia voto" (disabilitato senza 🔝);
  - nota: "Il voto è anonimo: nessuno, nemmeno i manager, vede chi hai votato. Puoi cambiarlo fino alla chiusura."
- **Votazione aperta, utente non votante:** scadenza + contatore, nessuna griglia.
- **Manager:** in più lo slide di chiusura anticipata.
- **Votazione chiusa:** podio a 3 colonne (2–1–3) con avatar, il 1° più grande, blocchi oro/argento/bronzo tenui con dentro posizione, 🔝 n, 👏 n. Sotto, la classifica completa (podio compreso) con 🔝 n e 👏 n; riga 🔝 nascosta se 0; chi ha 0 🔝 e 0 👏 non compare. Meta: "Votazione chiusa · X/Y votanti". Ex aequo: stessa posizione mostrata.

### Statistiche (`/statistiche`) — card "🏆 Chigio d'Oro · <stagione>"
- Segue il selettore stagione esistente. Toggle Torneo / Amichevoli.
- Colonne: 🏆 (vittorie), 🔝 totali, 👏 totali. Ordine 🏆 → 🔝 → 👏. Prime 5 righe + "Mostra tutti" come le altre classifiche (`RANKING_PREVIEW`).
- Solo votazioni chiuse.

### Profilo giocatore (`/giocatore/[id]`)
- Sezione piccola: 🏆 · 🔝 · 👏 della stagione, Torneo e Amichevoli separati. Separata dalla riga "MVP" del torneo.

## Notifiche

Via `create_notification` + push esistenti, `idempotency_key` per evento:
- **Votazione aperta** → ai votanti. Es. "🏆 Chigio d'Oro aperto — vota er mejo di <avversario> entro <ora>". Deep link alla pagina partita.
- **Votazione chiusa** → ai votanti. Es. "🏆 Chigio d'Oro a <nome>!" (ex aequo: nomi uniti). Deep link alla pagina partita.

- **Promemoria check-in ai manager** (richiesto): prima della fine partita (*scelta di Claude: 15 minuti prima*), se il check-in non è ancora fatto. Es. "Fai il check-in di <avversario>: serve per aprire il Chigio d'Oro". Deep link alla pagina partita (pannello Referto).
- Nessuna votazione dopo 48h → nessuna notifica. Votazione chiusa senza voti → nessun vincitore, notifica di chiusura non inviata. *Scelta di Claude.*

Nessun promemoria ai votanti.

## Vincoli

- Next.js di questa repo ha breaking change: leggere `node_modules/next/dist/docs/` prima di scrivere codice (vedi `AGENTS.md`).
- Supabase: RLS su tutto; anon senza grant di default (nuove tabelle/viste vanno grant-ate esplicitamente, le viste bypassano RLS → revocare scritture). Migrazioni applicate via MCP con file locale rinominato alla versione applicata.
- Anonimato = livello app. Chi ha accesso SQL/service role (admin) può tecnicamente leggere i voti: accettato, perché il votante deve poter vedere e modificare il proprio voto. *Scelta di Claude.*
- Risultati visibili solo agli utenti associati (come `/statistiche`), non ad anon. *Scelta di Claude.*
- L'anonimato deve reggere anche lato DB: un manager con client autenticato non deve poter leggere le righe dei voti altrui (le policy "manager_all" usate altrove qui NON vanno replicate). Risultati aggregati esposti solo a votazione chiusa.
- Validazione voto lato DB (RPC security definer): finestra aperta, votante avente diritto, votabili validi, niente auto-voto, 1 🔝 + ≤2 👏 distinti.
- Apertura/chiusura a tempo con il `pg_cron` già presente (pattern in `notification_dispatch_schedule` e `person_trash`). La chiusura per "tutti hanno votato" avviene al momento del voto.
- Release: bump `package.json` (feature → minor), test completi + build prima del push.

## Non obiettivi

- Nessun promemoria, nessun commento sul voto, nessun voto per allenamenti.
- Nessuna integrazione con l'MVP Enjore.
- Nessuna riapertura di una votazione chiusa. *Scelta di Claude.*

## Lasciato al builder

Schema delle tabelle, nomi di RPC/viste, se calcolare i risultati al volo o materializzarli alla chiusura, componenti React, copy esatti delle notifiche, granularità del cron.
