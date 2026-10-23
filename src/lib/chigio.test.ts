import { describe, expect, it } from "vitest"

import { cyclePick, EMPTY_BALLOT, isPollOpen, sortSeasonStats } from "@/lib/chigio"

describe("cyclePick", () => {
  it("cycles none → top → applause → none", () => {
    const top = cyclePick(EMPTY_BALLOT, "a")
    expect(top).toEqual({ top: "a", applause: [] })
    const applause = cyclePick(top, "a")
    expect(applause).toEqual({ top: null, applause: ["a"] })
    expect(cyclePick(applause, "a")).toEqual(EMPTY_BALLOT)
  })

  it("with top taken, a free player gets applause and the top stays", () => {
    expect(cyclePick({ top: "a", applause: [] }, "b")).toEqual({ top: "a", applause: ["b"] })
    expect(cyclePick({ top: "a", applause: ["b", "c"] }, "d")).toEqual({ top: "a", applause: ["b", "c"] })
  })

  it("freeing the top lets another player take it", () => {
    const freed = cyclePick({ top: "a", applause: [] }, "a")
    expect(cyclePick(freed, "b")).toEqual({ top: "b", applause: ["a"] })
  })

  it("never allows a third applause", () => {
    expect(cyclePick({ top: "c", applause: ["a", "b"] }, "c")).toEqual({ top: null, applause: ["a", "b"] })
  })
})

describe("isPollOpen", () => {
  const poll = { event_id: "e", opened_at: "", closes_at: "2026-10-24T10:00:00Z", closed_at: null, voters_total: 3, ballots_count: 0 }
  it("is open until closes_at unless closed", () => {
    expect(isPollOpen(poll, Date.parse("2026-10-24T09:59:00Z"))).toBe(true)
    expect(isPollOpen(poll, Date.parse("2026-10-24T10:00:00Z"))).toBe(false)
    expect(isPollOpen({ ...poll, closed_at: "2026-10-23T10:00:00Z" }, 0)).toBe(false)
  })
})

describe("sortSeasonStats", () => {
  it("orders by wins, then tops, then applause", () => {
    const row = (profile_id: string, wins: number, tops: number, applause: number) =>
      ({ profile_id, tipo: "PARTITA" as const, wins, tops, applause })
    expect(sortSeasonStats([row("a", 0, 5, 9), row("b", 1, 1, 0), row("c", 1, 1, 3)]).map(r => r.profile_id))
      .toEqual(["c", "b", "a"])
  })
})
