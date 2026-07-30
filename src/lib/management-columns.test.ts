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
