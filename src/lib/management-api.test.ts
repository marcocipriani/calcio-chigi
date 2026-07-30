import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import {
  fetchManagementAttendance,
  fetchManagementColumnPreferences,
  saveManagementColumnPreferences,
} from "@/lib/management-api"
import type { ManagementPerson } from "@/lib/management"
import { normalizeColumnPreferences } from "@/lib/management-columns"

describe("management column preferences", () => {
  it("loads and saves the manager profile preferences", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { management_columns: { PEOPLE: ["person", "phone"] } },
      error: null,
    }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const upsert = vi.fn(async () => ({ error: null }))
    const client = {
      from: vi.fn(() => ({ select, upsert })),
    } as unknown as SupabaseClient
    const preferences = normalizeColumnPreferences({
      PEOPLE: ["person", "phone"],
    })

    await expect(
      fetchManagementColumnPreferences(client, "profile-1"),
    ).resolves.toEqual({ PEOPLE: ["person", "phone"] })
    expect(eq).toHaveBeenCalledWith("profile_id", "profile-1")

    await saveManagementColumnPreferences(client, "profile-1", preferences)
    expect(upsert).toHaveBeenCalledWith(
      { profile_id: "profile-1", management_columns: preferences },
      { onConflict: "profile_id" },
    )
  })
})

describe("fetchManagementAttendance", () => {
  it("loads the season events and aggregates only player attendance", async () => {
    const checkinIn = vi.fn(async () => ({
      data: [
        {
          event_id: "training-1",
          profile_id: "player-1",
          status: "PRESENT",
        },
      ],
      error: null,
    }))
    const from = vi.fn((table: string) => {
      if (table === "seasons") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "season-1" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "training-1",
                      tipo: "ALLENAMENTO",
                      data_ora: "2026-07-20T18:30:00.000Z",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({ in: checkinIn }),
      }
    })
    const people = [
      {
        profileId: "player-1",
        category: "PLAYER",
        joinedOn: null,
      },
      {
        profileId: "staff-1",
        category: "STAFF",
        joinedOn: null,
      },
    ] as ManagementPerson[]

    const result = await fetchManagementAttendance(
      { from } as unknown as SupabaseClient,
      "2026-2027",
      people,
    )

    expect(result.get("player-1")?.training).toEqual({
      present: 1,
      total: 1,
      percentage: 100,
    })
    expect(result.has("staff-1")).toBe(false)
    expect(checkinIn).toHaveBeenCalledWith("event_id", ["training-1"])
  })
})
