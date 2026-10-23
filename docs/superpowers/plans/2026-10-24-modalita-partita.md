# Modalità partita Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un manager in panchina registra la partita dal vivo: timer,
recupero, goal, assist, cartellini e cambi. Chi è a casa segue in diretta e,
al fischio finale, risultato e statistiche vengono salvati.

**Architecture:**
- **Dati.** Due tabelle Supabase (`match_sessions`, `match_timeline`),
  modificabili solo tramite RPC `security definer` riservate al segnapunti e
  leggibili da tutti tramite viste con i cognomi.
- **Logica.** La logica di campo (timer, risultato, chi è in campo, minuti) è
  pura e testata in `src/lib/match.ts`.
- **Interfaccia.** La UI è una route a tutto schermo, `/evento/[id]/partita`,
  più un blocco live nella pagina evento e un banner in home.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Supabase
(Postgres 17, RLS, Realtime), Tailwind 4 + shadcn/ui, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-24-modalita-partita-design.md`

## Global Constraints

- **Accesso:** solo `is_manager` scrive. Le azioni da manager sono viola
  (`bg-operative`), mai `violet-*` o `purple-*`.
- **Target touch:** ≥ 44px, testo ≥ 10px.
- **Regolamento** (`PARTITA`):
  - tempi da 35' e intervallo da 15';
  - un time-out da 60" per tempo;
  - cambi: 3 nel primo tempo, illimitati nell'intervallo, 7 nel secondo;
  - U35 in campo al massimo 3 (`U35_FIELD_MAX`), portiere escluso.
- **Amichevoli** (`AMICHEVOLE`): niente limiti di cambi né quota U35; durata
  modificabile.
- **Annullamento:** a ritroso, un evento per volta.
- **Dati da non toccare:**
  - `events.data_fine_ora`, che fa partire la push `EVENT_UPDATED`;
  - `match_player_stats` accetta solo giocatori con check-in `PRESENT`.
- **Date:** fuso Europe/Rome per "giorno della partita" (`romeDateKey`).
- **Copy** in italiano.
- **Commit:** `Area: descrizione` con `Co-Authored-By`.

## Review Focus

- **Il segnapunti perde il controllo con eventi in coda:** quelli avvenuti
  prima del passaggio passano, quelli dopo vengono rifiutati e mostrati.
  (Task 1: test pgTAP.)
- **Timer dopo il blocco schermo o un'app riaperta:** il minuto si ricalcola
  da `period_started_at`, non da un contatore locale. (Task 2: test su
  `periodClock`.)
- **Annulla di un goal:** `score_*` torna indietro sul server.
  (Task 1: test pgTAP.)
- **Espulso:** non può rientrare né ricevere azioni, e il suo posto resta
  vuoto. (Task 2: test su `fieldState`.)
- **Partita finita prima dell'orario previsto o sforata:** il Chigio non si apre
  finché la sessione non è `FINISHED`. (Task 1: test pgTAP.)

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/20261024100000_match_mode.sql`
- Test: `tests/db/match-mode.test.sql`

**Interfaces (Produces):**

**Tabella `match_sessions`:**
- `event_id` uuid pk → events, on delete cascade;
- `status` text, uno di `FIRST_HALF`, `HALFTIME`, `SECOND_HALF`, `FINISHED`;
- `period_minutes` int, 10–60, default 35;
- `period_started_at` timestamptz;
- `added_minutes` int, 0–15;
- `timeout_used` bool;
- `lineup` jsonb: `{module, starters:[{profile_id, position_key}], bench:[profile_id]}`;
- `score_ours`, `score_theirs` int;
- `operator_profile_id` uuid;
- `operator_since` timestamptz;
- `finished_at` timestamptz;
- `created_at` timestamptz.

**Tabella `match_timeline`:**
- `id` uuid pk, generato dal client;
- `event_id` uuid;
- `kind` text, uno di `PERIOD_START`, `PERIOD_END`, `GOAL`, `OWN_GOAL_FOR`,
  `UNATTRIBUTED_GOAL`, `GOAL_AGAINST`, `YELLOW`, `RED`, `SUB`;
- `period` smallint, 1 o 2;
- `minute` smallint;
- `stoppage` smallint, default 0;
- `occurred_at` timestamptz;
- `profile_id`, `assist_profile_id`, `sub_in_profile_id` uuid → profiles, on
  delete set null;
- `created_by` uuid;
- `voided_at` timestamptz;
- `created_at` timestamptz.

**Viste** (`security_barrier`, select ad anon e authenticated):
- `public_match_sessions`: `match_sessions` più `operator_nome`,
  `operator_cognome`;
- `public_match_timeline`: `match_timeline` dove `voided_at is null`, più
  `player_cognome`, `assist_cognome`, `sub_in_cognome`.

**Altre modifiche:**
- `match_player_stats.minutes_played` int, nullable, `>= 0`.

**RPC** (`security definer`, `set search_path = public`, execute solo ad
authenticated; tutte fanno `raise 42501` se non manager):

| RPC | Restituisce | Cosa fa |
|-----|-------------|---------|
| `match_start(p_event_id uuid, p_period_minutes int, p_lineup jsonb)` | `match_sessions` | Errore se la sessione esiste o l'evento non è `PARTITA`/`AMICHEVOLE` non annullato. Crea la sessione `FIRST_HALF` con operatore = chi chiama e una riga `PERIOD_START` periodo 1. |
| `match_take_control(p_event_id uuid)` | `match_sessions` | Imposta l'operatore e `operator_since = now()`. |
| `match_advance_period(p_event_id uuid)` | `match_sessions` | `FIRST_HALF` → `HALFTIME` (riga `PERIOD_END` periodo 1); `HALFTIME` → `SECOND_HALF` (`PERIOD_START` periodo 2). Azzera `added_minutes` e `timeout_used`, imposta `period_started_at = now()`. |
| `match_update_clock(p_event_id uuid, p_added_minutes int, p_timeout_used bool, p_start_shift_seconds int)` | `match_sessions` | I parametri null non cambiano nulla; lo shift sposta `period_started_at`. |
| `match_record(p_id uuid, p_event_id uuid, p_kind text, p_period smallint, p_minute smallint, p_stoppage smallint, p_occurred_at timestamptz, p_profile_id uuid, p_assist_profile_id uuid, p_sub_in_profile_id uuid)` | `match_timeline` | Idempotente su `p_id`. Accetta se chi chiama è l'operatore oppure `p_occurred_at <= operator_since`, altrimenti `raise 'MATCH_CONTROL_LOST'`. Ricalcola `score_*`. Per i goal crea la notifica `MATCH_GOAL` (non critica) per la rosa della stagione. |
| `match_void(p_event_id uuid, p_timeline_id uuid)` | `match_timeline` | Solo l'operatore. Imposta `voided_at` e ricalcola `score_*`. |
| `match_finish(p_event_id uuid, p_summary jsonb)` | `match_sessions` | Vedi sotto. |

**`p_summary` di `match_finish`:**
```
{
  gol_nostri, gol_avversario, opponent_own_goals, unattributed_goals,
  players: [{profile_id, goals, assists, yellow_cards, red_cards, minutes_played}]
}
```

**Cosa fa `match_finish`:**
- solo l'operatore, con status `SECOND_HALF`;
- `set_event_checkin(...,'PRESENT')` per ogni giocatore;
- sostituisce le righe di `match_player_stats` dell'evento;
- upsert su `match_unattributed_stats`;
- aggiorna `events`: `gol_nostri`, `gol_avversario`, `gol_casa`/`gol_ospite`
  (casa = chigi se `squadra_casa ilike '%chigi%'` o null) e `giocata`;
- riga `PERIOD_END` periodo 2, status `FINISHED`, `finished_at`.

**Inoltre:**
- `private.chigio_tick`: ridefinita identica più
  `and not exists (select 1 from public.match_sessions s where s.event_id = e.id and s.status <> 'FINISHED')`;
- `alter publication supabase_realtime add table public.match_sessions, public.match_timeline`.

- [ ] **Step 1: Test pgTAP** `tests/db/match-mode.test.sql`. Casi da coprire:
  - un non manager non avvia;
  - il manager avvia e risulta operatore;
  - `match_record` è idempotente (stesso id = una riga);
  - un goal porta `score_ours = 1`, il void lo riporta a 0;
  - `GOAL_AGAINST` porta `score_theirs`;
  - dopo `match_take_control` di un secondo manager, il primo è rifiutato con
    un `occurred_at` successivo e accettato con uno precedente;
  - `match_finish` scrive `events.gol_nostri`, `match_player_stats.minutes_played`
    e `event_checkins` `PRESENT`;
  - `chigio_tick` non crea il poll mentre la sessione è `SECOND_HALF`.
- [ ] **Step 2: Migrazione.** Verifica sintattica su PGlite, dove possibile;
  pgTAP in CI.
- [ ] **Step 3: Commit.**

### Task 2: Logica pura `src/lib/match.ts`

**Interfaces (Produces):**

**Tipi:**
- `MatchStatus`;
- `MatchSession` (camelCase delle colonne + `operatorName: string | null`);
- `TimelineEntry` (camelCase + `playerName`, `assistName`, `subInName`);
- `MatchLineup = { module: string; starters: { profileId: string; positionKey: string }[]; bench: string[] }`.

**Funzioni:**
- `periodClock(session, now: Date): { period: 1 | 2 | null; seconds: number; minute: number; stoppage: number; display: string; halftimeRemaining: number | null }`.
  `display` è `MM:SS` del tempo totale (il secondo tempo parte da 35:00).
- `minuteLabel(minute: number, stoppage: number): string`, es. `"35+2'"`,
  `"52'"`.
- `scoreOf(timeline): { ours: number; theirs: number }`: conta
  `GOAL`, `OWN_GOAL_FOR`, `UNATTRIBUTED_GOAL` e `GOAL_AGAINST` non annullati.
- `fieldState(lineup, timeline)`:
  ```
  { onField: Record<positionKey, string | null>; bench: string[];
    expelled: Set<string>; subbedIn: Map<string, string>;
    subbedOut: Map<string, string>; yellows: Map<string, number>;
    goals: Map<string, number> }
  ```
  dove `subbedIn`/`subbedOut` contengono la label del minuto.
- `substitutionsInPeriod(timeline, status): number`: nell'intervallo conta solo
  i cambi fatti durante l'intervallo, cioè dopo il `PERIOD_END` del periodo 1.
- `substitutionLimit(tipo, status): number | null`: 3, null o 7 per
  `PARTITA`; sempre null per `AMICHEVOLE`.
- `buildSummary(lineup, timeline, finishedAt: Date)`: restituisce
  `MatchSummary` (stessa forma di `p_summary`, camelCase); `minutesPlayed`
  segue la regola dello spec.
- `canOpenMatchMode(event, now, session): boolean`: vero se è il giorno della
  partita a Roma oppure c'è una sessione non `FINISHED`; falso se l'evento è
  annullato o non è una partita.

- [ ] **Step 1: Test** `src/lib/match.test.ts`:
  - `periodClock` a 52'14" del secondo tempo dà `display "52:14"` e
    `minute 52`;
  - a 37' del primo tempo con durata 35 dà `minute 35`, `stoppage 2`, label
    `"35+2'"`;
  - in `fieldState` l'espulso esce e il suo slot resta `null`; chi esce va in
    panchina e può rientrare;
  - `scoreOf` ignora gli annullati;
  - `buildSummary`: titolare sostituito al 20' ha 20 minuti; chi entra al 20'
    del secondo tempo (minuto 55) e finisce al 70'+2 ha 17 minuti;
  - `canOpenMatchMode` è falso il giorno dopo senza sessione.
- [ ] **Step 2: Implementazione.**
- [ ] **Step 3: Commit.**

### Task 3: API, coda e hook live

**Files:**
- Create: `src/lib/match-api.ts`, `src/lib/match-queue.ts`
  (+ `match-queue.test.ts`), `src/components/match/useLiveMatch.ts`

**Interfaces:**
- `fetchMatch(client, eventId): Promise<{ session: MatchSession | null; timeline: TimelineEntry[] }>`
  dalle viste `public_*`.
- Wrapper RPC tipizzati: `startMatch`, `takeControl`, `advancePeriod`,
  `updateClock`, `voidEntry`, `finishMatch`.
- Coda:
  - `enqueue(eventId, action)`, dove `action` sono i parametri di
    `match_record`;
  - `flushQueue(client, eventId): Promise<{ sent: number; rejected: QueuedAction[] }>`;
  - `pendingCount(eventId)`.

  `localStorage` con chiave `match-queue:<eventId>` dentro try/catch. Un errore
  `MATCH_CONTROL_LOST` rimuove l'azione e la restituisce in `rejected`; un
  errore di rete la lascia in coda.
- `useLiveMatch(eventId): { session; timeline; reload }`: fetch iniziale, un
  canale realtime su entrambe le tabelle con filtro `event_id`, e
  `useOnResume`.

- [ ] Test della coda: `enqueue` più un flush con client finto (successo,
  `MATCH_CONTROL_LOST`, errore di rete). Poi implementazione e commit.

### Task 4: Diretta nella pagina evento e banner in home

**Files:**
- Create: `src/components/match/LiveMatchBlock.tsx` (+ test),
  `src/components/match/LiveMatchBanner.tsx`
- Modify: `src/app/evento/[id]/page.tsx`, `src/app/page.tsx`

**Comportamento:**
- **`LiveMatchBlock`**, con una sessione non `FINISHED`:
  - `● LIVE · <n>° tempo · <minuteLabel>` (oppure
    `Intervallo · riprende tra MM:SS`);
  - `CHIGI x – y AVV`;
  - "Segue la partita: <nome>";
  - cronaca dei goal e dei cartellini, dal più recente.

  Con sessione `FINISHED` resta solo la cronaca. Il minuto si ridisegna ogni
  secondo.
- **Pagina evento:**
  - il blocco sostituisce `scoreBlock` mentre si gioca;
  - pulsante viola `Modalità partita` (o `Prendi il controllo` se l'operatore
    è un altro) in `EventBar`, quando `canOpenMatchMode`;
  - link a `/evento/<id>/partita`.
- **Banner in home:** legge `public_match_sessions` con status `<> FINISHED`
  e mostra un link per ogni partita live.

- [ ] Test: il blocco mostra `● LIVE`, il punteggio e una riga di cronaca da
  dati finti; il pulsante non compare ai non manager. Poi commit.

### Task 5: Schermata modalità partita

**Files:**
- Create: `src/app/evento/[id]/partita/page.tsx`,
  `src/components/match/MatchMode.tsx`, `MatchSetup.tsx`, `MatchClock.tsx`,
  `MatchPitch.tsx`, `MatchBench.tsx`, `PlayerActionDialog.tsx`,
  `MatchSummaryDialog.tsx` (+ `MatchMode.test.tsx`)
- Modify: `src/components/BottomNav.tsx` (nessuna nav su `/partita`)

**Comportamento:**
- **Dati di partenza.** La formazione ufficiale (posizioni) e la rosa
  (`fetchRosterForEvent`, per U35 e ruolo) entrano nel setup.
- **Riuso.** Coordinate da `FORMATIONS` e quota da `u35Quota`.
- **Senza controllo**, cioè con un operatore diverso, la schermata mostra la
  diretta e il pulsante "Prendi il controllo", con la conferma del nome.
- **Wake Lock** con riacquisizione su `visibilitychange`.
- **Vibrazione:** `navigator.vibrate?.(30)` dopo ogni registrazione.

- [ ] Test:
  - il tocco su un avatar apre le azioni;
  - Goal poi "Nessun assist" chiama `enqueue` con `kind GOAL`;
  - il secondo giallo chiede il rosso;
  - il cambio oltre il limite avvisa ma registra.

  Poi commit.

### Task 6: Diffidati, squalificati, push sui goal, cronaca WhatsApp

**Files:**
- Create: `src/lib/discipline.ts` (+ test)
- Modify: `MatchBench`/`MatchPitch` (badge), `NotificationBell.tsx`
  (interruttore `MATCH_GOAL` su `notification_preferences`),
  `MatchSummaryDialog` (copia cronaca)

**Interfaces:**
- `disciplineByPlayer(rows: { profileId: string; eventDate: string; yellow: number; red: number }[], beforeDate: string): Map<string, 'DIFFIDATO' | 'SQUALIFICATO'>`;
  le righe vengono da `match_player_stats` delle `PARTITA` della stagione.
- `buildMatchReport(eventLabel, timeline, score): string`.

- [ ] Test:
  - due gialli → `DIFFIDATO`;
  - rosso nell'ultima partita → `SQUALIFICATO`;
  - terzo giallo nell'ultima partita → `SQUALIFICATO`;
  - il rosso di due partite fa non conta più.

  Poi commit.

### Task 7: Verifica, versione, pubblicazione

- [ ] **Verifica:** typecheck, lint, tutti i test, `next build`, prova
  manuale nel browser della schermata su un evento locale (se Supabase locale
  è disponibile) oppure su dati finti.
- [ ] **Versione:** `package.json` 2.8.0, README (badge e data), ROADMAP
  (sezione 1 con il link allo spec).
- [ ] **Pubblicazione:** commit, push, CI verde, `supabase db push`, deploy
  delle Edge Function della review precedente.
