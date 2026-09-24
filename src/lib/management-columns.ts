export type ManagementView =
  | "PEOPLE"
  | "ATTENDANCE"
  | "PAYMENTS"
  | "REGISTRATIONS"
  | "CERTIFICATES"
  | "ACCOUNTS"

export const DEFAULT_COLUMNS: Record<ManagementView, string[]> = {
  PEOPLE: ["person", "role", "phone", "tags"],
  ATTENDANCE: ["person", "trainingStreak", "trainingRate"],
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

/** Elenco tabellare oppure schede: stessa gerarchia, due composizioni. */
export type ManagementLayout = "TABLE" | "CARDS"

export type ManagementColumnFilters = Record<string, string>

export function nextSort(current: TableSort, columnId: string): TableSort {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "asc" }
  }
  return current.direction === "asc"
    ? { columnId, direction: "desc" }
    : null
}

/** Tiene solo i filtri delle colonne ancora visibili e non vuoti. */
export function activeColumnFilters(
  filters: ManagementColumnFilters,
  visibleColumnIds: string[],
): ManagementColumnFilters {
  return Object.fromEntries(
    visibleColumnIds.flatMap((id) =>
      filters[id] ? [[id, filters[id]] as const] : [],
    ),
  )
}

/** Come il manager guarda la dashboard: salvato per profilo, come le colonne. */
export type DisplayPreferences = {
  view: ManagementView
  layout: ManagementLayout
  sorts: Partial<Record<ManagementView, TableSort>>
}

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const views = Object.keys(DEFAULT_COLUMNS) as ManagementView[]
  const view = views.includes(source.view as ManagementView)
    ? (source.view as ManagementView)
    : "PEOPLE"
  const layout = source.layout === "CARDS" ? "CARDS" : "TABLE"
  const storedSorts =
    source.sorts && typeof source.sorts === "object"
      ? (source.sorts as Record<string, unknown>)
      : {}
  const sorts: DisplayPreferences["sorts"] = {}
  for (const key of views) {
    const sort = storedSorts[key] as { columnId?: unknown; direction?: unknown }
    if (
      sort &&
      typeof sort.columnId === "string" &&
      (sort.direction === "asc" || sort.direction === "desc")
    ) {
      sorts[key] = { columnId: sort.columnId, direction: sort.direction }
    }
  }
  return { view, layout, sorts }
}

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

      return [view, valid.includes("person") ? valid : ["person", ...valid]]
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
  return [...filtered].sort(
    (left, right) =>
      String(accessors[sort.columnId].sortValue(left) ?? "").localeCompare(
        String(accessors[sort.columnId].sortValue(right) ?? ""),
        "it",
        { numeric: true },
      ) * direction,
  )
}
