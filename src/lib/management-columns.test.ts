import { describe, expect, it } from "vitest"

import {
  DEFAULT_COLUMNS,
  activeColumnFilters,
  applyTableState,
  moveColumn,
  nextSort,
  normalizeColumnPreferences,
  normalizeDisplayPreferences,
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

  it("matches closed values exactly when the accessor asks for it", () => {
    const rows = [{ size: "L" }, { size: "XL" }, { size: "XXL" }]
    const size = (row: { size: string }) => row.size
    expect(
      applyTableState(
        rows,
        { size: { filterValue: size, sortValue: size, exact: true } },
        { size: "L" },
        null,
      ),
    ).toEqual([{ size: "L" }])
  })

  it("cycles a column through ascending, descending and no order", () => {
    const ascending = nextSort(null, "person")
    expect(ascending).toEqual({ columnId: "person", direction: "asc" })
    const descending = nextSort(ascending, "person")
    expect(descending).toEqual({ columnId: "person", direction: "desc" })
    expect(nextSort(descending, "person")).toBeNull()
    expect(nextSort(descending, "phone")).toEqual({
      columnId: "phone",
      direction: "asc",
    })
  })

  it("keeps only the filters of the visible and valued columns", () => {
    expect(
      activeColumnFilters(
        { person: "U35", phone: "", account: "ACTIVE" },
        ["person", "phone"],
      ),
    ).toEqual({ person: "U35" })
  })
})

describe("normalizeDisplayPreferences", () => {
  it("keeps valid per-view settings and custom views, drops the rest", () => {
    expect(
      normalizeDisplayPreferences({
        view: "custom-1",
        layouts: { PAYMENTS: "CARDS", BOGUS: "CARDS" },
        sorts: {
          PAYMENTS: { columnId: "dueOn", direction: "desc" },
          PEOPLE: { columnId: "person", direction: "sideways" },
        },
        widths: { "custom-1": { phone: 10, notes: 9999, role: "wide" } },
        customViews: [
          {
            id: "custom-1",
            label: " Da contattare ",
            columns: ["phone", "nope"],
            filters: { phone: "333", role: "" },
          },
          { id: "PEOPLE", label: "Non può sostituire una predefinita" },
          { id: "custom-2", label: "  " },
        ],
      }),
    ).toEqual({
      view: "custom-1",
      layouts: { PAYMENTS: "CARDS" },
      sorts: { PAYMENTS: { columnId: "dueOn", direction: "desc" } },
      widths: { "custom-1": { phone: 64, notes: 640 } },
      customViews: [
        {
          id: "custom-1",
          label: "Da contattare",
          columns: ["person", "phone"],
          filters: { phone: "333" },
        },
      ],
    })
  })

  it("falls back to People and reads the old single layout", () => {
    expect(
      normalizeDisplayPreferences({ view: "custom-gone", layout: "CARDS" }),
    ).toMatchObject({ view: "PEOPLE", layouts: { PEOPLE: "CARDS" } })
    expect(normalizeDisplayPreferences("garbage")).toEqual({
      view: "PEOPLE",
      layouts: {},
      sorts: {},
      widths: {},
      customViews: [],
    })
  })
})
