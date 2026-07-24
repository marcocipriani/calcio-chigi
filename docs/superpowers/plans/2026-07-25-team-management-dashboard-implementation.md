# Team Management Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare l’intera gestione stagionale 2026–2027, dalla sicurezza dei dati alla dashboard manager, mantenendo pubbliche le sole informazioni sportive approvate.

**Architecture:** PostgreSQL/Supabase resta la fonte unica e applica autorizzazioni via RLS, RPC e funzioni server; il client Next.js usa feature module piccoli con un unico contesto sessione. Le pagine pubbliche interrogano viste sicure, mentre dashboard, onboarding, notifiche e file privati richiedono profilo approvato o permesso manager.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase PostgreSQL/Auth/Storage/Realtime/Edge Functions, Tailwind CSS 4, shadcn/Radix, Vitest, Testing Library, Playwright, axe-core.

## Global Constraints

- Stagioni iniziali `2025-2026` e `2026-2027`; cambio automatico il `2026-08-01`.
- `is_manager` è un permesso; `PLAYER` e `STAFF` sono categorie stagionali.
- Senza login sono pubblici Calendario, Squadra semplificata, Torneo, goal, assist e Player of the match.
- Presenze, profili completi, formazioni e notifiche richiedono login e associazione approvata.
- Tessera ASI, ruolo e numero maglia sono modificabili solo dai manager.
- Fototessera e certificati sono privati; avatar pubblico e sempre modificabile.
- Dashboard desktop densa con righe circa `44px`; mobile usa card e azioni singole.
- Motion solo CSS `opacity`/`transform`, `120–200ms`, disattivata da `prefers-reduced-motion`.
- Nessuna libreria motion, nessuna virtualizzazione, nessuna sincronizzazione Excel continua.
- Il file `Rosa_Squadra_2026-27.xlsx` non deve essere committato e va eliminato dopo import e verifica.
- Baseline 2026-07-25: `npm run lint`, `npx tsc --noEmit` e `npm run build` passano.

---

## File map

### Database e funzioni

- `supabase/migrations/20260725_team_management.sql`: enum, stagioni, membership, pagamenti, certificati, check-in, statistiche e formazioni.
- `supabase/migrations/20260725_accounts_notifications_storage.sql`: onboarding, notifiche, outbox, bucket privati, RLS, RPC e trigger.
- `supabase/schema.sql`: snapshot completo coerente con tutte le migration.
- `supabase/functions/account-association/index.ts`: approvazione/rifiuto account con Auth Admin.
- `supabase/functions/notification-dispatch/index.ts`: consegna Web Push idempotente e cleanup subscription.
- `scripts/import-roster.mjs`: dry-run/apply transazionale della cartella Excel presente solo durante l’import.

### Dominio e dati client

- `src/lib/domain.ts`: enum e tipi stagionali condivisi.
- `src/lib/season.ts`: stagione attiva, fasce età, mapping stati e regole formazione.
- `src/lib/management-api.ts`: query/mutation manager e controllo ottimistico.
- `src/lib/notifications-api.ts`: centro notifiche, subscription e preferenze.
- `src/lib/formations.ts`: snapshot formazione, validazione e messaggio WhatsApp.
- `src/lib/types.ts`, `src/lib/api.ts`: tipi legacy adattati a viste sicure e nuove API.

### Sessione e shell

- `src/components/auth/AppSessionProvider.tsx`: sessione, profilo approvato, permessi e stato onboarding.
- `src/components/auth/AccountAssociationPrompt.tsx`: doppia conferma associazione profilo.
- `src/components/season/SeasonConfirmationPrompt.tsx`: conferma 2026–2027 giornaliera e non bloccante.
- `src/components/notifications/NotificationBell.tsx`: campanella, badge, lista e read state.
- `src/components/notifications/PushOptIn.tsx`: consenso esplicito e istruzioni iOS PWA.
- `src/components/SiteHeader.tsx`, `src/components/BottomNav.tsx`, `src/app/layout.tsx`: shell aggiornata.

### Feature manager

- `src/app/gestione/page.tsx`: guardia manager e composizione dashboard.
- `src/components/management/ManagementDashboard.tsx`: preset, filtri, selezione e layout.
- `src/components/management/ManagementTable.tsx`: tabella densa, sticky e accessibile.
- `src/components/management/ManagementToolbar.tsx`: azioni rapide e bulk.
- `src/components/management/PersonDrawer.tsx`: modifica persona e archivio.
- `src/components/management/KpiStrip.tsx`: KPI operativi.
- `src/components/management/ManagerPresence.tsx`: Presence e stato attività.
- `src/components/management/PaymentDialog.tsx`, `CertificatePanel.tsx`, `CheckinPanel.tsx`, `NotificationComposer.tsx`: workflow operativi.

### Feature sportive

- `src/app/page.tsx`, `src/components/calendar/DesktopCalendar.tsx`: calendario desktop split e mobile invariato.
- `src/app/squadra/page.tsx`, `src/components/team/PublicRoster.tsx`, `AuthenticatedTeam.tsx`, `StaffRoster.tsx`: visibilità e rosa stagionale.
- `src/app/statistiche/page.tsx`, `src/components/stats/AttendanceRing.tsx`: statistiche pubbliche/autenticate.
- `src/app/evento/[id]/page.tsx`, `src/components/formations/OfficialFormationPanel.tsx`: check-in, statistiche partita e formazione ufficiale.
- `src/app/profilo/page.tsx`: dati propri, privacy, foto e statistiche personali.

### Test e documentazione

- `vitest.config.ts`, `src/test/setup.ts`: test unitari/component.
- `playwright.config.ts`, `tests/e2e/*.spec.ts`: browser desktop/mobile, accessibilità e visual.
- `tests/db/team-management.test.sql`: smoke SQL/RLS eseguibile contro DB di test.
- `docs/README.md`, `docs/DEPLOY.md`, `docs/OPERATIONS.md`: unica documentazione operativa mantenuta.
- Eliminare documenti di audit, roadmap, analisi, spec e piani al termine dell’esecuzione.

---

### Task 1: Harness di test e contratti dominio

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/domain.ts`
- Create: `src/lib/season.ts`
- Create: `src/lib/season.test.ts`

**Interfaces:**
- Produces: `MembershipStatus`, `MembershipCategory`, `activeSeasonAt(date)`, `ageBand(dob, at)`, `canJoinMatchFormation(membership)`.

- [ ] **Step 1: scrivere i test fallenti**

```ts
expect(activeSeasonAt(new Date("2026-07-31T21:59:59Z")).slug).toBe("2025-2026")
expect(activeSeasonAt(new Date("2026-08-01T00:00:00+02:00")).slug).toBe("2026-2027")
expect(canJoinMatchFormation({ category: "PLAYER", status: "YES", training_only: false })).toBe(true)
expect(canJoinMatchFormation({ category: "PLAYER", status: "YES", training_only: true })).toBe(false)
```

- [ ] **Step 2: installare ed eseguire il test**

Run: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test @axe-core/playwright`

Run: `npm run test -- src/lib/season.test.ts`

Expected: FAIL perché i moduli non esistono.

- [ ] **Step 3: implementare i contratti**

```ts
export type MembershipStatus = "INTERESTED" | "PENDING" | "YES" | "MAYBE" | "NO"
export type MembershipCategory = "PLAYER" | "STAFF"
export const SEASONS = [
  { slug: "2025-2026", startsOn: "2025-08-01", endsOn: "2026-07-31" },
  { slug: "2026-2027", startsOn: "2026-08-01", endsOn: "2027-07-31" },
] as const
export function canJoinMatchFormation(m: Pick<SeasonMembership, "category" | "status" | "training_only">) {
  return m.category === "PLAYER" && (m.status === "YES" || m.status === "MAYBE") && !m.training_only
}
```

- [ ] **Step 4: verificare**

Run: `npm run test -- src/lib/season.test.ts && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test src/lib/domain.ts src/lib/season.ts src/lib/season.test.ts
git commit -m "test: add team management domain harness"
```

### Task 2: Schema stagionale e sicurezza di base

**Files:**
- Create: `supabase/migrations/20260725_team_management.sql`
- Modify: `supabase/schema.sql`
- Create: `tests/db/team-management.test.sql`

**Interfaces:**
- Produces: viste `public_profiles`, `active_season_memberships`, funzione `is_current_user_manager()`, RPC `update_membership_if_current(...)`.

- [ ] **Step 1: scrivere lo smoke SQL fallente**

```sql
begin;
select lives_ok($$select public.is_current_user_manager()$$);
select has_table('public', 'seasons');
select has_table('public', 'season_memberships');
select has_view('public', 'public_profiles');
select results_eq(
  $$select count(*) from information_schema.columns where table_name='public_profiles'
    and column_name in ('email','phone','tax_code')$$,
  array[0::bigint]
);
rollback;
```

- [ ] **Step 2: eseguire contro database locale se disponibile**

Run: `npm run db:test`

Expected: FAIL su tabelle e viste mancanti; se Docker/CLI manca, registrare il gate e validare sintassi con parser SQL nel Task 18.

- [ ] **Step 3: aggiungere schema completo**

La migration crea `seasons`, `profile_private_details`, `season_memberships`, `medical_certificates`, `payments`, `event_checkins`, `match_player_stats`, `official_formations`, `official_formation_players`; aggiunge `season_id` a `events`, indici su foreign key/stati/scadenze e una vista pubblica senza dati privati.

```sql
create or replace function public.is_current_user_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where user_id = auth.uid() and is_manager) $$;

create view public.public_profiles with (security_invoker = true) as
select id, nome, cognome, avatar_url, data_nascita
from public.profiles;

alter table public.profiles enable row level security;
drop policy if exists "Profili visibili a tutti" on public.profiles;
create policy profiles_self_or_manager_select on public.profiles for select
using (user_id = auth.uid() or public.is_current_user_manager());
```

- [ ] **Step 4: aggiungere RLS per ogni ruolo**

Anonimo legge solo viste pubbliche e calendario; profilo associato legge le presenze; proprietario legge i dati privati propri; manager gestisce tutte le tabelle. Trigger impediscono a non-manager di cambiare ASI, ruolo, maglia, membership, tesseramento e dati economici.

- [ ] **Step 5: aggiornare snapshot e verificare**

Run: `npm run db:verify && npm run lint`

Expected: parser SQL PASS e nessuna policy pubblica su dati sensibili.

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/20260725_team_management.sql supabase/schema.sql tests/db
git commit -m "feat: add seasonal team management schema"
```

### Task 3: Import roster una tantum e rimozione Excel

**Files:**
- Create: `scripts/import-roster.mjs`
- Create: `scripts/import-roster.test.mjs`
- Modify: `package.json`
- Delete: `Rosa_Squadra_2026-27.xlsx`

**Interfaces:**
- Produces: `normalizeName`, `mapExcelStatus`, `buildImportPlan`; CLI `npm run import:roster -- --file <path> [--apply]`.

- [ ] **Step 1: testare mapping**

```js
assert.equal(mapExcelStatus("OK", { excelOnly: true }), "YES")
assert.equal(mapExcelStatus("IN FORSE", { excelOnly: true }), "MAYBE")
assert.deepEqual(mapExcelStatus("SOLO ALLENAMENTI", { excelOnly: true }), {
  status: "INTERESTED", trainingOnly: true
})
assert.equal(mapExcelStatus("", { excelOnly: false }), "PENDING")
```

- [ ] **Step 2: eseguire test fallente**

Run: `npm run test:import`

Expected: FAIL perché l’importer non esiste.

- [ ] **Step 3: implementare dry-run e apply**

L’importer carica `.env.local`, legge workbook con ExcelJS, abbina per nome normalizzato, non sovrascrive dati globali DB valorizzati, emette report JSON e in `--apply` usa RPC transazionale `import_roster_plan(jsonb)`.

- [ ] **Step 4: eseguire dry-run e validare conteggi**

Run: `npm run import:roster -- --file Rosa_Squadra_2026-27.xlsx --report /tmp/calcio-chigi-roster-report.json`

Expected: `33` match senza ambiguità, `26` creazioni, nessun conflitto bloccante.

- [ ] **Step 5: applicare solo dopo che la migration è live**

Run: `npm run import:roster -- --file Rosa_Squadra_2026-27.xlsx --apply`

Expected: transazione completata e conteggi post-import coerenti.

- [ ] **Step 6: eliminare workbook e verificare Git**

Run: `rm -- Rosa_Squadra_2026-27.xlsx && test ! -e Rosa_Squadra_2026-27.xlsx && ! git ls-files --error-unmatch Rosa_Squadra_2026-27.xlsx`

Expected: file assente e mai tracciato.

- [ ] **Step 7: commit**

```bash
git add package.json package-lock.json scripts/import-roster.mjs scripts/import-roster.test.mjs
git commit -m "feat: add one-time roster import"
```

### Task 4: Sessione applicativa e protezione delle viste

**Files:**
- Create: `src/components/auth/AppSessionProvider.tsx`
- Create: `src/components/auth/ProtectedFeature.tsx`
- Create: `src/components/auth/AppSessionProvider.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `useAppSession(): { user, profile, isManager, associationStatus, loading }`; `ProtectedFeature`.

- [ ] **Step 1: testare anonimo, pendente e manager**

```tsx
render(<ProtectedFeature fallback={<span>Accedi</span>}><span>Privato</span></ProtectedFeature>)
expect(screen.getByText("Accedi")).toBeVisible()
```

- [ ] **Step 2: implementare provider singolo**

Il provider ascolta `onAuthStateChange`, risolve profilo tramite RPC `get_app_context`, non espone dati privati nelle query anonime e non duplica fetch in header/navbar/pagine.

- [ ] **Step 3: sostituire query pubbliche**

`fetchAllPlayers` diventa `fetchPublicRoster` sulla vista sicura; le query complete richiedono contesto associato o manager.

- [ ] **Step 4: verificare**

Run: `npm run test -- src/components/auth/AppSessionProvider.test.tsx && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/components/auth src/app/layout.tsx src/lib/api.ts src/lib/types.ts
git commit -m "feat: centralize session and protected access"
```

### Task 5: Onboarding e associazione account

**Files:**
- Create: `src/components/auth/AccountAssociationPrompt.tsx`
- Create: `src/components/auth/AccountAssociationPrompt.test.tsx`
- Create: `supabase/functions/account-association/index.ts`
- Modify: `src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `useAppSession`.
- Produces: RPC `request_profile_association(profile_id)` e Edge Function `approve|reject`.

- [ ] **Step 1: testare doppia conferma**

Selezionare una persona non crea subito la richiesta; il secondo dialog mostra nome completo e solo `Conferma associazione` invoca la RPC.

- [ ] **Step 2: implementare prompt**

Mostra solo profili non collegati; non offre “non sono in elenco”; account non collegato resta sulle funzioni pubbliche.

- [ ] **Step 3: implementare funzione server**

Approva collegando `auth.users.id` a `profiles.user_id`; rifiuta cancellando richiesta e utente Auth, poi conserva `sha256(lower(email))` e timestamp per 30 giorni.

- [ ] **Step 4: verificare sicurezza**

Run: `npm run test -- AccountAssociationPrompt && npm run functions:check`

Expected: doppia conferma PASS; chiamata non-manager restituisce 403.

- [ ] **Step 5: commit**

```bash
git add src/components/auth/AccountAssociationPrompt* src/app/auth/callback/route.ts supabase/functions/account-association
git commit -m "feat: add moderated account association"
```

### Task 6: Conferma stagione

**Files:**
- Create: `src/components/season/SeasonConfirmationPrompt.tsx`
- Create: `src/components/season/SeasonConfirmationPrompt.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: RPC `respond_to_season_confirmation(status)`; local rule `shouldPrompt(lastAskedAt, now)`.

- [ ] **Step 1: testare frequenza e opzioni**

Il prompt compare per membership `PENDING`; `Decido più avanti` non cambia stato e non riappare prima del giorno successivo Europe/Rome.

- [ ] **Step 2: implementare prompt non bloccante**

Dialog dismissibile con opzioni `Sì`, `Forse`, `Decido più avanti`, `No`; salvataggio mostra pending/success/error.

- [ ] **Step 3: verificare**

Run: `npm run test -- SeasonConfirmationPrompt`

Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add src/components/season src/app/layout.tsx
git commit -m "feat: add daily season confirmation"
```

### Task 7: Centro notifiche e Web Push

**Files:**
- Create: `src/lib/notifications-api.ts`
- Create: `src/components/notifications/NotificationBell.tsx`
- Create: `src/components/notifications/PushOptIn.tsx`
- Create: `src/components/notifications/NotificationBell.test.tsx`
- Create: `supabase/functions/notification-dispatch/index.ts`
- Modify: `public/sw.js`
- Modify: `src/components/SiteHeader.tsx`

**Interfaces:**
- Produces: `listNotifications`, `markNotificationRead`, `subscribeDevice`, `dispatchOutbox`.

- [ ] **Step 1: testare campanella**

Badge accessibile espone conteggio, apertura elenca notifiche, click marca letta e naviga al deep-link.

- [ ] **Step 2: implementare API e UI**

Notifica in-app è canonica; errore push non annulla salvataggio; le categorie critiche non hanno toggle in-app.

- [ ] **Step 3: implementare service worker push**

Gestire `push`, `notificationclick`, deep-link e `navigator.setAppBadge`; su iOS mostra istruzioni Home Screen prima del consenso.

- [ ] **Step 4: implementare dispatcher**

Lock outbox con chiave idempotente, max tentativi, errore persistito e cancellazione endpoint `404/410`.

- [ ] **Step 5: verificare**

Run: `npm run test -- NotificationBell && npm run functions:check && npm run build`

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/lib/notifications-api.ts src/components/notifications public/sw.js src/components/SiteHeader.tsx supabase/functions/notification-dispatch
git commit -m "feat: add reliable in-app and push notifications"
```

### Task 8: Shell, navigazione e header

**Files:**
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/components/SiteHeader.test.tsx`

**Interfaces:**
- Consumes: `useAppSession`, `NotificationBell`.

- [ ] **Step 1: testare visibilità**

Navbar contiene `Calendario`, `Squadra`, `Torneo`, `Statistiche`; `Gestione` compare solo manager; avatar manager ha nome accessibile e ring viola.

- [ ] **Step 2: implementare shell compatta**

Titolo `Calcio Circolo Chigi`, niente riferimento fisso al campionato; ordine controlli: titolo, Gestione, tema, campanella, avatar.

- [ ] **Step 3: verificare**

Run: `npm run test -- SiteHeader && npm run lint`

Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add src/components/SiteHeader* src/components/BottomNav.tsx src/app/layout.tsx
git commit -m "feat: update app navigation and manager entry"
```

### Task 9: Fondazione dashboard manager

**Files:**
- Create: `src/app/gestione/page.tsx`
- Create: `src/components/management/ManagementDashboard.tsx`
- Create: `src/components/management/ManagementTable.tsx`
- Create: `src/components/management/ManagementToolbar.tsx`
- Create: `src/components/management/KpiStrip.tsx`
- Create: `src/lib/management-api.ts`
- Create: `src/components/management/ManagementDashboard.test.tsx`

**Interfaces:**
- Produces: `fetchManagementRows(preset, filters)`, `updateMembershipIfCurrent(input, expectedUpdatedAt)`.

- [ ] **Step 1: testare preset e densità**

Preset richiesti: Rosa, Interessati, Tesseramenti, Certificati, Quote, Account. Righe hanno classe `h-11`; prima colonna sticky; selezione massiva e header tabella accessibili.

- [ ] **Step 2: implementare route e guardia**

Non-manager vede 403/CTA; manager carica solo stagione e preset corrente.

- [ ] **Step 3: implementare tabella**

Sort, filtro, resize colonne, selezione, pallino più testo/icona, updated-by/time; nessuna virtualizzazione.

- [ ] **Step 4: implementare controllo ottimistico**

RPC aggiorna solo con `updated_at = expected`; zero righe genera conflitto e chiede reload.

- [ ] **Step 5: verificare**

Run: `npm run test -- ManagementDashboard && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/app/gestione src/components/management src/lib/management-api.ts
git commit -m "feat: add dense manager dashboard foundation"
```

### Task 10: Scheda persona, interessati e account

**Files:**
- Create: `src/components/management/PersonDrawer.tsx`
- Create: `src/components/management/PersonForm.tsx`
- Create: `src/components/management/AccountPanel.tsx`
- Create: `src/components/management/PersonDrawer.test.tsx`

**Interfaces:**
- Produces: creazione interessato, conversione categoria, campi privati e stato `NONE|REQUESTED|ACTIVE`.

- [ ] **Step 1: testare permessi campo**

Manager modifica tutto; conferma obbligatoria per CF, associazione account e tesseramento; ASI/ruolo/maglia non compaiono come editabili fuori dashboard.

- [ ] **Step 2: implementare scheda**

Sezioni anagrafica, contatti, membership, archivio, quote, certificati, tesseramento, account, note e audit.

- [ ] **Step 3: implementare persona interessata**

Default `INTERESTED`, account nullo, next contact e manager referente; non deve comparire in Squadra.

- [ ] **Step 4: verificare**

Run: `npm run test -- PersonDrawer`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/components/management/Person*
git commit -m "feat: manage people interests and accounts"
```

### Task 11: Quote, certificati e tesseramento

**Files:**
- Create: `src/components/management/PaymentDialog.tsx`
- Create: `src/components/management/CertificatePanel.tsx`
- Create: `src/components/management/RegistrationPanel.tsx`
- Create: `src/components/management/operations.test.tsx`
- Modify: `src/app/profilo/page.tsx`

**Interfaces:**
- Produces: pagamento massivo/personalizzato, dichiarazione pagamento, verifica certificato agonistico e lock fototessera.

- [ ] **Step 1: testare transizioni**

`DUE -> PENDING_REVIEW -> PAID`; certificato richiede flag agonistico, data visita, scadenza, laboratorio e PDF; fototessera utente bloccata con tesseramento `ACTIVE`.

- [ ] **Step 2: implementare quote**

Manager seleziona persone, descrizione/importo/scadenza base, poi può personalizzare; utente dichiara CASH/BANK_TRANSFER; manager verifica.

- [ ] **Step 3: implementare certificati e file privati**

Validare `application/pdf`, dimensione, path membership; URL firmato breve; rifiuto conserva motivo.

- [ ] **Step 4: implementare tesseramento**

Manager conferma `ACTIVE`, data e autore; riapertura e sostituzione fototessera richiedono conferma.

- [ ] **Step 5: verificare**

Run: `npm run test -- operations && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/components/management/PaymentDialog.tsx src/components/management/CertificatePanel.tsx src/components/management/RegistrationPanel.tsx src/components/management/operations.test.tsx src/app/profilo/page.tsx
git commit -m "feat: manage payments certificates and registrations"
```

### Task 12: Check-in e statistiche partita

**Files:**
- Create: `src/components/management/CheckinPanel.tsx`
- Create: `src/components/management/MatchStatsEditor.tsx`
- Create: `src/components/management/CheckinPanel.test.tsx`
- Modify: `src/app/evento/[id]/page.tsx`

**Interfaces:**
- Produces: `set_event_checkin(eventId, profileId, status)`, `save_match_stats`.

- [ ] **Step 1: testare regole**

`PRESENT` forza RSVP `PRESENTE`; `ABSENT` non cambia RSVP; goal/assist/POTM accettano solo check-in presenti; un solo POTM.

- [ ] **Step 2: implementare pannelli manager**

Lista compatta avatar, check-in, contatori goal/assist, scelta POTM e righe own-goal/unattributed.

- [ ] **Step 3: implementare RPC atomiche**

Check-in e aggiornamento RSVP avvengono nella stessa transazione; vincoli DB impediscono statistiche su non presenti.

- [ ] **Step 4: verificare**

Run: `npm run test -- CheckinPanel && npm run db:verify`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/components/management/CheckinPanel* src/components/management/MatchStatsEditor.tsx src/app/evento
git commit -m "feat: add official check-ins and match stats"
```

### Task 13: Formazioni ufficiali e messaggio WhatsApp

**Files:**
- Create: `src/lib/formations.ts`
- Create: `src/lib/formations.test.ts`
- Create: `src/components/formations/OfficialFormationPanel.tsx`
- Create: `src/components/formations/NextMatchFormationButton.tsx`
- Modify: `src/app/evento/[id]/page.tsx`
- Modify: `src/app/squadra/page.tsx`

**Interfaces:**
- Produces: `buildOfficialFormationSnapshot`, `generateOfficialWhatsAppMessage`, `publishOfficialFormation`.

- [ ] **Step 1: testare testo richiesto**

Il messaggio contiene DOVE E QUANDO, DIVISA, TITOLARI, PANCHINA; badge testuali `UNDER` e `PORTIERE` restano dentro i due gruppi; saluto oggi/domani è automatico.

- [ ] **Step 2: implementare snapshot**

Una formazione per partita, titolari/panchina/ordine/posizioni/capitano/vice/modulo/colore; esclusi staff e `training_only`.

- [ ] **Step 3: implementare pubblica/aggiorna/ritira**

Ogni azione crea notifica; visibilità solo autenticati; manager può scaricare PNG e copiare WhatsApp.

- [ ] **Step 4: mantenere formazione personale**

Ogni autenticato può creare ed esportare la formazione attuale senza salvarla.

- [ ] **Step 5: verificare**

Run: `npm run test -- src/lib/formations.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/lib/formations* src/components/formations src/app/evento src/app/squadra/page.tsx
git commit -m "feat: publish official match formations"
```

### Task 14: Squadra pubblica e autenticata

**Files:**
- Create: `src/components/team/PublicRoster.tsx`
- Create: `src/components/team/AuthenticatedTeam.tsx`
- Create: `src/components/team/StaffRoster.tsx`
- Create: `src/components/team/roster.test.tsx`
- Modify: `src/app/squadra/page.tsx`

**Interfaces:**
- Consumes: vista `public_active_roster`, `canJoinMatchFormation`, sessione.

- [ ] **Step 1: testare visibilità**

Anonimo vede solo avatar/nome/ruolo/maglia e nessun link profilo/campo. Autenticato vede giocatori YES/MAYBE, staff separato e card staff espandibili. INTERESTED/PENDING/NO non compaiono.

- [ ] **Step 2: implementare componenti**

Avatar giocatore circolare; staff rounded-square; `Solo allenamenti` visibile ma non draggable; CTA login al posto delle funzioni private.

- [ ] **Step 3: verificare**

Run: `npm run test -- roster && npm run lint`

Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add src/components/team src/app/squadra/page.tsx
git commit -m "feat: split public and authenticated team roster"
```

### Task 15: Statistiche pubbliche e presenze autenticate

**Files:**
- Create: `src/app/statistiche/page.tsx`
- Create: `src/components/stats/AttendanceRing.tsx`
- Create: `src/components/stats/StatsLeaderboard.tsx`
- Create: `src/components/stats/stats.test.tsx`
- Modify: `src/app/profilo/page.tsx`

**Interfaces:**
- Produces: leaderboard pubblico goal/assist/POTM; ring presenze e storico per autenticati.

- [ ] **Step 1: testare privacy**

Anonimo vede statistiche sportive ma non percentuali/storico presenze; autenticato vede entrambe; avatar ha alt e ring ha testo percentuale.

- [ ] **Step 2: implementare pagina**

Tab compatte torneo/allenamenti; avatar nel riepilogo presenze; ordinamento accessibile e fallback vuoto.

- [ ] **Step 3: aggiungere statistiche personali**

Profilo mostra goal, assist, POTM pubblici e presenze solo autenticati.

- [ ] **Step 4: verificare**

Run: `npm run test -- stats && npm run build`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/app/statistiche src/components/stats src/app/profilo/page.tsx
git commit -m "feat: add public stats and private attendance"
```

### Task 16: Calendario desktop esteso e stagioni

**Files:**
- Create: `src/components/calendar/DesktopCalendar.tsx`
- Create: `src/components/calendar/DesktopCalendar.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/EventCard.tsx`

**Interfaces:**
- Produces: layout split ≥ `lg`, mobile conserva toggle attuale, badge stagione.

- [ ] **Step 1: testare rendering**

Desktop mostra calendario mensile a sinistra e prossimo/selezionato/cinque successivi a destra; mobile mostra UI esistente; filtri Tutti/Partite/Allenamenti.

- [ ] **Step 2: implementare layout responsive**

Nessun KPI mensile; query e realtime conservano filtro Chigi; skeleton mantiene dimensioni.

- [ ] **Step 3: verificare**

Run: `npm run test -- DesktopCalendar && npm run build`

Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add src/components/calendar src/app/page.tsx src/components/EventCard.tsx
git commit -m "feat: expand desktop calendar"
```

### Task 17: Presence manager, bulk e audit

**Files:**
- Create: `src/components/management/ManagerPresence.tsx`
- Create: `src/components/management/NotificationComposer.tsx`
- Create: `src/components/management/BulkActionDialog.tsx`
- Create: `src/components/management/realtime.test.tsx`
- Modify: `src/components/management/ManagementDashboard.tsx`

**Interfaces:**
- Produces: Presence manager verde/ambra/grigio, bulk result parziale, notifiche manuali.

- [ ] **Step 1: testare presenza**

Attivo ora verde, recente ambra, offline grigio con tooltip; pulse assente con reduced motion.

- [ ] **Step 2: implementare Presence**

Canale Supabase Presence solo dashboard, heartbeat e cleanup; non è un lock.

- [ ] **Step 3: implementare bulk**

Quote, scadenze, notifiche e update membership mostrano riepilogo, conferma e risultati riusciti/falliti.

- [ ] **Step 4: verificare**

Run: `npm run test -- realtime && npm run lint`

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/components/management
git commit -m "feat: add manager presence and bulk operations"
```

### Task 18: Polish, accessibilità e performance

**Files:**
- Modify: `src/app/globals.css`
- Modify: tutti i componenti creati nei Task 4–17
- Create: `tests/e2e/public-access.spec.ts`
- Create: `tests/e2e/manager-dashboard.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces: motion tokens, focus, aria-live, test axe e visual snapshot.

- [ ] **Step 1: scrivere E2E e axe**

Testare viewport `390x844`, `1280x900`, `1440x1000`; pagine pubbliche senza login; CTA protette; tabella manager fixture; axe senza violazioni serious/critical.

- [ ] **Step 2: applicare stile**

Righe `44px`, gerarchia compatta, sticky, focus visibile, target mobile `44px`, colori sempre accompagnati da testo/icona.

- [ ] **Step 3: applicare motion e budget**

Classi `ui-enter` con opacity/translate `160ms`; pulse solo presenza; media query reduced-motion azzera transizioni; export PNG/Excel caricato via `await import(...)`.

- [ ] **Step 4: verificare zoom e tastiera**

Eseguire test Playwright con keyboard-only, zoom 200% e reduced motion; salvare screenshot desktop/mobile per confronto.

- [ ] **Step 5: verificare bundle**

Run: `ANALYZE=true npm run build`

Expected: route pubbliche non includono ExcelJS/html-to-image nel chunk iniziale.

- [ ] **Step 6: commit**

```bash
git add src/app/globals.css src tests/e2e playwright.config.ts
git commit -m "feat: polish accessibility and responsive interactions"
```

### Task 19: Documentazione operativa e pulizia

**Files:**
- Rewrite: `README.md`
- Rewrite: `docs/README.md`
- Rewrite: `docs/DEPLOY.md`
- Create: `docs/OPERATIONS.md`
- Delete: `docs/ANALISI_FUNZIONALE.md`
- Delete: `docs/BUGS_E_PROBLEMI.md`
- Delete: `docs/ROADMAP_PROBLEMI.md`
- Delete: `docs/STORAGE.md`
- Delete: `docs/code-review-2026-07-24.md`
- Delete: `docs/superpowers/specs/2026-07-25-team-management-dashboard-design.md`
- Delete: `docs/superpowers/plans/2026-07-25-team-management-dashboard-implementation.md`

**Interfaces:**
- Produces: documentazione limitata a setup, env, migration/deploy, import, sync, push, test, backup e runbook.

- [ ] **Step 1: riscrivere documenti operativi**

README breve con scopo e avvio; `docs/README.md` come indice; `DEPLOY.md` con ordine migration → functions → import → app; `OPERATIONS.md` con routine e incidenti.

- [ ] **Step 2: rimuovere narrativa non operativa**

Eliminare audit, roadmap, analisi storiche, bug risolti, spec e piano ormai eseguiti.

- [ ] **Step 3: verificare link e segreti**

Run: `npm run docs:check && ! rg -n "SUPABASE_SERVICE_ROLE_KEY=.+" --glob '*.md' .`

Expected: link locali validi e nessun segreto.

- [ ] **Step 4: commit**

```bash
git add -A README.md docs
git commit -m "docs: keep operational runbooks only"
```

### Task 20: Migrazione live e audit finale

**Files:**
- Modify only if failures reveal defects.

**Interfaces:**
- Consumes all prior deliverables.
- Produces evidence requirement-by-requirement.

- [ ] **Step 1: applicare migration e funzioni**

Run: `supabase db push` oppure il comando operativo documentato per il progetto collegato; poi `supabase functions deploy account-association notification-dispatch`.

Expected: migration e funzioni attive senza drift.

- [ ] **Step 2: eseguire import e conteggi**

Applicare il Task 3 prima della rimozione Excel; verificare stagioni, match, creazioni e distribuzione stati.

- [ ] **Step 3: gate automatico completo**

Run: `npm run verify`

Expected: unit/component, SQL, lint, TypeScript, build ed E2E tutti PASS.

- [ ] **Step 4: smoke ruoli**

Verificare anonimo, account non associato, giocatore, staff, manager; tentativi diretti vietati devono ricevere RLS denial.

- [ ] **Step 5: smoke push**

Chrome desktop, Android e PWA iOS Home Screen: opt-in da gesto, consegna, deep-link, badge, revoca e fallback in-app.

- [ ] **Step 6: regressione visuale**

Confrontare Calendario, Squadra, Torneo, Statistiche, Evento, Profilo e Gestione a mobile/desktop, tema chiaro/scuro, reduced motion e 200% zoom.

- [ ] **Step 7: audit finale**

Associare ogni requisito della spec a schema, UI e test; qualsiasi evidenza mancante mantiene l’obiettivo aperto.

- [ ] **Step 8: commit correttivo finale**

```bash
git add -A
git commit -m "fix: close team management verification gaps"
```
