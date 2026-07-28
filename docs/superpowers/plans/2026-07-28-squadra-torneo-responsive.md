# Squadra and Torneo Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a denser responsive team roster, a public formation playground separated from manager-only official publishing, a two-state next-match capsule, a tournament selector, and a shared responsive page viewport.

**Architecture:** Keep one `FormationBuilder` with explicit `PLAYGROUND` and `OFFICIAL` modes, but move pure presentation and message formatting into focused units. `TeamPage` owns orchestration and next-match state; roster cards, title bar, and match capsule remain query-free. A shared `PageContainer` fixes outer width and padding while allowing narrower inner content.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui, Supabase JS, Vitest/Testing Library, Playwright.

## Global Constraints

- Preserve all pre-existing unstaged work; stage only files listed by the current task.
- Use `max-w-7xl` for the shared outer page viewport, with mobile-first horizontal padding and the existing global navbar/safe-area clearance.
- Player grid: 2 columns below 360 px, 3 from 360 px, 4 on tablet, 6 on desktop.
- Red is exclusive to next-match and published-official-formation states.
- `Crea la tua formazione` is available to anonymous users and never writes to Supabase.
- `Pubblica formazione` is purple, manager-only, and still protected by the existing RPC/RLS rules.
- The next-match capsule is white/red outline before publication and solid red after publication; the published state shows `published_at`.
- No new dependency and no tournament schema migration.
- Every production behavior starts with a failing test and an observed RED result.

---

## File Map

### New files

- `src/components/layout/PageContainer.tsx` — shared outer page viewport.
- `src/components/team/PlayerRosterCard.tsx` — compact player card.
- `src/components/team/TeamTitleBar.tsx` — title, launch actions, and responsive composition.
- `src/components/formations/NextMatchCapsule.tsx` — query-free two-state capsule.
- `src/components/formations/useNextMatchFormation.ts` — fetches next match, opponent logo, and published formation summary.
- `src/components/tournament/TournamentSelector.tsx` — controlled competition selector.
- `src/components/team/PlayerRosterCard.test.tsx` — card behavior.
- `src/components/formations/NextMatchCapsule.test.tsx` — capsule states.
- `src/components/team/TeamTitleBar.test.tsx` — role-based actions.
- `src/components/tournament/TournamentSelector.test.tsx` — accessible selector contract.

### Modified files

- `src/lib/formations.ts` and `src/lib/formations.test.ts` — personal formation message.
- `src/lib/api.ts` — public playground roster query.
- `src/components/team/PublicTeam.tsx` — roster-only layout using compact cards.
- `src/components/formations/FormationBuilder.tsx` — explicit mode and mode-specific data/actions.
- `src/app/squadra/page.tsx` — orchestration and builder launch state.
- `src/app/torneo/page.tsx` — tournament selector and shared outer viewport.
- All `src/app/**/page.tsx` application pages — shared outer `PageContainer`.
- `tests/e2e/app.spec.ts` — public playground, capsule states, responsive grid, tournament selector, and page viewport.

---

### Task 1: Personal Formation Message

**Files:**
- Modify: `src/lib/formations.ts`
- Modify: `src/lib/formations.test.ts`

**Interfaces:**
- Produces:

```ts
export type PersonalFormationEntry = {
  nome: string
  cognome: string
  positionKey: string
}

export function buildPersonalFormationMessage(
  module: string,
  shirtColor: string,
  entries: PersonalFormationEntry[],
): string
```

- Consumes: `FORMATIONS` from `src/lib/constants.ts` to map each `positionKey` to `PT`, `DIF`, `CEN`, or `ATT`.

- [ ] **Step 1: Write the failing message-format tests**

Add literal-output assertions:

```ts
import {
  buildOfficialFormationMessage,
  buildPersonalFormationMessage,
  isUnderPlayer,
} from "@/lib/formations"

describe("buildPersonalFormationMessage", () => {
  it("groups selected players by formation department", () => {
    expect(
      buildPersonalFormationMessage("4-3-3", "BLU", [
        { nome: "Marco", cognome: "Rossi", positionKey: "POR" },
        { nome: "Gianluca", cognome: "Menichini", positionKey: "DC1" },
        { nome: "Elio", cognome: "Dorbolò", positionKey: "CC" },
        { nome: "Luca", cognome: "Palladino", positionKey: "ATT" },
      ]),
    ).toBe(`⚽ LA MIA FORMAZIONE · 4-3-3

🧤 PORTIERE
Marco Rossi

🛡️ DIFESA
Gianluca Menichini

⚙️ CENTROCAMPO
Elio Dorbolò

🎯 ATTACCO
Luca Palladino

🔵 Maglia blu`)
  })

  it("omits empty departments and keeps bench separate", () => {
    const message = buildPersonalFormationMessage("4-4-2", "ROSSA", [
      { nome: "Luca", cognome: "Palladino", positionKey: "ATT1" },
      { nome: "Andrea", cognome: "Fontana", positionKey: "P1" },
    ])

    expect(message).not.toContain("PORTIERE")
    expect(message).toContain("🎯 ATTACCO\nLuca Palladino")
    expect(message).toContain("🪑 PANCHINA\nAndrea Fontana")
    expect(message).toContain("🔴 Maglia rossa")
  })
})
```

- [ ] **Step 2: Run the tests and observe RED**

Run:

```bash
npm test -- src/lib/formations.test.ts
```

Expected: FAIL because `buildPersonalFormationMessage` is not exported.

- [ ] **Step 3: Implement slot-to-department mapping and formatter**

Use `FORMATIONS[module]` to derive roles rather than parsing slot names:

```ts
import { FORMATIONS } from "@/lib/constants"

export type PersonalFormationEntry = {
  nome: string
  cognome: string
  positionKey: string
}

export function buildPersonalFormationMessage(
  module: string,
  shirtColor: string,
  entries: PersonalFormationEntry[],
) {
  const roleBySlot = new Map(
    (FORMATIONS[module] ?? []).map(({ id, role }) => [id, role]),
  )
  const groups = [
    { role: "PT", title: "🧤 PORTIERE" },
    { role: "DIF", title: "🛡️ DIFESA" },
    { role: "CEN", title: "⚙️ CENTROCAMPO" },
    { role: "ATT", title: "🎯 ATTACCO" },
    { role: "BENCH", title: "🪑 PANCHINA" },
  ]
  const sections = groups.flatMap(({ role, title }) => {
    const players = entries.filter(({ positionKey }) =>
      role === "BENCH"
        ? positionKey.startsWith("P")
        : roleBySlot.get(positionKey) === role,
    )
    return players.length
      ? [`${title}\n${players.map(({ nome, cognome }) => `${nome} ${cognome}`).join("\n")}`]
      : []
  })
  const shirt = shirtColor === "ROSSA" ? "🔴 Maglia rossa" : "🔵 Maglia blu"
  return `⚽ LA MIA FORMAZIONE · ${module}\n\n${sections.join("\n\n")}\n\n${shirt}`
}
```

- [ ] **Step 4: Run focused and full unit suites**

Run:

```bash
npm test -- src/lib/formations.test.ts
npm test
```

Expected: focused tests PASS; full Vitest suite has zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formations.ts src/lib/formations.test.ts
git commit -m "feat: format personal formation messages"
```

---

### Task 2: Shared Responsive Page Container

**Files:**
- Create: `src/components/layout/PageContainer.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/squadra/page.tsx`
- Modify: `src/app/torneo/page.tsx`
- Modify: `src/app/classifica/page.tsx`
- Modify: `src/app/statistiche/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/profilo/page.tsx`
- Modify: `src/app/gestione/page.tsx`
- Modify: `src/app/evento/[id]/page.tsx`
- Modify: `src/app/giocatore/[id]/page.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces:

```ts
type PageContainerProps = React.ComponentProps<"div"> & {
  contentClassName?: string
}

export function PageContainer(props: PageContainerProps): React.JSX.Element
```

- The outer element always has `data-page-container`, `mx-auto`, `w-full`, `max-w-7xl`, `px-2`, `sm:px-4`, and `lg:px-6`.
- `contentClassName` constrains only the inner content; it must never override the outer viewport width.

- [ ] **Step 1: Add a failing E2E viewport contract**

Extend the existing mobile route loop and add a desktop check:

```ts
async function expectSharedPageViewport(page: Page) {
  const container = page.locator("[data-page-container]").first()
  await expect(container).toBeVisible()
  const box = await container.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
}
```

Call it for `/`, `/squadra`, `/torneo`, `/classifica`, `/statistiche`,
`/giocatore/91000000-0000-0000-0000-000000000002`,
`/evento/92000000-0000-0000-0000-000000000001`, and `/login`. Add
authenticated calls for `/profilo` and `/gestione`.

- [ ] **Step 2: Run the focused E2E test and observe RED**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "viewport condiviso"
```

Expected: FAIL because no `[data-page-container]` exists.

- [ ] **Step 3: Create `PageContainer`**

```tsx
import { cn } from "@/lib/utils"

export function PageContainer({
  children,
  className,
  contentClassName,
  ...props
}: React.ComponentProps<"div"> & { contentClassName?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 lg:px-6", className)}
      data-page-container
      {...props}
    >
      <div className={cn("w-full", contentClassName)}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Replace page-level width wrappers**

For each page:

- use `PageContainer` as the only outer width/padding owner;
- move existing `max-w-md`, `max-w-2xl`, `max-w-4xl`, `max-w-5xl`, or
  `max-w-6xl` to `contentClassName="mx-auto ..."` when the reading width must
  remain narrow;
- keep loading and loaded branches on the same container contract;
- retain existing `pb-24` only on the inner content until Task 7 confirms it
  can be removed safely;
- preserve semantic `<main>` elements inside the container where they exist.

Example conversion:

```tsx
<PageContainer contentClassName="mx-auto max-w-4xl space-y-4 pb-24">
  {/* existing Torneo content */}
</PageContainer>
```

- [ ] **Step 5: Run viewport E2E and static checks**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "viewport condiviso"
npm run typecheck
npm run lint
```

Expected: E2E PASS on desktop and mobile; typecheck and lint exit 0.

- [ ] **Step 6: Commit**

Stage only the container, page files, and the viewport test:

```bash
git add \
  src/components/layout/PageContainer.tsx \
  src/app/page.tsx \
  src/app/squadra/page.tsx \
  src/app/torneo/page.tsx \
  src/app/classifica/page.tsx \
  src/app/statistiche/page.tsx \
  src/app/login/page.tsx \
  src/app/profilo/page.tsx \
  src/app/gestione/page.tsx \
  'src/app/evento/[id]/page.tsx' \
  'src/app/giocatore/[id]/page.tsx' \
  tests/e2e/app.spec.ts
git commit -m "refactor: unify responsive page viewport"
```

Before committing, inspect `git diff --cached` and unstage any unrelated
pre-existing changes from `src/app/layout.tsx`, `src/app/globals.css`, or the
earlier navbar work.

---

### Task 3: Compact Player Cards

**Files:**
- Create: `src/components/team/PlayerRosterCard.tsx`
- Create: `src/components/team/PlayerRosterCard.test.tsx`
- Modify: `src/components/team/PublicTeam.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes:

```ts
type PlayerRosterCardProps = {
  player: {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    role: string | null
    jersey_number: number | null
    status: "YES" | "MAYBE"
  }
  stats?: {
    goals: number
    assists: number
    player_of_match: number
  }
}
```

- Produces one `article` with `data-player-card` and an accessible name equal
  to the player's full name.

- [ ] **Step 1: Write failing component tests**

```tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PlayerRosterCard } from "@/components/team/PlayerRosterCard"

const player = {
  id: "player-1",
  nome: "Elio",
  cognome: "Dorbolò",
  avatar_url: null,
  role: "CENTROCAMPISTA",
  jersey_number: 8,
  status: "YES" as const,
}

describe("PlayerRosterCard", () => {
  it("orders name, surname, shirt number, role, and centered stats", () => {
    render(
      <PlayerRosterCard
        player={player}
        stats={{ goals: 2, assists: 1, player_of_match: 1 }}
      />,
    )
    const card = screen.getByRole("article", { name: "Elio Dorbolò" })
    const values = within(card).getAllByTestId(/player-(first-name|surname|shirt|role|stats)/)
    expect(values.map((element) => element.dataset.testid)).toEqual([
      "player-first-name",
      "player-surname",
      "player-shirt",
      "player-role",
      "player-stats",
    ])
    expect(within(card).getByLabelText("Numero 8")).toBeVisible()
    expect(within(card).getByText("CENTROCAMPISTA")).toBeVisible()
  })

  it("keeps maybe status visible without replacing player data", () => {
    render(<PlayerRosterCard player={{ ...player, status: "MAYBE" }} />)
    expect(screen.getByText("Forse")).toBeVisible()
    expect(screen.getByText("Dorbolò")).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the component test and observe RED**

Run:

```bash
npm test -- src/components/team/PlayerRosterCard.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the compact card**

Use `Shirt` from Lucide, with the number absolutely centered inside:

```tsx
<article
  aria-label={`${player.nome} ${player.cognome}`}
  className="relative min-w-0 overflow-hidden rounded-xl border bg-card px-1.5 py-2 text-center shadow-xs"
  data-player-card
>
  <Avatar className="mx-auto size-10 ring-1 ring-border">
    <AvatarImage alt={`${player.nome} ${player.cognome}`} src={player.avatar_url ?? undefined} />
    <AvatarFallback>{player.nome[0]}{player.cognome[0]}</AvatarFallback>
  </Avatar>
  <p className="mt-1 truncate text-[10px] text-muted-foreground" data-testid="player-first-name">
    {player.nome}
  </p>
  <h2 className="truncate text-xs font-black" data-testid="player-surname">
    {player.cognome}
  </h2>
  <span
    aria-label={`Numero ${player.jersey_number ?? "non assegnato"}`}
    className="relative mx-auto mt-0.5 block size-5 text-primary"
    data-testid="player-shirt"
  >
    <Shirt aria-hidden="true" className="size-5 fill-current opacity-15" />
    <strong className="absolute inset-0 grid place-items-center text-[8px]">
      {player.jersey_number ?? "—"}
    </strong>
  </span>
  <p className="truncate text-center text-[8px] uppercase tracking-wide text-muted-foreground" data-testid="player-role">
    {player.role ?? "Ruolo da definire"}
  </p>
  <div className="mt-1 flex justify-center gap-2 border-t pt-1 text-[9px] tabular-nums" data-testid="player-stats">
    <span><strong>{stats?.goals ?? 0}</strong> G</span>
    <span><strong>{stats?.assists ?? 0}</strong> A</span>
    <span><Sparkles aria-label="MVP" className="inline size-2.5" /> <strong>{stats?.player_of_match ?? 0}</strong></span>
  </div>
</article>
```

Add the existing `MAYBE` badge as an absolutely positioned overlay.

- [ ] **Step 4: Replace player markup and grid in `PublicTeam`**

- Remove title/title-count rendering; `TeamPage` will own the title bar.
- Render `PlayerRosterCard` for players.
- Use:

```tsx
<div className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
```

- Keep the staff block and its current accessible `<details>` behavior.
- Match the skeleton grid to the same column classes.

- [ ] **Step 5: Add and run responsive E2E assertions**

Add `data-player-grid` to the grid. In Playwright, inspect
`getComputedStyle(grid).gridTemplateColumns.split(" ").length` at viewports
`{ width: 350, height: 800 }`, iPhone 13, and desktop.

Run:

```bash
npm test -- src/components/team/PlayerRosterCard.test.tsx
npx playwright test tests/e2e/app.spec.ts --grep "griglia rosa responsive"
```

Expected: 2 columns at 350 px, 3 on iPhone 13, and 6 at desktop width.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/PlayerRosterCard.tsx src/components/team/PlayerRosterCard.test.tsx src/components/team/PublicTeam.tsx tests/e2e/app.spec.ts
git commit -m "feat: compact responsive player cards"
```

---

### Task 4: Next-Match Capsule and Team Title Bar

**Files:**
- Create: `src/components/formations/NextMatchCapsule.tsx`
- Create: `src/components/formations/NextMatchCapsule.test.tsx`
- Create: `src/components/team/TeamTitleBar.tsx`
- Create: `src/components/team/TeamTitleBar.test.tsx`
- Create: `src/components/formations/useNextMatchFormation.ts`
- Modify: `src/components/formations/OfficialFormationCard.tsx`
- Modify: `src/app/squadra/page.tsx`

**Interfaces:**
- Produces:

```ts
export type NextMatchSummary = {
  id: string
  opponent: string
  opponentLogoUrl: string | null
  startsAt: string
  publishedAt: string | null
}

export function NextMatchCapsule({
  match,
}: {
  match: NextMatchSummary
}): React.JSX.Element

export function TeamTitleBar({
  isManager,
  match,
  onOpenPlayground,
  onOpenOfficial,
}: {
  isManager: boolean
  match: NextMatchSummary | null
  onOpenPlayground: () => void
  onOpenOfficial: () => void
}): React.JSX.Element

export function useNextMatchFormation(): {
  loading: boolean
  match: NextMatchSummary | null
  refresh: () => Promise<void>
}
```

- Consumes `fetchNextChigiMatch`, `fetchTeamLogoByName`, and the existing
  `official_formations` public query.

- [ ] **Step 1: Write failing capsule tests**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NextMatchCapsule } from "@/components/formations/NextMatchCapsule"

const match = {
  id: "match-1",
  opponent: "PSICOLOGOL",
  opponentLogoUrl: "/teams/psicologi.png",
  startsAt: "2026-07-30T21:15:00+02:00",
  publishedAt: null,
}

describe("NextMatchCapsule", () => {
  it("uses the outline draft state before publication", () => {
    render(<NextMatchCapsule match={match} />)
    expect(screen.getByText("Da pubblicare")).toBeVisible()
    expect(screen.getByTestId("next-match-capsule")).toHaveAttribute("data-state", "draft")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("uses the solid state and publication timestamp after publication", () => {
    render(
      <NextMatchCapsule
        match={{ ...match, publishedAt: "2026-07-28T18:42:00+02:00" }}
      />,
    )
    expect(screen.getByRole("link", { name: /formazione ufficiale/i })).toHaveAttribute(
      "href",
      "/evento/match-1",
    )
    expect(screen.getByText(/Pubblicata il 28 lug · 18:42/)).toBeVisible()
    expect(screen.getByTestId("next-match-capsule")).toHaveAttribute("data-state", "published")
  })
})
```

- [ ] **Step 2: Write failing title-bar role tests**

```tsx
const match = {
  id: "match-1",
  opponent: "PSICOLOGOL",
  opponentLogoUrl: "/teams/psicologi.png",
  startsAt: "2026-07-30T21:15:00+02:00",
  publishedAt: null,
}

describe("TeamTitleBar", () => {
  it("shows the public playground without manager controls", () => {
    render(
      <TeamTitleBar
        isManager={false}
        match={null}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(screen.getByRole("button", { name: "Crea la tua formazione" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Pubblica formazione" })).not.toBeInTheDocument()
  })

  it("shows the purple official action to managers", () => {
    render(
      <TeamTitleBar
        isManager
        match={match}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(screen.getByRole("button", { name: "Pubblica formazione" })).toHaveClass("bg-violet-600")
  })
})
```

- [ ] **Step 3: Run both files and observe RED**

Run:

```bash
npm test -- src/components/formations/NextMatchCapsule.test.tsx src/components/team/TeamTitleBar.test.tsx
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the query-free capsule**

- Use `format` with Italian locale for match and publication times.
- Render the opponent logo with `Avatar` so missing logos fall back to
  initials.
- Draft: `border-red-600 bg-background text-red-700`.
- Published: `border-red-700 bg-red-700 text-white`.
- Only the published state is a link to `/evento/${match.id}`.
- Add `data-state` and `data-testid="next-match-capsule"` for behavioral tests.

- [ ] **Step 5: Implement the title bar**

- Desktop layout: title, capsule, then two compact action buttons.
- Mobile layout: title plus icon buttons on the first row; capsule on a full
  second row.
- Use `Tooltip` for icon-only mobile affordances.
- The neutral action always renders.
- The violet action renders only for `isManager`.
- If `isManager` is true and `match` is null, render the violet button disabled
  with tooltip `Nessuna prossima partita`.

- [ ] **Step 6: Implement `useNextMatchFormation`**

On `refresh()`:

1. call `fetchNextChigiMatch`;
2. derive opponent with the same Chigi-home/away rule currently in
   `OfficialFormationCard`;
3. fetch `fetchTeamLogoByName(opponent)`;
4. query `official_formations` for `id,published_at` with `status=PUBLISHED`;
5. expose `publishedAt` or `null`.

Guard every async state update with the existing active/unmount pattern.

- [ ] **Step 7: Replace `OfficialFormationCard` use on TeamPage**

- Delete or reduce `OfficialFormationCard.tsx` to a compatibility re-export if
  no other importer exists; verify with `rg "OfficialFormationCard" src`.
- Render `TeamTitleBar` before `PublicTeam`.
- Do not open a builder yet; Task 6 wires modes.

- [ ] **Step 8: Run component, type, and lint checks**

```bash
npm test -- src/components/formations/NextMatchCapsule.test.tsx src/components/team/TeamTitleBar.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/formations src/components/team/TeamTitleBar.tsx src/components/team/TeamTitleBar.test.tsx src/app/squadra/page.tsx
git commit -m "feat: add responsive next-match title bar"
```

---

### Task 5: Public Roster Source for Playground

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/types.ts` only if the existing public roster type cannot be
  expressed locally
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces:

```ts
export type FormationRosterPlayer = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  data_nascita: string | null
  ruolo: string | null
  numero_maglia: number | null
  dipartimento: string | null
  tags: string[]
  is_staff: boolean
  training_only: boolean
}

export async function fetchPublicFormationRoster(
  supabase: SupabaseClient,
): Promise<FormationRosterPlayer[]>
```

- [ ] **Step 1: Add a failing anonymous E2E boundary test**

In the local seed, the public roster already contains YES, MAYBE, NO, and staff
records. Scope assertions to the builder so existing roster cards cannot
satisfy them:

```ts
test("il playground anonimo usa soltanto la rosa pubblica", async ({ page }) => {
  await page.goto("/squadra")
  await page.getByRole("button", { name: "Crea la tua formazione" }).click()
  const builder = page.locator('[data-formation-builder-mode="PLAYGROUND"]')
  await expect(builder.getByText("Piero", { exact: true }).first()).toBeVisible()
  await expect(builder.getByText("Marco", { exact: true }).first()).toBeVisible()
  await expect(builder.getByText("Nino", { exact: true })).toHaveCount(0)
  await expect(builder.getByText("Sara", { exact: true })).toHaveCount(0)
})
```

- [ ] **Step 2: Run and observe RED**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --project=mobile --grep "playground anonimo"
```

Expected: FAIL because the public button/builder is not implemented.

- [ ] **Step 3: Implement `fetchPublicFormationRoster`**

Query only safe view columns:

```ts
const { data, error } = await supabase
  .from("public_active_roster")
  .select("id,nome,cognome,avatar_url,role,jersey_number,status")
  .in("status", ["YES", "MAYBE"])
  .eq("category", "PLAYER")
  .order("cognome")
```

Throw the Supabase error so the builder can show a retry state. Map rows to
`FormationRosterPlayer`, with unavailable private properties set to `null`,
empty arrays, or `false`.

- [ ] **Step 4: Typecheck the boundary**

Run:

```bash
npm run typecheck
```

Expected: exit 0. The E2E test remains RED until Task 6 wires the builder.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/types.ts tests/e2e/app.spec.ts
git commit -m "feat: expose safe public formation roster"
```

---

### Task 6: One Formation Builder with Two Modes

**Files:**
- Modify: `src/components/formations/FormationBuilder.tsx`
- Modify: `src/app/squadra/page.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes:

```ts
export type FormationBuilderMode = "PLAYGROUND" | "OFFICIAL"

export function FormationBuilder({
  mode,
  onPublished,
}: {
  mode: FormationBuilderMode
  onPublished?: () => void | Promise<void>
}): React.JSX.Element
```

- `PLAYGROUND` calls `fetchPublicFormationRoster`.
- `OFFICIAL` calls `fetchNextChigiMatch` then `fetchRosterForEvent`.
- `onPublished` refreshes the match capsule after successful RPC publication.
- The root carries `data-formation-builder-mode={mode}`.

- [ ] **Step 1: Extend the anonymous E2E test with exports**

After opening the public builder:

```ts
await expect(page.getByRole("heading", { name: "Crea la tua formazione" })).toBeVisible()
await expect(page.getByRole("button", { name: "Esporta formazione" })).toBeVisible()
await page.getByRole("button", { name: "Esporta formazione" }).click()
await expect(page.getByRole("menuitem", { name: "Scarica PNG" })).toBeVisible()
await expect(page.getByRole("menuitem", { name: "Copia messaggio" })).toBeVisible()
await expect(page.getByRole("button", { name: "Pubblica formazione ufficiale" })).toHaveCount(0)
```

Grant clipboard permissions in this test, place one seeded player into a slot
using:

```ts
await page.getByRole("button", { name: "Seleziona giocatore per POR" }).click()
await page.getByRole("dialog").getByText("Piero", { exact: true }).click()
```

Then click `Copia messaggio` and assert clipboard text contains
`LA MIA FORMAZIONE`.

- [ ] **Step 2: Add a manager mode E2E test**

Authenticate as manager and assert:

```ts
await page.getByRole("button", { name: "Pubblica formazione" }).click()
await expect(page.getByRole("heading", { name: "Formazione ufficiale" })).toBeVisible()
await expect(page.getByRole("button", { name: "Pubblica formazione ufficiale" })).toBeVisible()
await expect(page.getByText("Scarica distinta")).toBeVisible()
```

- [ ] **Step 3: Run both tests and observe RED**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "playground anonimo|modalità ufficiale manager"
```

Expected: FAIL because `FormationBuilder` has no mode and remains associated-user-only.

- [ ] **Step 4: Add the mode prop and mode-specific loading**

Replace `loadFormationContext` with:

```ts
async function loadFormationContext() {
  setLoading(true)
  try {
    if (mode === "PLAYGROUND") {
      setNextMatch(null)
      setPlayers(await fetchPublicFormationRoster(supabaseBrowser))
    } else {
      const match = await fetchNextChigiMatch(supabaseBrowser)
      setNextMatch(match)
      setPlayers(match ? await fetchRosterForEvent(supabaseBrowser, match.id) : [])
    }
    setLoadError(null)
  } catch (error) {
    setPlayers([])
    setLoadError(error instanceof Error ? error.message : "Rosa non disponibile")
  } finally {
    setLoading(false)
  }
}
```

Add a retry button that calls `loadFormationContext` when `loadError` is set.

- [ ] **Step 5: Gate private and official controls**

For `PLAYGROUND`:

- title is `Crea la tua formazione`;
- subtitle says it is a local playground;
- hide player private-detail dialogs;
- hide Excel distincta, WhatsApp match message, captain/vice controls, and
  publish action;
- retain module, shirt color, clear-field, PNG, and personal message.

For `OFFICIAL`:

- title is `Formazione ufficiale`;
- preserve all existing manager actions;
- keep the existing manager guard in addition to RPC/RLS protection.

Add keyboard-addressable names to empty mobile field slots:

```tsx
<button
  aria-label={`Seleziona giocatore per ${slot.id}`}
  className={emptySlotClassName}
  onClick={onMobileClick}
  type="button"
>
  {displayRole}
</button>
```

Do not retain the parent `div` click handler when this button is rendered.

- [ ] **Step 6: Add the personal copy action**

Build entries from `Object.entries(lineup)` and call
`buildPersonalFormationMessage(module, jerseyColor, entries)`. Use:

```ts
await navigator.clipboard.writeText(message)
toast.success("Formazione copiata")
```

Catch clipboard errors and show `toast.error("Impossibile copiare la formazione")`
without clearing `lineup`.

Render export actions with `role="menuitem"` through buttons inside the existing
popover so Playwright can address them accessibly.

Add `data-formation-builder-mode={mode}` to the builder root.

- [ ] **Step 7: Wire TeamPage launch modes**

Replace `builderOpen` with:

```ts
const [builderMode, setBuilderMode] =
  useState<FormationBuilderMode | null>(null)
```

- Neutral action sets `PLAYGROUND` for every visitor.
- Violet action sets `OFFICIAL` only when `isManager`.
- Render:

```tsx
{builderMode && (
  <FormationBuilder
    key={builderMode}
    mode={builderMode}
    onPublished={refreshNextMatch}
  />
)}
```

Remove the old large `Formazioni` banner and the `isAssociated` gate around
the builder.

- [ ] **Step 8: Run focused E2E and full checks**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "playground anonimo|modalità ufficiale manager"
npm test
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/formations/FormationBuilder.tsx src/app/squadra/page.tsx tests/e2e/app.spec.ts
git commit -m "feat: separate playground and official formation modes"
```

---

### Task 7: Tournament Selector

**Files:**
- Create: `src/components/tournament/TournamentSelector.tsx`
- Create: `src/components/tournament/TournamentSelector.test.tsx`
- Modify: `src/app/torneo/page.tsx`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces:

```ts
export type TournamentOption = {
  id: string
  label: string
}

export const TOURNAMENTS: readonly TournamentOption[] = [
  {
    id: "asi-over35-2025-2026",
    label: "Campionato ASI Over35 2025/2026",
  },
] as const

export function TournamentSelector({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}): React.JSX.Element
```

- [ ] **Step 1: Write a failing accessible selector test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  TournamentSelector,
  TOURNAMENTS,
} from "@/components/tournament/TournamentSelector"

describe("TournamentSelector", () => {
  it("exposes the tournament label and current competition", () => {
    const onValueChange = vi.fn()
    render(
      <TournamentSelector
        onValueChange={onValueChange}
        value={TOURNAMENTS[0].id}
      />,
    )
    expect(screen.getByText("Torneo")).toBeVisible()
    expect(
      screen.getByRole("combobox", {
        name: "Torneo",
      }),
    ).toHaveTextContent("Campionato ASI Over35 2025/2026")
    fireEvent.click(screen.getByRole("combobox", { name: "Torneo" }))
    expect(screen.getByRole("option", { name: TOURNAMENTS[0].label })).toBeVisible()
  })
})
```

- [ ] **Step 2: Run and observe RED**

Run:

```bash
npm test -- src/components/tournament/TournamentSelector.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled selector**

Use the existing shadcn `Select`, a visible `Label`, and a responsive trigger:

```tsx
<div className="min-w-0">
  <Label className="text-[10px] font-bold uppercase tracking-wider" htmlFor="tournament-selector">
    Torneo
  </Label>
  <Select onValueChange={onValueChange} value={value}>
    <SelectTrigger aria-label="Torneo" className="mt-1 w-full sm:w-[320px]" id="tournament-selector">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {TOURNAMENTS.map((tournament) => (
        <SelectItem key={tournament.id} value={tournament.id}>
          {tournament.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 4: Replace the fixed Torneo subtitle**

Add:

```ts
const [tournamentId, setTournamentId] = useState(TOURNAMENTS[0].id)
```

Render `TournamentSelector` in the title bar. Keep the phase selector separate.
Do not add filtering or schema behavior for the single current option.

- [ ] **Step 5: Verify component and E2E behavior**

In E2E, assert the fixed subtitle no longer exists as a paragraph and the
combobox has the expected value.

Run:

```bash
npm test -- src/components/tournament/TournamentSelector.test.tsx
npx playwright test tests/e2e/app.spec.ts --grep "selettore torneo"
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament src/app/torneo/page.tsx tests/e2e/app.spec.ts
git commit -m "feat: add tournament selector"
```

---

### Task 8: Integrated Regression and Responsive Verification

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: production files only if a test exposes a real defect

**Interfaces:**
- Consumes all prior task interfaces.
- Produces final acceptance evidence; no new public API.

- [ ] **Step 1: Add capsule transition coverage**

Use the manager account and seeded next match:

1. assert the capsule has `data-state="draft"`;
2. open official mode;
3. place at least one player;
4. publish;
5. wait for the capsule to refresh;
6. assert `data-state="published"`;
7. assert the capsule text includes `Pubblicata il`;
8. assert it links to the seeded event.

The test must use the real local Supabase RPC and must not mock publication.

- [ ] **Step 2: Add horizontal-overflow assertions**

For `/squadra` and `/torneo`, on both mobile and desktop:

```ts
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
expect(overflow).toBeLessThanOrEqual(1)
```

Also rerun `expectBottomNavClearance` and `expectSharedPageViewport`.

- [ ] **Step 3: Run the new tests and observe any RED results**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "capsula formazione|overflow orizzontale"
```

Expected before final fixes: any remaining responsive or refresh defect fails
with the affected route/state named.

- [ ] **Step 4: Enforce the integrated overflow and refresh contracts**

Whether or not Step 3 exposes a failure, verify these exact implementation
details and add any missing line:

```tsx
<div className="min-w-0 flex-1">
  <p className="truncate">{match.opponent}</p>
</div>
```

```ts
if (!error) {
  await onPublished?.()
}
```

The title block, capsule copy, and page action groups must all use `min-w-0`;
opponent and tournament labels must use `truncate`; mobile icon buttons must
keep their visible text `sr-only` while retaining `aria-label`. Do not change
accepted colors, grid breakpoints, copy, or permissions.

- [ ] **Step 5: Run the complete verification gate**

Run all commands fresh:

```bash
npm test
npm run test:import
npm run db:verify
npm run typecheck
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected:

- Vitest: zero failed files/tests;
- import tests: zero failures;
- schema verification: pass;
- TypeScript, ESLint, and build: exit 0;
- Playwright desktop/mobile: zero unexpected failures;
- `git diff --check`: no output and exit 0.

- [ ] **Step 6: Inspect the final diff against the specification**

Confirm line-by-line:

- public playground has no server write path;
- official publish actions are absent for anonymous/player sessions;
- draft/published capsule colors and timestamp match the spec;
- card name appears above surname;
- grid breakpoints are 2/3/4/6;
- Tournament is a selector;
- every application page uses the shared outer viewport;
- existing navbar/safe-area work remains intact.

- [ ] **Step 7: Commit final regression work**

```bash
git add \
  tests/e2e/app.spec.ts \
  src/components/formations/FormationBuilder.tsx \
  src/components/formations/NextMatchCapsule.tsx \
  src/components/team/TeamTitleBar.tsx \
  src/components/tournament/TournamentSelector.tsx \
  src/app/squadra/page.tsx \
  src/app/torneo/page.tsx
git commit -m "test: cover responsive team formation flows"
```
