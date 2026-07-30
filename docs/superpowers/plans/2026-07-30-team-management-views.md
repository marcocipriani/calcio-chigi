# Team Management Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate management navigation with configurable operational tables, add attendance and passport-photo workflows, split confirmed/maybe players on Squadra, and merge manager presence with the management header action.

**Architecture:** Keep the existing Next.js client dashboard and Supabase data model. Add one self-scoped preference table, two pure TypeScript modules for column state and attendance aggregation, then adapt existing components around those interfaces. Load attendance and signed photo URLs only for their active tabs.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Supabase JS 2, PostgreSQL/RLS, Tailwind CSS 4, Radix UI, Lucide, Vitest, Testing Library, pgTAP.

## Global Constraints

- No new npm dependency.
- `Persone` is the default view.
- Single tab order: `Persone`, `Presenze`, `Quote`, `Tesseramenti`, `Certificati`, `Account`.
- Column visibility and order persist; active filters and sorting do not.
- Attendance percentages for training and matches stay separate.
- Attendance excludes events before `joined_on`; missing check-ins do not enter the denominator.
- Passport photos remain in the private `passport-photos` bucket.
- `is_staff` remains a roster category; `is_manager` remains authorization.
- `public_active_roster` remains the source for `/squadra`.
- Desktop-first advanced tables; mobile remains readable and compact.

---

### Task 1: Self-scoped UI preferences

**Files:**
- Create: `supabase/migrations/20260730010000_profile_ui_preferences.sql`
- Create: `tests/db/profile-ui-preferences.test.sql`
- Modify: `scripts/build-schema-snapshot.mjs`
- Modify: `scripts/verify-schema.mjs`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `public.profile_ui_preferences(profile_id uuid, management_columns jsonb, updated_at timestamptz)`.
- Security contract: authenticated users can select, insert, and update only the row where `profile_id = public.current_profile_id()`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `tests/db/profile-ui-preferences.test.sql`:

```sql
begin;

select plan(7);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000091', 'prefs-one@test.local', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-000000000092', 'prefs-two@test.local', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (id, user_id, nome, cognome, is_manager)
values
  ('10000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000091', 'Uno', 'Manager', true),
  ('10000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000092', 'Due', 'Manager', true);

select has_table('public', 'profile_ui_preferences');
select has_column('public', 'profile_ui_preferences', 'management_columns');
select ok(
  has_table_privilege('authenticated', 'public.profile_ui_preferences', 'SELECT'),
  'authenticated can select preferences'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true);

select lives_ok(
  $$insert into public.profile_ui_preferences (profile_id, management_columns)
    values (
      '10000000-0000-0000-0000-000000000091',
      '{"PEOPLE":["person","confirmation"]}'::jsonb
    )$$,
  'profile can create own preferences'
);
select results_eq(
  $$select management_columns
      from public.profile_ui_preferences
     where profile_id = '10000000-0000-0000-0000-000000000091'$$,
  $$values ('{"PEOPLE":["person","confirmation"]}'::jsonb)$$,
  'profile reads own preferences'
);
select throws_ok(
  $$insert into public.profile_ui_preferences (profile_id)
    values ('10000000-0000-0000-0000-000000000092')$$,
  '42501',
  'new row violates row-level security policy for table "profile_ui_preferences"',
  'profile cannot create another profile preferences'
);
select results_eq(
  $$select count(*)::bigint
      from public.profile_ui_preferences
     where profile_id = '10000000-0000-0000-0000-000000000092'$$,
  array[0::bigint],
  'profile cannot read another profile preferences'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run the new DB test and verify failure**

Run: `npx supabase test db tests/db/profile-ui-preferences.test.sql`

Expected: FAIL because `public.profile_ui_preferences` does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260730010000_profile_ui_preferences.sql`:

```sql
begin;

create table public.profile_ui_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  management_columns jsonb not null default '{}'::jsonb
    check (jsonb_typeof(management_columns) = 'object'),
  updated_at timestamptz not null default now()
);

create trigger trg_touch_updated_at
before update on public.profile_ui_preferences
for each row execute function public.touch_updated_at();

alter table public.profile_ui_preferences enable row level security;

revoke all on public.profile_ui_preferences from public, anon, authenticated;
grant select, insert, update on public.profile_ui_preferences to authenticated;
grant all privileges on public.profile_ui_preferences to service_role;

create policy profile_ui_preferences_self_select
on public.profile_ui_preferences for select to authenticated
using (profile_id = public.current_profile_id());

create policy profile_ui_preferences_self_insert
on public.profile_ui_preferences for insert to authenticated
with check (profile_id = public.current_profile_id());

create policy profile_ui_preferences_self_update
on public.profile_ui_preferences for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

commit;
```

- [ ] **Step 4: Wire schema generation and verification**

Append the migration path to `migrationPaths` in `scripts/build-schema-snapshot.mjs`:

```js
"supabase/migrations/20260730010000_profile_ui_preferences.sql",
```

In `scripts/verify-schema.mjs`, read the new migration as `profilePreferencesMigration` and add:

```js
assert.match(
  profilePreferencesMigration,
  /create table public\.profile_ui_preferences\b/i,
)
assert.match(
  schema,
  /create table public\.profile_ui_preferences\b/i,
  "schema snapshot missing profile UI preferences",
)
assert.match(
  profilePreferencesMigration,
  /profile_id = public\.current_profile_id\(\)/i,
  "profile UI preferences must remain self-scoped",
)
```

Run: `npm run db:snapshot`

Expected: `supabase/schema.sql` contains source block for the new migration.

- [ ] **Step 5: Run DB and schema checks**

Run:

```bash
npx supabase test db tests/db/profile-ui-preferences.test.sql
npm run db:verify
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260730010000_profile_ui_preferences.sql tests/db/profile-ui-preferences.test.sql scripts/build-schema-snapshot.mjs scripts/verify-schema.mjs supabase/schema.sql
git commit -m "feat: persist management column preferences"
```

---

### Task 2: Pure column-state and attendance models

**Files:**
- Create: `src/lib/management-columns.ts`
- Create: `src/lib/management-columns.test.ts`
- Create: `src/lib/management-attendance.ts`
- Create: `src/lib/management-attendance.test.ts`
- Modify: `src/lib/management.ts`
- Modify: `src/lib/management.test.ts`

**Interfaces:**
- Produces: `ManagementView`, `ColumnPreferences`, `DEFAULT_COLUMNS`, `normalizeColumnPreferences()`, `moveColumn()`, `applyTableState()`.
- Produces: `AttendanceEvent`, `AttendanceCheckin`, `AttendanceSummary`, `aggregateManagementAttendance()`.
- Changes: `ManagementPerson` gains optional `attendance`.

- [ ] **Step 1: Write failing column-state tests**

Create `src/lib/management-columns.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  DEFAULT_COLUMNS,
  applyTableState,
  moveColumn,
  normalizeColumnPreferences,
} from "@/lib/management-columns"

describe("management columns", () => {
  it("drops unknown and duplicate columns while preserving hidden columns", () => {
    expect(
      normalizeColumnPreferences({
        PEOPLE: ["phone", "removed", "phone", "person"],
      }).PEOPLE,
    ).toEqual(["phone", "person"])
  })

  it("falls back for missing or wholly invalid view settings", () => {
    const first = normalizeColumnPreferences(null)
    first.PEOPLE.pop()
    expect(normalizeColumnPreferences(null).PEOPLE).toEqual(
      DEFAULT_COLUMNS.PEOPLE,
    )
    expect(
      normalizeColumnPreferences({ PEOPLE: ["removed"] }).PEOPLE,
    ).toEqual(DEFAULT_COLUMNS.PEOPLE)
  })

  it("moves a visible column one position", () => {
    expect(moveColumn(["person", "phone", "account"], "phone", -1)).toEqual([
      "phone",
      "person",
      "account",
    ])
  })

  it("filters and sorts through declared accessors", () => {
    const rows = [
      { name: "Luca", status: "YES" },
      { name: "Anna", status: "MAYBE" },
    ]
    expect(
      applyTableState(
        rows,
        {
          name: {
            filterValue: (row) => row.name,
            sortValue: (row) => row.name,
          },
          status: {
            filterValue: (row) => row.status,
            sortValue: (row) => row.status,
          },
        },
        { status: "maybe" },
        { columnId: "name", direction: "asc" },
      ),
    ).toEqual([{ name: "Anna", status: "MAYBE" }])
  })
})
```

- [ ] **Step 2: Write failing attendance tests**

Create `src/lib/management-attendance.test.ts` with fixed event dates:

```ts
import { describe, expect, it } from "vitest"

import { aggregateManagementAttendance } from "@/lib/management-attendance"

describe("aggregateManagementAttendance", () => {
  it("separates training and matches, ignores missing checkins and pre-join events", () => {
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: "2026-07-08" }],
      [
        { id: "old", type: "ALLENAMENTO", startsAt: "2026-07-01T18:00:00Z" },
        { id: "t1", type: "ALLENAMENTO", startsAt: "2026-07-10T18:00:00Z" },
        { id: "t2", type: "ALLENAMENTO", startsAt: "2026-07-13T18:00:00Z" },
        { id: "m1", type: "PARTITA", startsAt: "2026-07-15T18:00:00Z" },
      ],
      [
        { eventId: "old", profileId: "p1", status: "PRESENT" },
        { eventId: "t1", profileId: "p1", status: "PRESENT" },
        { eventId: "m1", profileId: "p1", status: "ABSENT" },
      ],
    ).get("p1")

    expect(result?.training).toEqual({
      present: 1,
      total: 1,
      percentage: 100,
    })
    expect(result?.matches).toEqual({
      present: 0,
      total: 1,
      percentage: 0,
    })
    expect(result?.recentTraining.map(({ status }) => status)).toEqual([
      "PRESENT",
      "MISSING",
    ])
  })

  it("keeps only the latest eight trainings and renders oldest first", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      type: "ALLENAMENTO" as const,
      startsAt: `2026-07-${String(index + 1).padStart(2, "0")}T18:00:00Z`,
    }))
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: null }],
      events,
      [],
    ).get("p1")

    expect(result?.recentTraining.map(({ eventId }) => eventId)).toEqual([
      "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9",
    ])
  })
})
```

- [ ] **Step 3: Run tests and verify missing modules**

Run:

```bash
npm test -- src/lib/management-columns.test.ts src/lib/management-attendance.test.ts
```

Expected: FAIL with unresolved module errors.

- [ ] **Step 4: Implement column-state helpers**

Create `src/lib/management-columns.ts`:

```ts
export type ManagementView =
  | "PEOPLE"
  | "ATTENDANCE"
  | "PAYMENTS"
  | "REGISTRATIONS"
  | "CERTIFICATES"
  | "ACCOUNTS"

export const DEFAULT_COLUMNS: Record<ManagementView, string[]> = {
  PEOPLE: ["person", "confirmation", "phone", "account"],
  ATTENDANCE: ["person", "trainingStreak", "trainingRate", "matchRate"],
  PAYMENTS: ["person", "payments", "nextPayment", "dueOn", "paymentAction", "method"],
  REGISTRATIONS: ["person", "registration", "asiCard", "passportPhoto", "joinedOn", "completedOn"],
  CERTIFICATES: ["person", "certificate", "expiresOn", "document", "certificateAction"],
  ACCOUNTS: ["person", "account", "email", "phone", "accountAction", "permission"],
}

export type ColumnPreferences = Record<ManagementView, string[]>
export type TableSort = {
  columnId: string
  direction: "asc" | "desc"
} | null

export function normalizeColumnPreferences(value: unknown): ColumnPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<ManagementView, unknown>>)
      : {}
  return Object.fromEntries(
    Object.entries(DEFAULT_COLUMNS).map(([view, defaults]) => {
      const stored = source[view as ManagementView]
      if (!Array.isArray(stored)) return [view, [...defaults]]
      const valid = [...new Set(stored)].filter(
        (column): column is string =>
          typeof column === "string" && defaults.includes(column),
      )
      if (!valid.length) return [view, [...defaults]]
      return [
        view,
        valid.includes("person") ? valid : ["person", ...valid],
      ]
    }),
  ) as ColumnPreferences
}

export function moveColumn(
  columns: string[],
  columnId: string,
  offset: -1 | 1,
) {
  const from = columns.indexOf(columnId)
  const to = from + offset
  if (from < 0 || to < 0 || to >= columns.length) return columns
  const next = [...columns]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function applyTableState<T>(
  rows: T[],
  accessors: Record<
    string,
    {
      filterValue: (row: T) => string | number | null | undefined
      sortValue: (row: T) => string | number | null | undefined
    }
  >,
  filters: Record<string, string>,
  sort: TableSort,
) {
  const filtered = rows.filter((row) =>
    Object.entries(filters).every(([id, query]) => {
      if (!query) return true
      return String(accessors[id]?.filterValue(row) ?? "")
        .toLocaleLowerCase("it")
        .includes(query.toLocaleLowerCase("it"))
    }),
  )
  if (!sort || !accessors[sort.columnId]) return filtered
  const direction = sort.direction === "asc" ? 1 : -1
  return [...filtered].sort((left, right) =>
    String(accessors[sort.columnId].sortValue(left) ?? "").localeCompare(
      String(accessors[sort.columnId].sortValue(right) ?? ""),
      "it",
      { numeric: true },
    ) * direction,
  )
}
```

- [ ] **Step 5: Implement attendance aggregation**

Create `src/lib/management-attendance.ts` with these public types and behavior:

```ts
export type AttendanceEvent = {
  id: string
  type: "ALLENAMENTO" | "PARTITA"
  startsAt: string
}

export type AttendanceCheckin = {
  eventId: string
  profileId: string
  status: "PRESENT" | "ABSENT"
}

export type AttendanceRate = {
  present: number
  total: number
  percentage: number
}

export type AttendanceSummary = {
  training: AttendanceRate
  matches: AttendanceRate
  recentTraining: Array<{
    eventId: string
    startsAt: string
    status: "PRESENT" | "ABSENT" | "MISSING"
  }>
}
```

Implement `aggregateManagementAttendance(people, events, checkins)` by:

```ts
const checkinByKey = new Map(
  checkins.map((row) => [`${row.profileId}:${row.eventId}`, row.status]),
)
const trainingByDate = events
  .filter(({ type }) => type === "ALLENAMENTO")
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
```

For each person, filter eligible events with:

```ts
const eligible = events.filter(
  ({ startsAt }) => !person.joinedOn || startsAt.slice(0, 10) >= person.joinedOn,
)
```

Build each rate only from `PRESENT` or `ABSENT`; calculate `percentage` as
`total ? (present / total) * 100 : 0`. Build streak from `latestTraining`,
calculated per person as:

```ts
const latestTraining = trainingByDate
  .filter(
    ({ startsAt }) =>
      !person.joinedOn || startsAt.slice(0, 10) >= person.joinedOn,
  )
  .slice(-8)
```

Map absent keys to `ABSENT`, present keys to `PRESENT`, and missing keys to
`MISSING`.

- [ ] **Step 6: Attach attendance to management people**

In `src/lib/management.ts` import `AttendanceSummary` and add:

```ts
attendance?: AttendanceSummary
```

Reduce `ManagementFilters` to `{ query: string }`; category, confirmation, tag,
and view selection no longer live in the global toolbar. Stop searching
`department`, and remove `confirmationsPending` from `managementKpis()`.
Update `src/lib/management.test.ts` to assert name/phone/role search and the new
KPI shape.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/lib/management-columns.test.ts src/lib/management-attendance.test.ts src/lib/management.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/management-columns.ts src/lib/management-columns.test.ts src/lib/management-attendance.ts src/lib/management-attendance.test.ts src/lib/management.ts src/lib/management.test.ts
git commit -m "feat: model configurable management views"
```

---

### Task 3: Operational tabs, configurable columns, and attendance

**Files:**
- Create: `src/components/management/ColumnCustomizer.tsx`
- Create: `src/components/management/ColumnCustomizer.test.tsx`
- Create: `src/components/management/AttendanceStreak.tsx`
- Create: `src/components/management/AttendanceStreak.test.tsx`
- Create: `src/components/management/ManagementTable.test.tsx`
- Create: `src/lib/management-api.test.ts`
- Modify: `src/components/management/ManagementDashboard.tsx`
- Modify: `src/components/management/ManagementTable.tsx`
- Delete: `src/components/management/KpiStrip.tsx`
- Modify: `src/lib/management-api.ts`

**Interfaces:**
- Consumes: `ColumnPreferences`, `ManagementView`, `AttendanceSummary`, `normalizeColumnPreferences()`, `moveColumn()`, `applyTableState()`.
- Produces: `fetchManagementAttendance(client, seasonSlug, people)`.
- Produces: `fetchManagementColumnPreferences(client, profileId)` and `saveManagementColumnPreferences(client, profileId, preferences)`.
- Produces: `ColumnCustomizer` controlled by `columns`, `availableColumns`, `onChange`, `onReset`.

- [ ] **Step 1: Write failing component tests**

`ColumnCustomizer.test.tsx` must assert:

```tsx
render(
  <ColumnCustomizer
    availableColumns={[
      { id: "person", label: "Persona", required: true },
      { id: "phone", label: "Telefono" },
      { id: "account", label: "Account" },
    ]}
    columns={["person", "phone", "account"]}
    onChange={onChange}
    onReset={onReset}
  />,
)
fireEvent.click(screen.getByRole("button", { name: "Colonne" }))
fireEvent.click(screen.getByRole("checkbox", { name: "Telefono" }))
expect(onChange).toHaveBeenCalledWith(["person", "account"])
```

`AttendanceStreak.test.tsx` must render two dates in the same week and one in
the next week, then assert:

```tsx
expect(screen.getByLabelText("Lunedì 20 luglio 2026: presente")).toHaveClass(
  "bg-emerald-500",
)
expect(screen.getByLabelText("Giovedì 23 luglio 2026: assente")).toHaveClass(
  "bg-rose-500",
)
expect(screen.getByLabelText("Lunedì 27 luglio 2026: non registrato")).toHaveClass(
  "bg-slate-300",
)
expect(screen.getByTestId("week-separator")).toBeVisible()
```

`ManagementTable.test.tsx` must render the People view and assert:

```tsx
expect(screen.getByRole("columnheader", { name: /persona/i })).toBeVisible()
expect(screen.getByRole("columnheader", { name: /conferma/i })).toBeVisible()
expect(screen.queryByText("Dipartimento")).not.toBeInTheDocument()
expect(screen.queryByText("Tag")).not.toBeInTheDocument()
expect(screen.getByLabelText("Numero maglia 8")).toBeVisible()
```

Also click a sortable header twice and assert ascending then descending row
order; fill its filter control and assert non-matching rows disappear.

Create `src/lib/management-api.test.ts` with a fluent Supabase mock and assert:

```ts
const maybeSingle = vi.fn(async () => ({
  data: { management_columns: { PEOPLE: ["person", "phone"] } },
  error: null,
}))
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const upsert = vi.fn(async () => ({ error: null }))
const client = {
  from: vi.fn(() => ({ select, upsert })),
} as unknown as SupabaseClient

await expect(
  fetchManagementColumnPreferences(client, "profile-1"),
).resolves.toEqual({ PEOPLE: ["person", "phone"] })
expect(eq).toHaveBeenCalledWith("profile_id", "profile-1")

await saveManagementColumnPreferences(client, "profile-1", preferences)
expect(upsert).toHaveBeenCalledWith(
  { profile_id: "profile-1", management_columns: preferences },
  { onConflict: "profile_id" },
)
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
npm test -- src/components/management/ColumnCustomizer.test.tsx src/components/management/AttendanceStreak.test.tsx src/components/management/ManagementTable.test.tsx src/lib/management-api.test.ts
```

Expected: FAIL because new components do not exist and the current table is
hard-coded.

- [ ] **Step 3: Add preference and attendance queries**

In `src/lib/management-api.ts`, add:

```ts
export async function fetchManagementColumnPreferences(
  client: SupabaseClient,
  profileId: string,
) {
  const { data, error } = await client
    .from("profile_ui_preferences")
    .select("management_columns")
    .eq("profile_id", profileId)
    .maybeSingle()
  if (error) throw error
  return data?.management_columns ?? null
}

export async function saveManagementColumnPreferences(
  client: SupabaseClient,
  profileId: string,
  preferences: ColumnPreferences,
) {
  const { error } = await client.from("profile_ui_preferences").upsert(
    { profile_id: profileId, management_columns: preferences },
    { onConflict: "profile_id" },
  )
  if (error) throw error
}

export async function fetchManagementAttendance(
  client: SupabaseClient,
  seasonSlug: string,
  people: ManagementPerson[],
) {
  const { data: season, error: seasonError } = await client
    .from("seasons")
    .select("id")
    .eq("slug", seasonSlug)
    .single()
  if (seasonError) throw seasonError

  const { data: events, error: eventsError } = await client
    .from("events")
    .select("id, tipo, data_ora")
    .eq("season_id", season.id)
    .lte("data_ora", new Date().toISOString())
    .order("data_ora")
  if (eventsError) throw eventsError

  const eventIds = (events ?? []).map(({ id }) => id)
  const { data: checkins, error: checkinsError } = eventIds.length
    ? await client
        .from("event_checkins")
        .select("event_id, profile_id, status")
        .in("event_id", eventIds)
    : { data: [], error: null }
  if (checkinsError) throw checkinsError

  return aggregateManagementAttendance(
    people
      .filter(({ category }) => category === "PLAYER")
      .map(({ profileId, joinedOn }) => ({ profileId, joinedOn: joinedOn ?? null })),
    (events ?? []).flatMap((event) =>
      event.data_ora
        ? [{ id: event.id, type: event.tipo, startsAt: event.data_ora }]
        : [],
    ),
    (checkins ?? []).map((row) => ({
      eventId: row.event_id,
      profileId: row.profile_id,
      status: row.status,
    })),
  )
}
```

- [ ] **Step 4: Implement column customizer and streak**

`ColumnCustomizer.tsx` uses existing `Popover`, native checkboxes, and
`ArrowUp`, `ArrowDown`, `RotateCcw`, `Columns3` icons. Required `person` cannot
be hidden. Up/down buttons call `moveColumn()` and disable at list bounds.

`AttendanceStreak.tsx` uses `date-fns` Italian locale:

```tsx
const day = format(new Date(item.startsAt), "EEEE d MMMM yyyy", { locale: it })
const shortDay = format(new Date(item.startsAt), "EE d", { locale: it })
const week = format(new Date(item.startsAt), "RRRR-II")
const accessibleDay = day[0].toLocaleUpperCase("it") + day.slice(1)
```

Insert a `data-testid="week-separator"` border when `week` differs from the
previous item. Use `aria-label={`${accessibleDay}: ${statusLabel}`}` and
status classes `bg-emerald-500`, `bg-rose-500`, `bg-slate-300`.

- [ ] **Step 5: Convert ManagementTable to column definitions**

Move `ManagementView` import to `@/lib/management-columns`. Define:

```ts
type ManagementColumn = {
  id: string
  label: string
  required?: boolean
  filterValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  sortValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  filter?:
    | "text"
    | "category"
    | "confirmation"
    | "account"
    | "payment"
    | "registration"
    | "certificate"
  render: (
    person: ManagementPerson,
    actions: ManagementTableActions,
  ) => React.ReactNode
}
```

Build `columnsByView` with exact default IDs from `DEFAULT_COLUMNS`. The
`person` renderer shows avatar/name and:

```tsx
<span className="flex items-center gap-1">
  {role}
  {person.category === "PLAYER" && (
    <span aria-label={`Numero maglia ${person.jerseyNumber ?? "non assegnato"}`}>
      <Shirt aria-hidden="true" className="size-3" />
      {person.jerseyNumber ?? "—"}
    </span>
  )}
</span>
```

Render only ordered visible IDs. Header label is a button cycling no sort,
ascending, descending. A second header row renders the column-specific filter.
Call `applyTableState()` before row rendering. Keep checkbox selection and
drawer chevron outside customizable columns.

Mobile cards use the active view's first two meaningful values rather than
always showing confirmation/account.

- [ ] **Step 6: Replace dashboard navigation and persist preferences**

In `ManagementDashboard.tsx`:

```ts
const views = [
  { id: "PEOPLE", label: "Persone" },
  { id: "ATTENDANCE", label: "Presenze" },
  { id: "PAYMENTS", label: "Quote" },
  { id: "REGISTRATIONS", label: "Tesseramenti" },
  { id: "CERTIFICATES", label: "Certificati" },
  { id: "ACCOUNTS", label: "Account" },
] satisfies Array<{ id: ManagementView; label: string }>
```

Initialize `view` to `PEOPLE`. Delete `KpiStrip` and the duplicate `views`
button group. Render one tab group with counters from `managementKpis()`;
attendance counter is number of players.

Load preferences after `profile?.id` exists:

```ts
try {
  setColumnPreferences(
    normalizeColumnPreferences(
      await fetchManagementColumnPreferences(supabaseBrowser, profile.id),
    ),
  )
} catch {
  setColumnPreferences(normalizeColumnPreferences(null))
}
```

On a visibility/order change, update state immediately and persist:

```ts
try {
  await saveManagementColumnPreferences(supabaseBrowser, profile.id, next)
} catch {
  toast.error("Preferenze colonne non salvate")
}
```

When `view === "ATTENDANCE"` and attendance is not loaded for `seasonSlug`,
call `fetchManagementAttendance()`, merge summaries by `profileId`, and confine
failure to an inline Presenze error state.

Keep only global search plus `Colonne` in the toolbar. Delete category,
confirmation, and tag selects; visible column filters replace them. The
`person` column offers category values `Tutti`, `Giocatori`, `Staff`; the
`confirmation` column offers all membership statuses. Pass ordered columns and
available column metadata to `ManagementTable` and `ColumnCustomizer`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/components/management/ColumnCustomizer.test.tsx src/components/management/AttendanceStreak.test.tsx src/components/management/ManagementTable.test.tsx src/lib/management.test.ts src/lib/management-api.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/management src/lib/management-api.ts src/lib/management-api.test.ts
git commit -m "feat: add operational management tables"
```

---

### Task 4: Private passport-photo preview

**Files:**
- Create: `src/components/management/PassportPhotoPreview.tsx`
- Create: `src/components/management/PassportPhotoPreview.test.tsx`
- Modify: `src/components/management/ManagementDashboard.tsx`
- Modify: `src/components/management/ManagementTable.tsx`

**Interfaces:**
- Produces: `PassportPhotoPreview({ personName, signedUrl })`.
- Management table receives `passportPhotoUrls: Map<string, string>`.

- [ ] **Step 1: Write failing preview test**

Create `PassportPhotoPreview.test.tsx`:

```tsx
render(
  <PassportPhotoPreview
    personName="Anna Rossi"
    signedUrl="https://signed.example/photo.jpg"
  />,
)
const trigger = screen.getByRole("button", {
  name: "Apri fototessera di Anna Rossi",
})
expect(within(trigger).getByRole("img")).toHaveAttribute(
  "src",
  "https://signed.example/photo.jpg",
)
fireEvent.click(trigger)
expect(screen.getByRole("dialog", { name: "Fototessera di Anna Rossi" }))
  .toBeVisible()
```

Add a missing-photo case asserting text `Mancante` and no button.

- [ ] **Step 2: Run test and verify missing component**

Run: `npm test -- src/components/management/PassportPhotoPreview.test.tsx`

Expected: FAIL with unresolved module.

- [ ] **Step 3: Implement preview dialog**

Use existing `Dialog`, `AvatarImage` is not appropriate for document preview.
Render a native image with fixed thumbnail bounds:

```tsx
<button aria-label={`Apri fototessera di ${personName}`} type="button">
  <img
    alt=""
    className="size-10 rounded object-cover"
    src={signedUrl}
  />
</button>
```

The dialog title is `Fototessera di ${personName}` and its image uses
`max-h-[70dvh] w-full object-contain`.

- [ ] **Step 4: Batch signed URLs only for Tesseramenti**

In `ManagementDashboard.tsx`, when `view === "REGISTRATIONS"`:

```ts
const paths = people.flatMap(({ passportPhotoPath }) =>
  passportPhotoPath ? [passportPhotoPath] : [],
)
const { data, error } = paths.length
  ? await supabaseBrowser.storage
      .from("passport-photos")
      .createSignedUrls(paths, 300)
  : { data: [], error: null }
if (error) {
  toast.error("Anteprime fototessera non disponibili")
  setPassportPhotoUrls(new Map())
  return
}
setPassportPhotoUrls(
  new Map(
    (data ?? []).flatMap((item) =>
      item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  ),
)
```

Ignore stale async results after season/view changes. Pass the map to
`ManagementTable`; its `passportPhoto` column looks up
`person.passportPhotoPath`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/components/management/PassportPhotoPreview.test.tsx src/components/management/ManagementTable.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/management/PassportPhotoPreview.tsx src/components/management/PassportPhotoPreview.test.tsx src/components/management/ManagementDashboard.tsx src/components/management/ManagementTable.tsx
git commit -m "feat: preview registration passport photos"
```

---

### Task 5: Confirmed and maybe roster presentation

**Files:**
- Create: `src/components/team/PublicTeam.test.tsx`
- Modify: `src/components/team/PublicTeam.tsx`
- Modify: `src/components/team/PlayerRosterCard.tsx`
- Modify: `src/components/team/PlayerRosterCard.test.tsx`

**Interfaces:**
- `PlayerRosterCard` gains `muted?: boolean`.
- A muted card never renders the profile Info link.

- [ ] **Step 1: Write failing grouping tests**

Mock `public_active_roster` with one `YES` player, one `MAYBE` player, and one
staff member. In `PublicTeam.test.tsx`, assert:

```tsx
expect(screen.getByRole("heading", { name: "Squadra" })).toBeVisible()
expect(screen.getByRole("heading", { name: "In forse" })).toBeVisible()
expect(screen.getByRole("heading", { name: "Staff" })).toBeVisible()

const confirmed = screen.getByRole("region", { name: "Squadra" })
const maybe = screen.getByRole("region", { name: "In forse" })
expect(within(confirmed).getByText("Confermato")).toBeVisible()
expect(within(maybe).getByText("Incerto")).toBeVisible()
expect(within(maybe).queryByRole("link", { name: /profilo di/i }))
  .not.toBeInTheDocument()
```

Update `PlayerRosterCard.test.tsx` to assert the Info link has classes
`right-1 top-1`, the role and shirt share one `data-testid="player-role-row"`,
and a muted card has `opacity-40 grayscale`.

- [ ] **Step 2: Run tests and verify current combined grid fails**

Run:

```bash
npm test -- src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.test.tsx
```

Expected: FAIL because current code renders `YES` and `MAYBE` in one grid and
Info is on the left.

- [ ] **Step 3: Split PublicTeam player groups**

In `PublicTeam.tsx`:

```ts
const confirmedPlayers = members.filter(
  ({ category, status }) => category === "PLAYER" && status === "YES",
)
const maybePlayers = members.filter(
  ({ category, status }) => category === "PLAYER" && status === "MAYBE",
)
```

Render labeled regions in order: Squadra, In forse, Staff. Pass `muted` to
maybe cards. Continue deriving staff from `category === "STAFF"` and do not
query any base table beyond `public_active_roster`.

- [ ] **Step 4: Adjust player card**

In `PlayerRosterCard.tsx`:

```tsx
<article
  className={cn(
    "relative min-w-0 overflow-hidden rounded-xl border bg-card px-1.5 py-2 text-center shadow-xs",
    muted && "opacity-40 grayscale",
  )}
>
  {canViewProfile && !muted && (
    <Link className="absolute right-1 top-1 ..." />
  )}
```

Replace separate shirt and role blocks with:

```tsx
<p
  className="mt-0.5 flex items-center justify-center gap-1 truncate text-[8px] uppercase tracking-wide text-muted-foreground"
  data-testid="player-role-row"
>
  <span>{player.role ?? "Ruolo da definire"}</span>
  <span aria-label={`Numero ${player.jersey_number ?? "non assegnato"}`}>
    <Shirt aria-hidden="true" className="inline size-3" />
    {player.jersey_number ?? "—"}
  </span>
</p>
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.test.tsx src/app/squadra/page.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/PublicTeam.tsx src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.tsx src/components/team/PlayerRosterCard.test.tsx
git commit -m "feat: separate confirmed and maybe players"
```

---

### Task 6: Manager presence and management header control

**Files:**
- Modify: `src/components/management/ManagerPresence.tsx`
- Modify: `src/components/management/ManagerPresence.test.tsx`
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/components/SiteHeader.test.tsx`

**Interfaces:**
- `presenceState()` returns `ringColor` instead of a background-dot color.
- `ManagerPresence` renders only state-colored avatar rings, without overlay
  indicators.

- [ ] **Step 1: Update tests first**

In `ManagerPresence.test.tsx`, change expected colors to:

```ts
[
  ["ONLINE", "ring-emerald-500"],
  ["RECENT", "ring-amber-400"],
  ["STALE", "ring-slate-400"],
  ["NEVER", "ring-slate-400"],
]
```

Assert the avatar itself has the class and the trigger has no element marked
`data-presence-dot`.

In `SiteHeader.test.tsx`, assert:

```tsx
const managementLink = screen.getByRole("link", {
  name: "Gestione squadra",
})
expect(managementLink).toHaveAttribute("href", "/gestione")
expect(managementLink).not.toHaveClass("bg-violet-600")
expect(managementLink.querySelector(".lucide-users-round")).toBeTruthy()
expect(screen.getByLabelText("Manager e stato attività").parentElement)
  .toContainElement(managementLink)
```

Make the `ManagerPresence` mock render
`<div aria-label="Manager e stato attività" />`.

- [ ] **Step 2: Run tests and verify old violet UI fails**

Run:

```bash
npm test -- src/components/management/ManagerPresence.test.tsx src/components/SiteHeader.test.tsx
```

Expected: FAIL because rings and management action are violet and separate.

- [ ] **Step 3: Put state color on avatar ring**

Change `presenceState()` results:

```ts
return { state: "ONLINE", label: "Online", ringColor: "ring-emerald-500" }
```

Use amber for recent and slate for stale/never. Render:

```tsx
<Avatar
  className={cn(
    "size-8 border-2 border-background ring-2",
    presence.ringColor,
  )}
>
```

Delete the bottom-right indicator span. Preserve tooltip and accessible
presence label.

- [ ] **Step 4: Group avatars with management action**

In `SiteHeader.tsx`, replace `Settings2` import with `UsersRound`. Wrap
`ManagerPresence` and the management button:

```tsx
<div className="flex items-center lg:rounded-full lg:border lg:bg-muted/35 lg:p-0.5">
  <ManagerPresence />
  <Button
    asChild
    className="size-11 rounded-full px-0 lg:ml-2 lg:h-8 lg:w-auto lg:px-3"
    size="sm"
    variant="ghost"
  >
    <Link aria-label="Gestione squadra" href="/gestione">
      <UsersRound aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">Gestione squadra</span>
    </Link>
  </Button>
</div>
```

`ManagerPresence` remains internally hidden below `lg`, so this single link is
the compact mobile action and the capsule action on desktop. Keep notification,
theme, and personal profile controls separate.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/components/management/ManagerPresence.test.tsx src/components/SiteHeader.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/management/ManagerPresence.tsx src/components/management/ManagerPresence.test.tsx src/components/SiteHeader.tsx src/components/SiteHeader.test.tsx
git commit -m "feat: align manager presence with management action"
```

---

### Task 7: Full regression gate

**Files:**
- Modify only files required by failures caused by Tasks 1–6.

**Interfaces:**
- Consumes all prior task outputs.
- Produces one green repository state with no unrelated edits.

- [ ] **Step 1: Run all application tests**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run static checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass with no warnings promoted to errors.

- [ ] **Step 3: Run database checks**

Run:

```bash
npm run db:verify
npx supabase test db tests/db/*.sql
```

Expected: schema verification and all pgTAP files pass.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: no uncommitted files, no whitespace errors, and one focused commit
for each implementation task.
