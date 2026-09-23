import { describe, expect, it } from "vitest"

import { daysLeftInTrash } from "@/components/management/TrashDialog"

describe("daysLeftInTrash", () => {
  it("conta i giorni di calendario rimasti prima dell'eliminazione", () => {
    const now = new Date("2026-09-23T10:00:00")

    expect(daysLeftInTrash("2026-09-23T09:00:00", now)).toBe(30)
    expect(daysLeftInTrash("2026-09-22T23:00:00", now)).toBe(29)
    expect(daysLeftInTrash("2026-08-24T10:00:00", now)).toBe(0)
    expect(daysLeftInTrash("2026-07-01T10:00:00", now)).toBe(0)
  })
})
