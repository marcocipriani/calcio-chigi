export type ManagementView =
  | "PEOPLE"
  | "ATTENDANCE"
  | "PAYMENTS"
  | "REGISTRATIONS"
  | "CERTIFICATES"
  | "ACCOUNTS"

export const DEFAULT_COLUMNS: Record<ManagementView, string[]> = {
  PEOPLE: ["person", "phone", "account"],
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
