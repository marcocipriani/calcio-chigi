# Navigation, Profiles, and Seasonal Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship consistent responsive titlebars, protected player profiles, season/phase-aware statistics, live card tracking, and an atomic Enjore 2025/26 history import.

**Architecture:** Keep current match data event-based, add card counters to `match_player_stats`, and keep non-attributed Enjore history in one aggregate table. Expose narrow public season/stat views plus one authenticated safe-player RPC. Reuse existing React pages/components and add only one shared titlebar component and small season/stat helpers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase/PostgreSQL/RLS, Node.js built-in test runner, Vitest/Testing Library, pgTAP, Playwright.

## Global Constraints

- Work on the existing `main` history; preserve unrelated user changes.
- No new runtime dependency.
- `is_staff` remains roster category; only `is_manager` authorizes management.
- Tournament/Statistics default to `2026-2027`; do not change the global active-season calculation.
- Anonymous roster stays public; player detail requires an approved associated profile.
- Medical notes remain exclusive to Management.
- Enjore history is stored only per phase; total season values are calculated.
- Historical assists and 2025/26 training attendance remain unavailable, never coerced to zero.
- Calendar add action is titlebar desktop and circular FAB mobile; other mobile titlebar actions are circular icon-only.
- Every new SQL function has fixed `search_path`, explicit grants, and default execution revoked.

---

## File map

- `supabase/migrations/20260729010000_season_stats_player_access.sql`: cards, historical table, season/stat projections, profile RPC, import RPC, grants/RLS.
- `supabase/schema.sql`: regenerated canonical schema snapshot.
- `tests/db/team-management.test.sql`, `tests/db/rls-roles.test.sql`: database contracts and role matrix.
- `scripts/import-enjore-history.mjs`: fetch, parse, map, dry-run/apply.
- `scripts/import-enjore-history.test.mjs`: importer fixtures and pure-function tests.
- `scripts/fixtures/enjore/*.json`: fixed endpoint responses for four phases and three classifications.
- `src/lib/season-statistics.ts`: season/phase metadata and UI aggregation.
- `src/lib/season-statistics.test.ts`: null/zero/filter aggregation tests.
- `src/lib/types.ts`: event season and statistic types.
- `src/lib/api.ts`: season-aware events, player directory/stats, safe profile fetchers.
- `src/components/layout/PageTitleBar.tsx`: shared titlebar layout.
- `src/components/layout/PageTitleBar.test.tsx`: action/responsive/accessibility contract.
- `src/components/SiteHeader.tsx`: violet Gestione action.
- `src/app/page.tsx`: Calendar titlebar and responsive add action.
- `src/app/torneo/page.tsx`, `src/components/tournament/TournamentSelector.tsx`: real season/phase filtering and communications action.
- `src/app/squadra/page.tsx`, `src/components/team/PublicTeam.tsx`, `src/components/team/PlayerRosterCard.tsx`, `src/components/team/TeamTitleBar.tsx`: info link and inline formation.
- `src/app/giocatore/[id]/page.tsx`: session gate and viewer-tier sections.
- `src/components/management/ManagerPresence.tsx`: 3m/24h presence states and tooltip.
- `src/components/management/CheckinStatsPanel.tsx`: yellow/red entry.
- `src/app/statistiche/page.tsx`: season/phase statistics and responsive layout.
- `src/app/profilo/page.tsx`, `src/components/management/ManagementDashboard.tsx`: shared titlebars.
- `tests/e2e/app.spec.ts`, `tests/e2e/global-setup.ts`: role/responsive acceptance.
- `package.json`: importer scripts.

---

### Task 1: Database contracts for seasonal statistics and safe player access

**Files:**
- Create: `supabase/migrations/20260729010000_season_stats_player_access.sql`
- Modify: `tests/db/team-management.test.sql`
- Modify: `tests/db/rls-roles.test.sql`
- Regenerate: `supabase/schema.sql`

**Interfaces:**
- Produces table `historical_player_stats(season_id, phase_key, profile_id, goals, mvp, yellow_cards, red_cards, source_url, imported_at)`.
- Produces views `public_season_player_directory` and `public_player_statistics_by_phase`.
- Produces RPC `get_player_profile(p_profile_id uuid, p_season_id uuid)`.
- Produces service-only RPC `import_historical_player_stats(p_season_slug text, p_source_url text, p_rows jsonb)`.
- Extends `match_player_stats` with `yellow_cards` and `red_cards`.

- [ ] **Step 1: Add failing schema/grant tests**

Add pgTAP assertions equivalent to:

```sql
select has_table('public', 'historical_player_stats');
select has_column('public', 'match_player_stats', 'yellow_cards');
select has_column('public', 'match_player_stats', 'red_cards');
select has_view('public', 'public_season_player_directory');
select has_view('public', 'public_player_statistics_by_phase');
select has_function('public', 'get_player_profile', array['uuid', 'uuid']);
select has_function(
  'public',
  'import_historical_player_stats',
  array['text', 'text', 'jsonb']
);
select ok(
  not has_table_privilege('authenticated', 'public.historical_player_stats', 'SELECT'),
  'clients cannot read historical storage directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.import_historical_player_stats(text,text,jsonb)',
    'EXECUTE'
  ),
  'history import remains service-only'
);
```

Extend role tests so anon/unlinked calls to `get_player_profile` fail, an
associated teammate receives only safe fields, self/manager table reads remain
allowed, card writes are manager-only, and legacy `events.fase is null`
aggregates as `FASE_1`.

- [ ] **Step 2: Run database tests and verify failure**

Run:

```bash
npx supabase test db tests/db/*.sql
```

Expected: FAIL because the new table, columns, views, and RPCs do not exist.

- [ ] **Step 3: Add the migration**

Implement:

```sql
alter table public.match_player_stats
  add column if not exists yellow_cards integer not null default 0
    check (yellow_cards >= 0),
  add column if not exists red_cards integer not null default 0
    check (red_cards >= 0);

create table public.historical_player_stats (
  season_id uuid not null references public.seasons(id) on delete cascade,
  phase_key text not null check (phase_key in (
    'FASE_1',
    'FASE_2_CALCIATORI',
    'FASE_2_PROFESSIONISTI',
    'COPPA_LAZIO_PROFESSIONISTI'
  )),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  goals integer not null default 0 check (goals >= 0),
  mvp integer not null default 0 check (mvp >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  source_url text not null,
  imported_at timestamptz not null default now(),
  primary key (season_id, phase_key, profile_id)
);
```

Enable RLS, grant no client table access, create public projections without
private fields, aggregate match stats and awards in separate CTEs, normalize
`coalesce(events.fase, 'FASE_1')`, and suppress live rows when an authoritative
historical row exists for the same season/phase/profile.

Implement `get_player_profile` as `SECURITY DEFINER`, require
`current_profile_id()` and an approved association, return only:

```sql
profile_id, season_id, nome, cognome, avatar_url, role, jersey_number,
goals, assists, mvp, yellow_cards, red_cards
```

Implement the service-role importer to validate the JSON array, resolve the
season, delete that season/source dataset, and insert all rows in the same
function transaction. Revoke default execution and grant only intended roles.

- [ ] **Step 4: Regenerate and verify schema**

Run:

```bash
npm run db:snapshot
npm run db:verify
npx supabase test db tests/db/*.sql
```

Expected: schema verification and all pgTAP tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729010000_season_stats_player_access.sql supabase/schema.sql tests/db/team-management.test.sql tests/db/rls-roles.test.sql
git commit -m "feat: add seasonal statistics data contracts"
```

---

### Task 2: One-shot Enjore history importer

**Files:**
- Create: `scripts/import-enjore-history.mjs`
- Create: `scripts/import-enjore-history.test.mjs`
- Create: `scripts/fixtures/enjore/score-263752.json`
- Create: `scripts/fixtures/enjore/mvp-263752.json`
- Create: `scripts/fixtures/enjore/discipline-263752.json`
- Create corresponding fixtures for `265281`, `265282`, and `265296`
- Modify: `package.json`

**Interfaces:**
- Produces `parseEnjoreTable(html, classification): ParsedStanding[]`.
- Produces `buildImportRows({responses, memberships, overrides}): HistoricalImportRow[]`.
- CLI: `npm run import:enjore-history -- --dry-run` and `--apply`.
- Consumes Task 1 `import_historical_player_stats`.

- [ ] **Step 1: Write failing parser/mapping tests**

Cover:

```js
test("keeps only Circolo Chigi and reads both discipline columns", () => {
  const rows = parseEnjoreTable(fixture.html, "discipline")
  assert.deepEqual(rows.find(({ name }) => name === "Mozzillo C."), {
    name: "Mozzillo C.",
    team: "CIRC. CHIGI",
    yellowCards: 2,
    redCards: 0,
  })
})

test("refuses ambiguous abbreviated names", () => {
  assert.throws(
    () => matchProfile("Rossi A.", membershipsWithTwoRossis, {}),
    /Ambiguous Enjore player/,
  )
})

test("builds phase rows only and is deterministic", () => {
  const first = buildImportRows(input)
  const second = buildImportRows(input)
  assert.deepEqual(first, second)
  assert.equal(first.some(({ phaseKey }) => phaseKey === "ALL"), false)
})
```

- [ ] **Step 2: Run importer tests and verify failure**

Run:

```bash
node --test scripts/import-enjore-history.test.mjs
```

Expected: FAIL because importer exports do not exist.

- [ ] **Step 3: Implement pure parser and CLI**

Use built-in `fetch`, regex/HTML entity normalization limited to Enjore's
returned table shape, and the fixed mapping:

```js
export const PHASES = {
  263752: "FASE_1",
  265281: "FASE_2_CALCIATORI",
  265282: "FASE_2_PROFESSIONISTI",
  265296: "COPPA_LAZIO_PROFESSIONISTI",
}
```

Fetch `score`, `top-player`, and `discipline`; validate all responses before
creating a Supabase service client. Candidate profiles must have a `PLAYER`
membership in `2025-2026`. Match normalized surname plus initial, use an
explicit override object for genuine collisions, and abort on unresolved rows.
Dry-run prints sorted mappings and phase totals. Apply invokes the single Task
1 RPC once.

- [ ] **Step 4: Run tests and a network dry-run**

Run:

```bash
node --test scripts/import-enjore-history.test.mjs
npm run import:enjore-history -- --dry-run
```

Expected: tests PASS; dry-run reports four phases, all Chigi mappings, and no
database writes.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/import-enjore-history.mjs scripts/import-enjore-history.test.mjs scripts/fixtures/enjore
git commit -m "feat: add Enjore history importer"
```

---

### Task 3: Season/statistics client domain

**Files:**
- Create: `src/lib/season-statistics.ts`
- Create: `src/lib/season-statistics.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces `SEASON_OPTIONS`, `phaseOptionsForSeason`, `aggregateSeasonStats`.
- Produces `fetchSeasonEvents`, `fetchSeasonPlayerDirectory`,
  `fetchPlayerStatisticsByPhase`, `fetchSafePlayerProfile`.

- [ ] **Step 1: Write failing domain tests**

```ts
expect(SEASON_OPTIONS[0].slug).toBe("2026-2027")
expect(SEASON_OPTIONS[1].attendanceAvailable).toBe(false)
expect(
  phaseOptionsForSeason("2025-2026", rows).map(({ value }) => value),
).toContain("COPPA_LAZIO_PROFESSIONISTI")
expect(
  aggregateSeasonStats([{ goals: 2, assists: null }, { goals: 1, assists: null }]),
).toMatchObject({ goals: 3, assists: null })
```

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/lib/season-statistics.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal typed helpers**

Define:

```ts
export type PhaseFilter = EventFase | "ALL"
export type SeasonOption = {
  slug: "2026-2027" | "2025-2026"
  label: string
  attendanceAvailable: boolean
}
export type PlayerSeasonStat = {
  season_id: string
  phase_key: EventFase
  profile_id: string
  goals: number
  assists: number | null
  mvp: number
  yellow_cards: number
  red_cards: number
}
```

Preserve `null` across aggregation. API helpers select explicit columns and
throw returned Supabase errors instead of silently falling back.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/season-statistics.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season-statistics.ts src/lib/season-statistics.test.ts src/lib/types.ts src/lib/api.ts
git commit -m "feat: add seasonal statistics client domain"
```

---

### Task 4: Shared titlebar and responsive global actions

**Files:**
- Create: `src/components/layout/PageTitleBar.tsx`
- Create: `src/components/layout/PageTitleBar.test.tsx`
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/profilo/page.tsx`
- Modify: `src/components/management/ManagementDashboard.tsx`

**Interfaces:**
- Produces `PageTitleBar({title, subtitle, context, actions, filters})`.

- [ ] **Step 1: Write failing component tests**

Assert one level-one heading, subtitle, supplied action, 44px mobile action
class, and no titlebar business state. Add SiteHeader assertions for violet
`Gestione`, desktop text, and accessible icon label.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/components/layout/PageTitleBar.test.tsx
```

Expected: FAIL because `PageTitleBar` does not exist.

- [ ] **Step 3: Implement and adopt**

Use a grid/flex shell with `min-w-0`, render slots only when supplied, and keep
page-specific controls in callers. Calendar renders:

```tsx
<PageTitleBar
  title="Calendario"
  subtitle="Gli impegni della squadra"
  actions={isManager ? <AddEventTitleAction /> : null}
/>
```

Show desktop add action with `hidden sm:inline-flex`; retain one circular mobile
FAB with `sm:hidden`. Replace page-specific title wrappers in Profile and
Management without changing their data behavior.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- src/components/layout/PageTitleBar.test.tsx src/components/layout/PageContainer.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PageTitleBar.tsx src/components/layout/PageTitleBar.test.tsx src/components/SiteHeader.tsx src/app/page.tsx src/app/profilo/page.tsx src/components/management/ManagementDashboard.tsx
git commit -m "feat: unify responsive page titlebars"
```

---

### Task 5: Real Tournament and Phase controls

**Files:**
- Modify: `src/components/tournament/TournamentSelector.tsx`
- Modify: `src/components/tournament/TournamentSelector.test.tsx`
- Modify: `src/app/torneo/page.tsx`
- Modify: `src/app/classifica/page.tsx`

**Interfaces:**
- Consumes Task 3 `SEASON_OPTIONS`, `PhaseFilter`, and season fetchers.
- Consumes Task 4 `PageTitleBar`.

- [ ] **Step 1: Extend failing tests**

Test 2026/27 default, adjacent named comboboxes, phase reset after season change,
conditional phase choices, communications desktop label/mobile icon contract,
and `ALL` standings prompt.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/components/tournament/TournamentSelector.test.tsx
```

Expected: FAIL against the current single cosmetic tournament option.

- [ ] **Step 3: Implement filtering**

Resolve season IDs once, filter events by `season_id`, derive phases from event
and historical stat rows, and reset day/phase state atomically on season
change. `ALL` is valid for Calendar; Classifica renders
`Seleziona una fase per vedere la classifica`. Move selectors into the
PageTitleBar filter slot. Render Comunicati as icon+text desktop and circular
icon-only mobile.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/components/tournament/TournamentSelector.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/TournamentSelector.tsx src/components/tournament/TournamentSelector.test.tsx src/app/torneo/page.tsx src/app/classifica/page.tsx
git commit -m "feat: make tournament controls season aware"
```

---

### Task 6: Protected player detail, info action, and inline formation

**Files:**
- Modify: `src/components/team/PlayerRosterCard.tsx`
- Modify: `src/components/team/PlayerRosterCard.test.tsx`
- Modify: `src/components/team/PublicTeam.tsx`
- Modify: `src/app/squadra/page.tsx`
- Modify: `src/components/team/TeamTitleBar.tsx`
- Modify: `src/components/team/TeamTitleBar.test.tsx`
- Modify: `src/app/giocatore/[id]/page.tsx`

**Interfaces:**
- Consumes Task 1 `get_player_profile`.
- Consumes Task 3 `fetchSafePlayerProfile`.
- Consumes Task 4 `PageTitleBar`.

- [ ] **Step 1: Write failing privacy/interaction tests**

Test:

```tsx
render(<PlayerRosterCard player={player} canViewProfile={false} />)
expect(screen.queryByRole("link", { name: /profilo di/i })).toBeNull()

render(<PlayerRosterCard player={player} canViewProfile />)
expect(screen.getByRole("link", { name: "Profilo di Elio Dorbolò" }))
  .toHaveAttribute("href", "/giocatore/player-1")
```

Extend TeamPage tests so clicking formation mounts it immediately after the
titlebar, focuses it, and places it before `[data-player-grid]`.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/components/team/PlayerRosterCard.test.tsx src/components/team/TeamTitleBar.test.tsx
```

Expected: FAIL because the info action and inline placement are absent.

- [ ] **Step 3: Implement the UI and route gate**

Pass `isAssociated` from `useAppSession` into `PublicTeam`; render one circular
info link only when true. In `/giocatore/[id]`, wait for session loading,
redirect anonymous users to login and unassociated users to Team, then call the
safe RPC. Load self/manager private sections only after computing:

```ts
const isSelf = profile?.id === playerId
const canViewPrivate = isSelf || isManager
```

Never select `note_mediche`. Move `FormationBuilder` above `PublicTeam`; on
open call `focus({preventScroll: true})` then `scrollIntoView` unless reduced
motion is requested. Add collapse action.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- src/components/team/PlayerRosterCard.test.tsx src/components/team/TeamTitleBar.test.tsx src/components/auth/AppSessionProvider.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/PlayerRosterCard.tsx src/components/team/PlayerRosterCard.test.tsx src/components/team/PublicTeam.tsx src/app/squadra/page.tsx src/components/team/TeamTitleBar.tsx src/components/team/TeamTitleBar.test.tsx src/app/giocatore/'[id]'/page.tsx
git commit -m "feat: protect player profiles and focus formations"
```

---

### Task 7: Manager presence semantics

**Files:**
- Create: `src/components/management/ManagerPresence.test.tsx`
- Modify: `src/components/management/ManagerPresence.tsx`

**Interfaces:**
- Produces `presenceState(lastSeenAt, now)` with `ONLINE`, `RECENT`, `STALE`,
  `NEVER`.

- [ ] **Step 1: Write failing boundary tests**

Use fake timers for 2:59, 3:00, 23:59, 24:01, and null. Assert green/yellow/grey
classes and `Online`, relative time, or `Mai attivo`.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/components/management/ManagerPresence.test.tsx
```

Expected: FAIL because the current threshold is 15 minutes and uses `title`.

- [ ] **Step 3: Implement**

Export the pure classifier, keep the existing two-minute touch, replace native
`title` with the existing Radix Tooltip components, and calculate Italian
relative labels with installed `date-fns`.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/components/management/ManagerPresence.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/management/ManagerPresence.tsx src/components/management/ManagerPresence.test.tsx
git commit -m "fix: report manager activity accurately"
```

---

### Task 8: Match cards and seasonal Statistics UI

**Files:**
- Create: `src/components/management/CheckinStatsPanel.test.tsx`
- Modify: `src/components/management/CheckinStatsPanel.tsx`
- Create: `src/app/statistiche/page.test.tsx`
- Modify: `src/app/statistiche/page.tsx`

**Interfaces:**
- Consumes Task 1 card columns/views.
- Consumes Task 3 season/stat helpers.
- Consumes Task 4 `PageTitleBar`.

- [ ] **Step 1: Write failing UI tests**

Assert that manager player rows contain numeric `Goal`, `Assist`,
`Ammonizioni`, `Espulsioni` inputs and save all four fields. For Statistics,
assert:

```tsx
expect(screen.queryByText("Pubbliche")).toBeNull()
expect(screen.queryByText("Login")).toBeNull()
expect(screen.getByRole("combobox", { name: "Stagione" })).toHaveTextContent("2026/27")
expect(screen.getByRole("heading", { name: "MVP" })).toBeVisible()
expect(screen.getByRole("heading", { name: "Ammonizioni" })).toBeVisible()
expect(screen.getByRole("heading", { name: "Espulsioni" })).toBeVisible()
```

Test 2025/26 renders `—` assists and `Dati non disponibili` attendance; 2026/27
renders zeros.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/components/management/CheckinStatsPanel.test.tsx src/app/statistiche/page.test.tsx
```

Expected: FAIL because cards and seasonal selectors/rankings are absent.

- [ ] **Step 3: Implement match-stat entry**

Extend local row state and explicit selects/upserts:

```ts
type MatchStatDraft = {
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
}
```

Keep one save action and existing MVP control.

- [ ] **Step 4: Implement Statistics page**

Use `public_season_player_directory` and
`public_player_statistics_by_phase`. Season affects all sections; phase affects
tournament rankings only. Preserve null assists. Place tournament and training
sections in `lg:grid-cols-2`. Remove pills and add ranked MVP/yellow/red lists.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- src/components/management/CheckinStatsPanel.test.tsx src/app/statistiche/page.test.tsx src/lib/season-statistics.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/management/CheckinStatsPanel.tsx src/components/management/CheckinStatsPanel.test.tsx src/app/statistiche/page.tsx src/app/statistiche/page.test.tsx
git commit -m "feat: add seasonal rankings and card tracking"
```

---

### Task 9: Acceptance coverage, live import, and integration

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `tests/e2e/global-setup.ts`
- Modify: `docs/OPERATIONS.md`

**Interfaces:**
- Consumes all earlier tasks.
- Produces final repository and operational evidence.

- [ ] **Step 1: Add failing E2E acceptance cases**

Cover anonymous icon absence/direct detail denial, associated teammate minimal
profile, self/manager private sections, conditional tournament phases,
2026/27 zero state, 2025/26 unavailable attendance, inline formation order,
responsive titlebar actions, and Calendar desktop/mobile add-action exclusivity.

- [ ] **Step 2: Run focused E2E and fix product defects**

```bash
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=mobile
```

Expected: PASS after fixing only defects within this specification.

- [ ] **Step 3: Apply migrations and import history**

Apply the migration to the intended Supabase environment using the repository's
existing migration workflow, then run:

```bash
npm run import:enjore-history -- --dry-run
npm run import:enjore-history -- --apply
```

Verify database rows for all four phases and compare per-player phase sums to
the Enjore all-phases totals. Record exact commands and recovery behavior in
`docs/OPERATIONS.md`.

- [ ] **Step 4: Run the complete gate**

```bash
npx supabase test db tests/db/*.sql
npm run test:import
node --test scripts/import-enjore-history.test.mjs
npm test
npm run typecheck
npm run lint
npm run db:verify
npm run build
npm run test:e2e
```

Expected: every command PASS; only explicitly documented environment skips are
allowed.

- [ ] **Step 5: Inspect repository and commit**

```bash
git diff --check
git status --short
git add tests/e2e/app.spec.ts tests/e2e/global-setup.ts docs/OPERATIONS.md
git commit -m "test: verify seasonal team experience"
```

- [ ] **Step 6: Integrate on main**

Run a fresh complete gate on final `main`, push the verified commits to
`origin/main`, and verify the remote branch contains the final commit. If branch
protection requires a pull request, push a feature branch, open the PR against
`main`, wait for required checks, merge it, and then re-run the final-state
smoke against updated `origin/main`.
