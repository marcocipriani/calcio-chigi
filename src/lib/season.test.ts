import { describe, expect, it } from "vitest"

import { activeSeasonAt, ageBand, canJoinMatchFormation } from "@/lib/season"

describe("activeSeasonAt", () => {
  it("keeps 2025-2026 active through 31 July in Rome", () => {
    expect(activeSeasonAt(new Date("2026-07-31T21:59:59Z")).slug).toBe("2025-2026")
  })

  it("activates 2026-2027 at midnight on 1 August in Rome", () => {
    expect(activeSeasonAt(new Date("2026-07-31T22:00:00Z")).slug).toBe("2026-2027")
  })
})

describe("ageBand", () => {
  const reference = new Date("2026-08-01T12:00:00+02:00")

  it.each([
    ["1996-08-02", "UNDER_30"],
    ["1996-08-01", "30_35"],
    ["1991-08-01", "30_35"],
    ["1990-08-01", "OVER_35"],
    [null, "UNKNOWN"],
  ] as const)("maps %s to %s", (dob, expected) => {
    expect(ageBand(dob, reference)).toBe(expected)
  })
})

describe("canJoinMatchFormation", () => {
  it("accepts confirmed players", () => {
    expect(
      canJoinMatchFormation({
        category: "PLAYER",
        status: "YES",
        training_only: false,
      }),
    ).toBe(true)
  })

  it.each([
    { category: "STAFF", status: "YES", training_only: false },
    { category: "PLAYER", status: "NO", training_only: false },
    { category: "PLAYER", status: "YES", training_only: true },
  ] as const)("rejects $category/$status/training=$training_only", (membership) => {
    expect(canJoinMatchFormation(membership)).toBe(false)
  })
})
