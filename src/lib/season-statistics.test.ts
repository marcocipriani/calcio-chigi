import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { fetchSafePlayerProfile } from "@/lib/api"
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
  it("returns each selected-season phase once in competition order after all phases", () => {
    const rows = [
      { season_id: "season-2025", phase_key: "FASE_2_PROFESSIONISTI" },
      { season_id: "season-2025", phase_key: "FASE_1" },
      { season_id: "season-2025", phase_key: "FASE_1" },
      { season_id: "season-2026", phase_key: "FASE_2_CALCIATORI" },
      { season_id: "season-2026", phase_key: "COPPA_LAZIO_PROFESSIONISTI" },
    ] as const

    expect(
      phaseOptionsForSeason("season-2025", rows).map(({ value }) => value),
    ).toEqual([
      "ALL",
      "FASE_1",
      "FASE_2_PROFESSIONISTI",
    ])
  })
})

describe("fetchSafePlayerProfile", () => {
  it("returns only the safe profile fields from the RPC payload", async () => {
    const supabase = {
      rpc: () => ({
        maybeSingle: async () => ({
          data: {
            profile_id: "player-1",
            season_id: "season-2026",
            nome: "Elio",
            cognome: "Dorbolò",
            avatar_url: null,
            role: "ATT",
            jersey_number: 9,
            goals: 4,
            assists: 2,
            mvp: 1,
            yellow_cards: 0,
            red_cards: 0,
            private_field_added_later: "must not escape",
          },
          error: null,
        }),
      }),
    } as unknown as SupabaseClient

    await expect(
      fetchSafePlayerProfile(supabase, "player-1", "season-2026"),
    ).resolves.toEqual({
      profile_id: "player-1",
      season_id: "season-2026",
      nome: "Elio",
      cognome: "Dorbolò",
      avatar_url: null,
      role: "ATT",
      jersey_number: 9,
      goals: 4,
      assists: 2,
      mvp: 1,
      yellow_cards: 0,
      red_cards: 0,
    })
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
