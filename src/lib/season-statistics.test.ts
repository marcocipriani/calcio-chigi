import { describe, expect, it } from "vitest"

import {
  aggregateSeasonStats,
  phaseOptionsForSeason,
  SEASON_OPTIONS,
} from "@/lib/season-statistics"

describe("SEASON_OPTIONS", () => {
  it("defaults the app to 2026-2027 and marks legacy attendance unavailable", () => {
    expect(SEASON_OPTIONS[0].slug).toBe("2026-2027")
    expect(SEASON_OPTIONS[1].attendanceAvailable).toBe(false)
  })
})

describe("phaseOptionsForSeason", () => {
  it("returns each available phase once in competition order after all phases", () => {
    const rows = [
      { phase_key: "COPPA_LAZIO_PROFESSIONISTI" },
      { phase_key: "FASE_2_PROFESSIONISTI" },
      { phase_key: "FASE_1" },
      { phase_key: "FASE_2_CALCIATORI" },
      { phase_key: "FASE_1" },
    ] as const

    expect(
      phaseOptionsForSeason("2025-2026", rows).map(({ value }) => value),
    ).toEqual([
      "ALL",
      "FASE_1",
      "FASE_2_CALCIATORI",
      "FASE_2_PROFESSIONISTI",
      "COPPA_LAZIO_PROFESSIONISTI",
    ])
  })
})

describe("aggregateSeasonStats", () => {
  it("keeps assists unavailable when any aggregated phase lacks them", () => {
    expect(
      aggregateSeasonStats([
        { goals: 2, assists: null, mvp: 1, yellow_cards: 0, red_cards: 0 },
        { goals: 1, assists: 3, mvp: 0, yellow_cards: 2, red_cards: 1 },
      ]),
    ).toMatchObject({
      goals: 3,
      assists: null,
      mvp: 1,
      yellow_cards: 2,
      red_cards: 1,
    })
  })
})
