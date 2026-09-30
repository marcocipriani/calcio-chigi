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

type StubRow = Record<string, unknown>

type PageResult = { data: StubRow[] | null; error: unknown }

function pagedQuery(pages: (from: number, to: number) => PageResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (from: number, to: number) => pages(from, to)),
  }
  return query
}

function rowsPage(rows: StubRow[]) {
  return (from: number, to: number): PageResult => ({
    data: rows.slice(from, to + 1),
    error: null,
  })
}

function stubClient({
  events,
  checkins,
  injuries = [],
}: {
  events: StubRow[]
  checkins: ReturnType<typeof rowsPage>
  injuries?: StubRow[]
}) {
  const checkinQuery = pagedQuery(checkins)
  const injuryQuery = {
    in: vi.fn(async () => ({ data: injuries, error: null })),
  }
  const eventsQuery = {
    eq: vi.fn(() => eventsQuery),
    lte: vi.fn(() => eventsQuery),
    order: vi.fn(async () => ({ data: events, error: null })),
  }
  const from = vi.fn((table: string) => {
    if (table === "seasons") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "season-1" }, error: null }),
          }),
        }),
      }
    }
    if (table === "events") return { select: () => eventsQuery }
    if (table === "authenticated_injury_periods") {
      return { select: () => injuryQuery }
    }
    return { select: () => checkinQuery }
  })

  return {
    injuryQuery,
    checkinQuery,
    client: { from } as unknown as SupabaseClient,
    eventsQuery,
  }
}

describe("fetchManagementAttendance", () => {
  it("counts trainings only, skips staff and drops the injury days", async () => {
    const { injuryQuery, checkinQuery, client, eventsQuery } = stubClient({
      events: [
        { id: "training-1", data_ora: "2026-07-20T18:30:00.000Z" },
        { id: "training-2", data_ora: "2026-07-23T18:30:00.000Z" },
      ],
      checkins: rowsPage([
        { event_id: "training-1", profile_id: "player-1", status: "PRESENT" },
      ]),
      injuries: [
        { profile_id: "player-1", started_on: "2026-07-23", ended_on: null },
      ],
    })
    const people = [
      { profileId: "player-1", category: "PLAYER", joinedOn: null },
      { profileId: "staff-1", category: "STAFF", joinedOn: null },
    ] as ManagementPerson[]

    const result = await fetchManagementAttendance(client, "2026-2027", people)

    expect(result.get("player-1")?.training).toEqual({
      present: 1,
      total: 1,
      all: 2,
      percentage: 100,
    })
    expect(result.has("staff-1")).toBe(false)
    expect(eventsQuery.eq.mock.calls).toEqual([
      ["season_id", "season-1"],
      ["tipo", "ALLENAMENTO"],
      ["cancellato", false],
    ])
    expect(checkinQuery.in).toHaveBeenCalledWith("event_id", [
      "training-1",
      "training-2",
    ])
    expect(checkinQuery.in).toHaveBeenCalledWith("profile_id", ["player-1"])
    expect(injuryQuery.in).toHaveBeenCalledWith("profile_id", ["player-1"])
  })

  it("paginates check-ins deterministically and includes the second page", async () => {
    const events = Array.from({ length: 501 }, (_, index) => ({
      id: `training-${String(index + 1).padStart(4, "0")}`,
      data_ora: new Date(Date.UTC(2025, 0, index + 1, 18, 30)).toISOString(),
    }))
    const checkins = events.flatMap(({ id }, eventIndex) => [
      {
        event_id: id,
        profile_id: "player-1",
        status: eventIndex === events.length - 1 ? "PRESENT" : "ABSENT",
      },
      { event_id: id, profile_id: "player-2", status: "PRESENT" },
    ])
    const { checkinQuery, client } = stubClient({
      events,
      checkins: rowsPage(checkins),
    })
    const people = [
      { profileId: "player-1", category: "PLAYER", joinedOn: null },
      { profileId: "player-2", category: "PLAYER", joinedOn: null },
      { profileId: "staff-1", category: "STAFF", joinedOn: null },
    ] as ManagementPerson[]

    const result = await fetchManagementAttendance(client, "2026-2027", people)

    expect(result.get("player-1")?.training).toEqual({
      present: 1,
      total: 501,
      all: 501,
      percentage: 0.19960079840319359,
    })
    expect(result.get("player-1")?.recentTraining.at(-1)).toEqual({
      eventId: "training-0501",
      startsAt: events[500].data_ora,
      status: "PRESENT",
    })
    expect(checkinQuery.order.mock.calls).toEqual([
      ["event_id", { ascending: true }],
      ["profile_id", { ascending: true }],
      ["event_id", { ascending: true }],
      ["profile_id", { ascending: true }],
    ])
    expect(checkinQuery.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it("rejects instead of returning partial attendance when a later page fails", async () => {
    const pageError = new Error("second page unavailable")
    const fullPage = Array.from({ length: 1000 }, () => ({
      event_id: "training-1",
      profile_id: "player-1",
      status: "PRESENT",
    }))
    const { client } = stubClient({
      events: [{ id: "training-1", data_ora: "2026-07-20T18:30:00.000Z" }],
      checkins: (from) =>
        from === 0
          ? { data: fullPage, error: null }
          : { data: null, error: pageError },
    })

    await expect(
      fetchManagementAttendance(client, "2026-2027", [
        { profileId: "player-1", category: "PLAYER", joinedOn: null },
      ] as ManagementPerson[]),
    ).rejects.toBe(pageError)
  })
})
