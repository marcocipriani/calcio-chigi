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

// Ogni colonna è disponibile in ogni vista: l'elenco è la fonte di verità per
// validare le preferenze salvate. Deve restare allineato alle definizioni in
// ManagementTable (un test lo verifica).
export const ALL_COLUMN_IDS = [
  "person",
  "role",
  "status",
  "birthDate",
  "jerseyNumber",
  "uniformSize",
  "phone",
  "email",
  "department",
  "tags",
  "trainingStreak",
  "trainingRate",
  "payments",
  "nextPayment",
  "dueOn",
  "method",
  "paymentAction",
  "registration",
  "asiCard",
  "passportPhoto",
  "joinedOn",
  "completedOn",
  "certificate",
  "expiresOn",
  "document",
  "certificateAction",
  "account",
  "accountAction",
  "permission",
  "nextContactOn",
  "notes",
] as const

export const BUILT_IN_VIEWS = Object.keys(DEFAULT_COLUMNS) as ManagementView[]

export function isBuiltInView(id: string): id is ManagementView {
  return (BUILT_IN_VIEWS as string[]).includes(id)
}

/** Vista creata dal manager: colonne e filtri suoi, affiancata alle predefinite. */
export type CustomView = {
  id: string
  label: string
  columns: string[]
  filters: ManagementColumnFilters
}

/**
 * Come il manager guarda la dashboard, salvato per profilo. Layout,
 * ordinamento e larghezze sono per vista (predefinita o personalizzata); le
 * colonne delle viste predefinite restano in ColumnPreferences.
 */
export type DisplayPreferences = {
  view: string
  layouts: Record<string, ManagementLayout>
  sorts: Record<string, TableSort>
  widths: Record<string, Record<string, number>>
  customViews: CustomView[]
}

const MIN_COLUMN_WIDTH = 64
const MAX_COLUMN_WIDTH = 640

export function clampColumnWidth(width: number) {
  return Math.round(
    Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeColumns(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback]
  const known = ALL_COLUMN_IDS as readonly string[]
  const valid = [...new Set(value)].filter(
    (column): column is string =>
      typeof column === "string" && known.includes(column),
  )
  if (!valid.length) return [...fallback]
  return valid.includes("person") ? valid : ["person", ...valid]
}

function normalizeSort(value: unknown): TableSort {
  const sort = asRecord(value)
  return typeof sort.columnId === "string" &&
    (sort.direction === "asc" || sort.direction === "desc")
    ? { columnId: sort.columnId, direction: sort.direction }
    : null
}

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  const source = asRecord(value)

  const customViews: CustomView[] = (
    Array.isArray(source.customViews) ? source.customViews : []
  ).flatMap((item) => {
    const view = asRecord(item)
    const label = typeof view.label === "string" ? view.label.trim() : ""
    if (typeof view.id !== "string" || !view.id || isBuiltInView(view.id) || !label) {
      return []
    }
    const filters = Object.fromEntries(
      Object.entries(asRecord(view.filters)).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1] !== "",
      ),
    )
    return [
      {
        id: view.id,
        label: label.slice(0, 40),
        columns: normalizeColumns(view.columns, DEFAULT_COLUMNS.PEOPLE),
        filters,
      },
    ]
  })
  const viewIds = [...BUILT_IN_VIEWS, ...customViews.map(({ id }) => id)]

  // Formato precedente: un solo layout per tutte le viste.
  const legacyLayout: ManagementLayout | null =
    source.layout === "CARDS" ? "CARDS" : null
  const storedLayouts = asRecord(source.layouts)
  const storedSorts = asRecord(source.sorts)
  const storedWidths = asRecord(source.widths)
  const layouts: DisplayPreferences["layouts"] = {}
  const sorts: DisplayPreferences["sorts"] = {}
  const widths: DisplayPreferences["widths"] = {}
  for (const id of viewIds) {
    const layout = storedLayouts[id] ?? legacyLayout
    if (layout === "CARDS" || layout === "TABLE") layouts[id] = layout
    const sort = normalizeSort(storedSorts[id])
    if (sort) sorts[id] = sort
    const viewWidths = Object.fromEntries(
      Object.entries(asRecord(storedWidths[id])).flatMap(([column, width]) =>
        typeof width === "number" && Number.isFinite(width)
          ? [[column, clampColumnWidth(width)]]
          : [],
      ),
    )
    if (Object.keys(viewWidths).length) widths[id] = viewWidths
  }

  const view =
    typeof source.view === "string" && viewIds.includes(source.view)
      ? source.view
      : "PEOPLE"
  return { view, layouts, sorts, widths, customViews }
}

export function normalizeColumnPreferences(value: unknown): ColumnPreferences {
  const source = asRecord(value)
  return Object.fromEntries(
    BUILT_IN_VIEWS.map((view) => [
      view,
      normalizeColumns(source[view], DEFAULT_COLUMNS[view]),
    ]),
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
      /** Valori chiusi dove uno contiene l'altro (L/XL/XXL): confronto esatto. */
      exact?: boolean
    }
  >,
  filters: Record<string, string>,
  sort: TableSort,
) {
  const filtered = rows.filter((row) =>
    Object.entries(filters).every(([id, query]) => {
      if (!query) return true
      const value = String(accessors[id]?.filterValue(row) ?? "")
      if (accessors[id]?.exact) return value === query
      return value
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
