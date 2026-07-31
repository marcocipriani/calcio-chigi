# Compact Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the monthly calendar compact and readable at 1440px and 390px, with fixed-height cells, blue match cards with opponent logos, orange training cards, and type-colored active filter pills.

**Architecture:** Keep all rendering local to the existing `Home` client component. Reuse `filteredEvents`, `getLogo`, current links, tooltips, month navigation, agenda, and list/calendar state. Limit each day to two rendered events and preserve the existing `+N` fallback. Add stable `data-calendar-*` attributes only to scope behavior tests and measure the rendered cells.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4, date-fns 4, Lucide, Vitest, Testing Library, Playwright, axe-core.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-31-calendar-density-design.md` exactly.
- No new dependency, component, query, API, state container, or shared abstraction.
- Preserve the current agenda structure, list view, event detail links, month navigation, `Oggi`, and realtime behavior.
- Violet remains exclusive to manager actions; the public calendar uses neutral, blue, and orange only.
- Match blue and training orange must remain understandable without color through logo/trophy, dumbbell, text, and accessible labels.
- Cancelled state overrides type color: neutral, attenuated, and struck through.
- Render at most two events per day on both layouts; unexpected extras use `+N`.
- Desktop calendar cells are exactly `112px`; mobile calendar cells are exactly `72px`.
- Desktop logos are `24px` with `object-contain`; mobile logos/icons are `16px`.
- Preserve all unrelated worktree material. The pre-existing semantic-color changes overlap `src/app/page.tsx` and `src/app/page.test.tsx`, so checkpoint them before calendar work.
- Keep local E2E serial and loopback-only. Do not broaden the targeted E2E run to unrelated flaky scenarios.

---

### Task 0: Checkpoint the pre-existing semantic-color work

**Files:**
- Existing: `src/app/evento/[id]/page.tsx`
- Existing: `src/app/globals.css`
- Existing: `src/app/page.test.tsx`
- Existing: `src/app/page.tsx`
- Existing: `src/app/statistiche/page.test.tsx`
- Existing: `src/app/statistiche/page.tsx`
- Existing: `src/app/torneo/page.tsx`
- Existing: `src/components/BottomNav.test.tsx`
- Existing: `src/components/BottomNav.tsx`
- Existing: `src/components/tournament/TournamentSelector.test.tsx`
- Existing: `src/components/tournament/TournamentSelector.tsx`
- Existing: `src/components/ui/tabs.tsx`

**Interfaces:**
- Produces a clean baseline where violet is reserved for manager controls.
- Does not change implementation; it records the already verified work separately from the calendar redesign.

- [ ] **Step 1: Verify the checkpoint scope**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: exactly the twelve files listed above are modified, this plan is the
only untracked file, and `git diff --check` prints nothing.

- [ ] **Step 2: Re-run the focused semantic-color tests**

Run:

```bash
npm test -- src/app/page.test.tsx src/app/statistiche/page.test.tsx src/components/BottomNav.test.tsx src/components/tournament/TournamentSelector.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Stage only the known semantic-color files**

Run:

```bash
git add 'src/app/evento/[id]/page.tsx' src/app/globals.css src/app/page.test.tsx src/app/page.tsx src/app/statistiche/page.test.tsx src/app/statistiche/page.tsx src/app/torneo/page.tsx src/components/BottomNav.test.tsx src/components/BottomNav.tsx src/components/tournament/TournamentSelector.test.tsx src/components/tournament/TournamentSelector.tsx src/components/ui/tabs.tsx
git diff --cached --name-only
```

Expected: the staged list matches the twelve files in this task and does not include this plan or any other user material.

- [ ] **Step 4: Commit the checkpoint**

Run:

```bash
git commit -m "fix: reserve violet for manager controls"
```

Expected: one commit containing only the semantic-color work.

- [ ] **Step 5: Version the approved implementation plan separately**

Run:

```bash
git add docs/superpowers/plans/2026-07-31-calendar-density.md
git commit -m "docs: plan compact calendar implementation"
```

Expected: the plan is tracked in its own documentation commit before code work begins.

---

### Task 1: Apply semantic colors to the calendar filters

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- `Tutti` active remains neutral.
- `Partite` active exposes `aria-pressed="true"` and a blue filled style.
- `Allenamenti` active exposes `aria-pressed="true"` and an orange filled style.
- The list/calendar toggle remains neutral.

- [ ] **Step 1: Change the existing filter test to the approved contract**

In `src/app/page.test.tsx`, rename the existing test to `reserves violet for the
manager action and uses calendar semantic colors`, then replace its filter
assertions after the icon checks with:

```tsx
const all = screen.getByRole("button", { name: "Tutti" })
const matches = screen.getByRole("button", { name: "Partite" })
const trainings = screen.getByRole("button", { name: "Allenamenti" })

expect(all).toHaveClass("bg-foreground", "text-background")

fireEvent.click(matches)
expect(matches).toHaveAttribute("aria-pressed", "true")
expect(matches).toHaveClass("bg-blue-600", "text-white")
expect(matches).not.toHaveClass("bg-violet-600", "text-violet-700")

fireEvent.click(trainings)
expect(trainings).toHaveAttribute("aria-pressed", "true")
expect(trainings).toHaveClass("bg-orange-500", "text-white")
expect(trainings).not.toHaveClass("bg-violet-600", "text-violet-700")

fireEvent.click(all)
expect(all).toHaveAttribute("aria-pressed", "true")
expect(all).toHaveClass("bg-foreground", "text-background")

expect(screen.getByRole("button", { name: "Vista lista" })).toHaveClass(
  "bg-foreground",
  "text-background",
)
```

Remove the superseded assertion that expects `Partite` to use `bg-foreground`.

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: FAIL because `Partite` and `Allenamenti` still use the neutral active classes.

- [ ] **Step 3: Implement the two active type styles**

In `src/app/page.tsx`, keep inactive pills unchanged and replace only the active branches:

```tsx
${filter === 'PARTITA'
    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
}
```

```tsx
${filter === 'ALLENAMENTO'
    ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-400'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
}
```

Do not change the active branch for `Tutti` or either list/calendar button.

- [ ] **Step 4: Run the focused test and verify green**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the filter behavior**

Run:

```bash
git add src/app/page.test.tsx src/app/page.tsx
git commit -m "fix: color calendar type filters"
```

---

### Task 2: Render the compact mobile calendar

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Mobile layout root: `data-calendar-layout="mobile"`.
- Day cell: `data-calendar-date="yyyy-MM-dd"`, fixed `h-[72px]`.
- Event link: `data-calendar-event`, `data-event-type="PARTITA|ALLENAMENTO"`.
- Accessible label: `Annullato: ` prefix when needed, then type, opponent for a match, full date, and time.
- Maximum two visible events plus the existing `+N` fallback.

- [ ] **Step 1: Make the API mocks configurable and add calendar fixtures**

In `src/app/page.test.tsx`, add imports:

```tsx
import { format } from "date-fns"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Event } from "@/lib/types"
```

Replace the current hoisted mock declaration and `@/lib/api` mock with:

```tsx
const {
  fetchCalendarEvents,
  fetchTeams,
  getUserContext,
  removeChannel,
} = vi.hoisted(() => ({
  fetchCalendarEvents: vi.fn(),
  fetchTeams: vi.fn(),
  getUserContext: vi.fn(),
  removeChannel: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  fetchCalendarEvents,
  fetchTeams,
  getUserContext,
}))
```

Add this setup and fixture code before the `describe` block:

```tsx
beforeEach(() => {
  fetchCalendarEvents.mockReset().mockResolvedValue([])
  fetchTeams.mockReset().mockResolvedValue([])
  getUserContext.mockReset().mockResolvedValue({
    isManager: true,
    defaultView: "ACTIVITY",
  })
  removeChannel.mockClear()
})

function dateInCurrentMonth(day: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(day)
  date.setHours(hour, minute, 0, 0)
  return date
}

function calendarEvent(
  values: Pick<Event, "id" | "tipo" | "data_ora"> & Partial<Event>,
): Event {
  return {
    created_at: "2026-07-31T00:00:00.000Z",
    season_id: "season-calendar-test",
    luogo: "Campo Circolo Chigi",
    giocata: false,
    cancellato: false,
    ...values,
  }
}

function seedCalendarFixtures() {
  const dates = {
    empty: dateInCurrentMonth(9, 12),
    single: dateInCurrentMonth(10, 20, 30),
    double: dateInCurrentMonth(11, 19),
    overflow: dateInCurrentMonth(12, 18),
    cancelled: dateInCurrentMonth(13, 18),
  }

  fetchCalendarEvents.mockResolvedValue([
    calendarEvent({
      id: "match-logo",
      tipo: "PARTITA",
      data_ora: dates.single.toISOString(),
      avversario: "PSICOLOGOL",
      luogo: "Vigor Perconti",
    }),
    calendarEvent({
      id: "match-fallback",
      tipo: "PARTITA",
      data_ora: dates.double.toISOString(),
      avversario: "Associazione Sportiva Avversaria dal Nome Molto Lungo",
    }),
    calendarEvent({
      id: "training-double",
      tipo: "ALLENAMENTO",
      data_ora: dateInCurrentMonth(11, 21).toISOString(),
    }),
    calendarEvent({
      id: "overflow-one",
      tipo: "ALLENAMENTO",
      data_ora: dates.overflow.toISOString(),
    }),
    calendarEvent({
      id: "overflow-two",
      tipo: "PARTITA",
      data_ora: dateInCurrentMonth(12, 19).toISOString(),
      avversario: "Veterinari",
    }),
    calendarEvent({
      id: "overflow-three",
      tipo: "ALLENAMENTO",
      data_ora: dateInCurrentMonth(12, 20).toISOString(),
    }),
    calendarEvent({
      id: "cancelled-training",
      tipo: "ALLENAMENTO",
      data_ora: dates.cancelled.toISOString(),
      cancellato: true,
    }),
  ])
  fetchTeams.mockResolvedValue([
    {
      id: "team-psicologol",
      nome: "PSICOLOGOL",
      logo_url: "/teams/psicologi.png",
    },
  ])
  getUserContext.mockResolvedValue({
    isManager: true,
    defaultView: "CALENDAR",
  })

  return dates
}
```

- [ ] **Step 2: Add the failing mobile behavior test**

Inside the existing `describe`, add:

```tsx
it("renders zero, one, two, overflow, logo, fallback, and cancelled states on mobile", async () => {
  const dates = seedCalendarFixtures()
  const { container } = render(<Home />)

  await screen.findAllByRole("link", {
    name: /Partita contro PSICOLOGOL, .*20:30/i,
  })

  const mobile = container.querySelector<HTMLElement>(
    '[data-calendar-layout="mobile"]',
  )
  expect(mobile).not.toBeNull()

  const cell = (date: Date) =>
    mobile!.querySelector<HTMLElement>(
      `[data-calendar-date="${format(date, "yyyy-MM-dd")}"]`,
    )!

  expect(cell(dates.empty).querySelectorAll("[data-calendar-event]")).toHaveLength(0)
  expect(cell(dates.single).querySelectorAll("[data-calendar-event]")).toHaveLength(1)
  const doubleEvents = cell(dates.double).querySelectorAll("[data-calendar-event]")
  expect(doubleEvents).toHaveLength(2)
  expect(doubleEvents[0].parentElement).toHaveClass(
    "flex",
    "justify-center",
    "gap-0.5",
  )
  expect(doubleEvents[0]).toHaveClass("w-5")
  expect(doubleEvents[1]).toHaveClass("w-5")
  expect(cell(dates.overflow).querySelectorAll("[data-calendar-event]")).toHaveLength(2)
  expect(cell(dates.overflow)).toHaveTextContent("+1")

  const logoMatch = mobile!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/match-logo"]',
  )!
  expect(logoMatch).toHaveClass("bg-blue-50")
  expect(logoMatch.querySelector("img")).toHaveAttribute("alt", "")
  expect(logoMatch.querySelector("img")).toHaveClass("size-4", "object-contain")

  const fallbackMatch = mobile!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/match-fallback"]',
  )!
  expect(fallbackMatch.querySelector("img")).toBeNull()
  expect(fallbackMatch.querySelector("svg")).not.toBeNull()

  const training = mobile!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/training-double"]',
  )!
  expect(training).toHaveClass("bg-orange-50")
  expect(training).toHaveAttribute("data-event-type", "ALLENAMENTO")

  const cancelled = mobile!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/cancelled-training"]',
  )!
  expect(cancelled).toHaveClass("bg-muted", "line-through")
  expect(cancelled).not.toHaveClass("bg-orange-50", "bg-blue-50")
  expect(cancelled).toHaveAccessibleName(/Annullato: Allenamento, .*18:00/i)
})
```

- [ ] **Step 3: Run the mobile test and verify the red state**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: FAIL because the mobile renderer has no layout/date markers, uses `min-h-[80px]`, renders all events, and does not expose the complete link label.

- [ ] **Step 4: Limit daily events and expose the mobile layout contract**

In `renderCalendar`, replace the day-event calculation with:

```tsx
const allDayEvents = filteredEvents.filter(
  (event) => event.data_ora && isSameDay(new Date(event.data_ora), day),
)
const dayEvents = allDayEvents.slice(0, 2)
const remaining = allDayEvents.length - dayEvents.length
```

Add `data-calendar-layout="mobile"` to the outer animated container. Use this
opening tag for every day cell:

```tsx
<div
  key={i}
  data-calendar-date={format(day, 'yyyy-MM-dd')}
  className={`flex h-[72px] flex-col items-center justify-start overflow-hidden rounded-xl border px-0.5 pt-1 transition-colors
    ${isCurrentMonth ? 'bg-card' : 'bg-muted/20 opacity-50'}
    ${isDayToday ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'}
  `}
>
```

Use `text-[10px] leading-none` for the date and reduce its bottom spacing to `mb-0.5`.

- [ ] **Step 5: Replace each mobile event circle with the approved micro-card**

For each visible event, compute:

```tsx
const isMatch = evt.tipo === 'PARTITA'
const isCancelled = evt.cancellato
const opponentLogo = isMatch ? getLogo(evt.avversario) : null
const accessibleLabel = `${isCancelled ? 'Annullato: ' : ''}${
  isMatch ? `Partita contro ${evt.avversario ?? 'avversario'}` : 'Allenamento'
}, ${format(new Date(evt.data_ora!), 'd MMMM yyyy, HH:mm', { locale: it })}`
```

Keep the current tooltip wrapper, but make its trigger this link:

```tsx
<Link
  href={`/evento/${evt.id}`}
  aria-label={accessibleLabel}
  data-calendar-event
  data-event-type={evt.tipo}
  className={`flex h-7 w-5 shrink-0 flex-col items-center justify-center gap-0.5 rounded border transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    isCancelled
      ? 'border-border bg-muted text-muted-foreground line-through opacity-70'
      : isMatch
        ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
        : 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200'
  }`}
>
  {isCancelled ? (
    <X className="size-4" aria-hidden="true" />
  ) : isMatch ? (
    opponentLogo ? (
      <Image
        src={opponentLogo}
        alt=""
        width={16}
        height={16}
        className="size-4 object-contain"
      />
    ) : (
      <Trophy className="size-4 text-blue-600" aria-hidden="true" />
    )
  ) : (
    <Dumbbell className="size-4" aria-hidden="true" />
  )}
  <span className="text-[7px] font-black leading-none">
    {format(new Date(evt.data_ora!), 'HH:mm')}
  </span>
</Link>
```

The event container must be:

```tsx
<div className="flex w-full justify-center gap-0.5 px-0.5">
```

After that container, add the fallback:

```tsx
{remaining > 0 && (
  <span className="mt-0.5 text-[7px] font-black leading-none text-muted-foreground">
    +{remaining}
  </span>
)}
```

- [ ] **Step 6: Run the focused test and verify green**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: PASS, including zero/one/two/overflow, logo/fallback, cancellation, and accessible-label assertions.

- [ ] **Step 7: Commit the mobile calendar**

Run:

```bash
git add src/app/page.test.tsx src/app/page.tsx
git commit -m "feat: compact mobile calendar cells"
```

---

### Task 3: Render detailed compact desktop cards

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Desktop month grid: `data-calendar-layout="desktop"`.
- Day cell: `data-calendar-date="yyyy-MM-dd"`, fixed `h-[112px]`.
- Match card: blue, 24px opponent logo or trophy fallback, opponent on line one, time and place on line two.
- Training card: orange, dumbbell, `Allenamento` on line one, time and place on line two.
- Maximum two visible events plus `+N`.
- Agenda match dot is blue and training dot is orange.

- [ ] **Step 1: Add the failing desktop behavior test**

Inside `src/app/page.test.tsx`, add:

```tsx
it("renders compact detailed match and training cards on desktop", async () => {
  const dates = seedCalendarFixtures()
  const { container } = render(<Home />)

  await screen.findAllByRole("link", {
    name: /Partita contro PSICOLOGOL, .*20:30/i,
  })

  const desktop = container.querySelector<HTMLElement>(
    '[data-calendar-layout="desktop"]',
  )
  expect(desktop).not.toBeNull()

  const cell = (date: Date) =>
    desktop!.querySelector<HTMLElement>(
      `[data-calendar-date="${format(date, "yyyy-MM-dd")}"]`,
    )!

  expect(cell(dates.empty).querySelectorAll("[data-calendar-event]")).toHaveLength(0)
  expect(cell(dates.single).querySelectorAll("[data-calendar-event]")).toHaveLength(1)
  expect(cell(dates.double).querySelectorAll("[data-calendar-event]")).toHaveLength(2)
  expect(cell(dates.overflow).querySelectorAll("[data-calendar-event]")).toHaveLength(2)
  expect(cell(dates.overflow)).toHaveTextContent("+1 altro")
  expect(cell(dates.single)).toHaveClass("h-[112px]", "overflow-hidden")

  const logoMatch = desktop!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/match-logo"]',
  )!
  expect(logoMatch).toHaveClass("bg-blue-50")
  expect(logoMatch).toHaveTextContent("PSICOLOGOL")
  expect(logoMatch).toHaveTextContent("20:30 · Vigor Perconti")
  expect(logoMatch.querySelector("img")).toHaveClass("size-6", "object-contain")
  expect(logoMatch.querySelector("img")).toHaveAttribute("alt", "")

  const longNameMatch = desktop!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/match-fallback"]',
  )!
  expect(longNameMatch.querySelector("img")).toBeNull()
  expect(longNameMatch.querySelector("svg")).not.toBeNull()
  expect(longNameMatch.querySelector(".truncate")).toHaveTextContent(
    "Associazione Sportiva Avversaria dal Nome Molto Lungo",
  )

  const training = desktop!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/training-double"]',
  )!
  expect(training).toHaveClass("bg-orange-50")
  expect(training).toHaveTextContent("Allenamento")
  expect(training).toHaveTextContent("21:00 · Campo Circolo Chigi")

  const cancelled = desktop!.querySelector<HTMLAnchorElement>(
    'a[href="/evento/cancelled-training"]',
  )!
  expect(cancelled).toHaveClass("bg-muted", "line-through")
  expect(cancelled).not.toHaveClass("bg-orange-50", "bg-blue-50")
})
```

- [ ] **Step 2: Run the desktop test and verify the red state**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: FAIL because desktop still uses `min-h-32`, slices three events, has no opponent image, and presents a single-line amber training card.

- [ ] **Step 3: Limit events and fix the desktop cell geometry**

On the desktop month grid, add:

```tsx
data-calendar-layout="desktop"
```

Replace the duplicate filtering with:

```tsx
const allDayEvents = filteredEvents.filter(
  (event) => event.data_ora && isSameDay(new Date(event.data_ora), day),
)
const dayEvents = allDayEvents.slice(0, 2)
const remaining = allDayEvents.length - dayEvents.length
```

Use this opening tag for each desktop day cell:

```tsx
<div
  key={day.toISOString()}
  data-calendar-date={format(day, 'yyyy-MM-dd')}
  className={`h-[112px] overflow-hidden border-b border-r p-1.5 transition-colors last:border-r-0 ${
    inMonth ? 'bg-card' : 'bg-muted/15 text-muted-foreground'
  } ${today ? 'bg-primary/[0.045] shadow-[inset_0_3px_0_hsl(var(--primary))]' : ''}`}
>
```

Replace the date header with:

```tsx
<div className="mb-0.5 flex items-center justify-between">
  <span
    className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-black ${
      today ? 'bg-primary text-primary-foreground' : ''
    }`}
    aria-current={today ? 'date' : undefined}
  >
    {format(day, 'd')}
  </span>
</div>
```

- [ ] **Step 4: Replace the desktop event row with a two-line semantic card**

Inside the desktop event map compute:

```tsx
const isMatch = event.tipo === 'PARTITA'
const opponentLogo = isMatch ? getLogo(event.avversario) : null
const accessibleLabel = `${event.cancellato ? 'Annullato: ' : ''}${
  isMatch ? `Partita contro ${event.avversario ?? 'avversario'}` : 'Allenamento'
}, ${format(new Date(event.data_ora!), 'd MMMM yyyy, HH:mm', { locale: it })}`
```

Use this link structure:

```tsx
<Link
  key={event.id}
  href={`/evento/${event.id}`}
  aria-label={accessibleLabel}
  data-calendar-event
  data-event-type={event.tipo}
  className={`group grid h-[30px] min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 rounded-md border px-1.5 py-0.5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    event.cancellato
      ? 'border-border bg-muted text-muted-foreground line-through opacity-70'
      : isMatch
        ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
        : 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200'
  }`}
>
  <span className="grid size-6 place-items-center overflow-hidden rounded bg-white/75 dark:bg-black/15">
    {isMatch ? (
      opponentLogo ? (
        <Image
          src={opponentLogo}
          alt=""
          width={24}
          height={24}
          className="size-6 object-contain"
        />
      ) : (
        <Trophy className="size-4 text-blue-600" aria-hidden="true" />
      )
    ) : (
      <Dumbbell className="size-4 text-orange-600" aria-hidden="true" />
    )}
  </span>
  <span className="min-w-0">
    <span className="block truncate text-[10px] font-black leading-tight">
      {isMatch ? event.avversario || 'Avversario da definire' : 'Allenamento'}
    </span>
    <span className="block truncate text-[9px] font-semibold leading-tight opacity-75">
      {format(new Date(event.data_ora!), 'HH:mm')} · {event.luogo || 'Luogo da definire'}
    </span>
  </span>
</Link>
```

Use `space-y-0.5` for the event stack. Render the overflow label with:

```tsx
{remaining > 0 && (
  <span className="block px-1 pt-0.5 text-[8px] font-bold leading-none text-muted-foreground">
    +{remaining} {remaining === 1 ? 'altro' : 'altri'}
  </span>
)}
```

This keeps two `30px` cards and the overflow label inside the fixed `112px`
cell.

- [ ] **Step 5: Align the agenda training indicator**

Replace the agenda dot expression with:

```tsx
<span
  className={`h-2.5 w-2.5 rounded-full ${isMatch ? 'bg-blue-500' : 'bg-orange-500'}`}
  aria-hidden="true"
/>
```

- [ ] **Step 6: Run the focused test and verify green**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the desktop calendar**

Run:

```bash
git add src/app/page.test.tsx src/app/page.tsx
git commit -m "feat: add detailed desktop calendar cards"
```

---

### Task 4: Prove the responsive calendar in the browser

**Files:**
- Modify: `tests/e2e/global-setup.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Seeded `PSICOLOGOL` team has `/teams/psicologi.png` as `logo_url`.
- Desktop project verifies 1440px, `112px` cell height, logo, content, light/dark, no overflow, and accessibility.
- Mobile project verifies 390px, `72px` cell height, visible micro-card, light/dark, no overflow, and accessibility.

- [ ] **Step 1: Extend the desktop E2E test before changing the seed**

Replace the existing `calendario pubblico desktop esteso` test body after `page.goto("/")` with:

```tsx
await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible()
await expect(page.getByText("Vista mensile")).toBeVisible()
await expect(page.getByRole("heading", { name: "Prossimi impegni" })).toBeVisible()

const calendar = page.locator('[data-calendar-layout="desktop"]')
const match = calendar.getByRole("link", {
  name: /Partita contro PSICOLOGOL, 30 luglio 2026, 21:15/i,
})
await expect(match).toBeVisible()
await expect(match).toHaveClass(/bg-blue-50/)
await expect(match).toContainText("PSICOLOGOL")
await expect(match).toContainText("21:15 · Vigor Perconti")
await expect(match.locator("img")).toBeVisible()
await expect(match.locator("img")).toHaveClass(/object-contain/)

const today = calendar.locator('[data-calendar-date="2026-07-31"]')
await expect(today.locator('[aria-current="date"]')).toBeVisible()
await expect(
  calendar.locator('[data-calendar-date="2026-06-29"]'),
).toHaveClass(/bg-muted\/15/)

const cell = match.locator("xpath=ancestor::*[@data-calendar-date][1]")
const box = await cell.boundingBox()
expect(box?.height).toBeCloseTo(112, 0)

await expectNoHorizontalOverflow(page)
await expectNoSeriousA11yViolations(page)

await page.getByRole("button", { name: "Cambia tema" }).click()
await expect(page.locator("html")).toHaveClass(/dark/)
await expect(match).toBeVisible()
await expectNoHorizontalOverflow(page)
await expectNoSeriousA11yViolations(page)
```

- [ ] **Step 2: Add the mobile E2E test**

Add after the desktop calendar test:

```tsx
test("calendario mensile compatto mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.goto("/")
  await expect(page.getByRole("tab", { name: "Prossimi" })).toBeVisible()
  await page.getByRole("button", { name: "Vista calendario" }).click()

  const calendar = page.locator('[data-calendar-layout="mobile"]')
  const match = calendar.getByRole("link", {
    name: /Partita contro PSICOLOGOL, 30 luglio 2026, 21:15/i,
  })
  await expect(match).toBeVisible()
  await expect(match).toHaveClass(/bg-blue-50/)
  await expect(match.locator("img")).toBeVisible()
  await expect(match.locator("img")).toHaveClass(/object-contain/)

  await expect(
    calendar.locator('[data-calendar-date="2026-07-31"]'),
  ).toHaveClass(/border-primary/)
  await expect(
    calendar.locator('[data-calendar-date="2026-06-29"]'),
  ).toHaveClass(/opacity-50/)

  const cell = match.locator("xpath=ancestor::*[@data-calendar-date][1]")
  const box = await cell.boundingBox()
  expect(box?.height).toBeCloseTo(72, 0)

  await expectNoHorizontalOverflow(page)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Cambia tema" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(match).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousA11yViolations(page)
})
```

- [ ] **Step 3: Run the targeted browser tests and verify the red state**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "calendario pubblico desktop esteso|calendario mensile compatto mobile"
```

Expected: FAIL at `match.locator("img")` because the current E2E team seed has no `logo_url`.

- [ ] **Step 4: Give the seeded opponent its real local logo**

In both branches of the `seededTeam` conditional in `tests/e2e/global-setup.ts`, set:

```tsx
logo_url: "/teams/psicologi.png"
```

The update branch must become:

```tsx
.update({ nome: "PSICOLOGOL", logo_url: "/teams/psicologi.png" })
```

The insert branch must become:

```tsx
.insert({
  nome: "PSICOLOGOL",
  slug: "psicologol",
  logo_url: "/teams/psicologi.png",
})
```

- [ ] **Step 5: Run the targeted browser tests and verify green**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "calendario pubblico desktop esteso|calendario mensile compatto mobile"
```

Expected: two PASS results and the opposite-project skips; both viewport projects remain serial.

- [ ] **Step 6: Commit the browser acceptance proof**

Run:

```bash
git add tests/e2e/global-setup.ts tests/e2e/app.spec.ts
git commit -m "test: cover compact calendar layouts"
```

---

### Task 5: Final regression and scope verification

**Files:**
- Verify: `src/app/page.tsx`
- Verify: `src/app/page.test.tsx`
- Verify: `tests/e2e/global-setup.ts`
- Verify: `tests/e2e/app.spec.ts`
- Verify: `docs/superpowers/specs/2026-07-31-calendar-density-design.md`

**Interfaces:**
- Confirms the implementation matches the approved design and does not modify list behavior, data access, or manager color semantics.

- [ ] **Step 1: Run the complete local code gates**

Run, one command at a time:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all four commands PASS.

- [ ] **Step 2: Re-run the calendar browser acceptance**

Run:

```bash
npx playwright test tests/e2e/app.spec.ts --grep "calendario pubblico desktop esteso|calendario mensile compatto mobile"
```

Expected: desktop 1440px and mobile 390px calendar tests PASS in light and dark mode, without horizontal overflow or serious accessibility violations.

- [ ] **Step 3: Check the exact visual and functional contract**

Inspect `src/app/page.tsx` and confirm all of these are true:

```text
mobile cell: h-[72px]
desktop cell: h-[112px]
daily slice: slice(0, 2) in both renderers
match active pill: bg-blue-600
training active pill: bg-orange-500
desktop match logo: size-6 object-contain
mobile match logo: size-4 object-contain
training calendar cards and agenda dot: orange, never amber
cancelled cards: neutral and line-through
list/calendar toggle: neutral
manager add action: violet
```

- [ ] **Step 4: Scan for accidental scope expansion and unfinished markers**

Run:

```bash
git diff 5a5b4cc --stat
git diff 5a5b4cc -- src/lib src/components/EventCard.tsx src/components/EventDialog.tsx
rg -n "TO[D]O|TB[D]|FIXM[E]" src/app/page.tsx src/app/page.test.tsx tests/e2e/global-setup.ts tests/e2e/app.spec.ts
git diff --check
```

Expected:

- no changes under `src/lib`, `EventCard`, or `EventDialog`;
- no new unfinished markers in the implementation files;
- no whitespace errors;
- only the approved calendar files plus the separately checkpointed semantic-color files differ from `5a5b4cc`.

- [ ] **Step 5: Review commit boundaries and worktree state**

Run:

```bash
git log --oneline -6
git status --short
```

Expected: separate commits for the semantic-color checkpoint, filters, mobile calendar, desktop calendar, and browser acceptance. The worktree is clean except for user-owned material that was present before execution and intentionally left untouched.
