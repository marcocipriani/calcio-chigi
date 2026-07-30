import { describe, expect, it } from "vitest"

import { aggregateManagementAttendance } from "@/lib/management-attendance"

describe("aggregateManagementAttendance", () => {
  it("separates training and matches, ignores missing checkins and pre-join events", () => {
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: "2026-07-08" }],
      [
        { id: "old", type: "ALLENAMENTO", startsAt: "2026-07-01T18:00:00Z" },
        { id: "t1", type: "ALLENAMENTO", startsAt: "2026-07-10T18:00:00Z" },
        { id: "t2", type: "ALLENAMENTO", startsAt: "2026-07-13T18:00:00Z" },
        { id: "m1", type: "PARTITA", startsAt: "2026-07-15T18:00:00Z" },
      ],
      [
        { eventId: "old", profileId: "p1", status: "PRESENT" },
        { eventId: "t1", profileId: "p1", status: "PRESENT" },
        { eventId: "m1", profileId: "p1", status: "ABSENT" },
      ],
    ).get("p1")

    expect(result?.training).toEqual({
      present: 1,
      total: 1,
      percentage: 100,
    })
    expect(result?.matches).toEqual({
      present: 0,
      total: 1,
      percentage: 0,
    })
    expect(result?.recentTraining.map(({ status }) => status)).toEqual([
      "PRESENT",
      "MISSING",
    ])
  })

  it("keeps only the latest eight trainings and renders oldest first", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      type: "ALLENAMENTO" as const,
      startsAt: `2026-07-${String(index + 1).padStart(2, "0")}T18:00:00Z`,
    }))
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: null }],
      events,
      [],
    ).get("p1")

    expect(result?.recentTraining.map(({ eventId }) => eventId)).toEqual([
      "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9",
    ])
  })
})
