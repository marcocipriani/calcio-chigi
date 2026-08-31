import { describe, expect, it } from "vitest"

import { aggregateManagementAttendance } from "@/lib/management-attendance"

describe("aggregateManagementAttendance", () => {
  it("counts every training after the join date and keeps missing checkins as absences", () => {
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: "2026-07-08" }],
      [
        { id: "old", startsAt: "2026-07-01T18:00:00Z" },
        { id: "t1", startsAt: "2026-07-10T18:00:00Z" },
        { id: "t2", startsAt: "2026-07-13T18:00:00Z" },
      ],
      [
        { eventId: "old", profileId: "p1", status: "PRESENT" },
        { eventId: "t1", profileId: "p1", status: "PRESENT" },
      ],
    ).get("p1")

    expect(result?.training).toEqual({
      present: 1,
      total: 2,
      percentage: 50,
    })
    expect(result?.recentTraining.map(({ status }) => status)).toEqual([
      "PRESENT",
      "MISSING",
    ])
  })

  it("drops the trainings the player declared KO for", () => {
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: null }],
      [
        { id: "t1", startsAt: "2026-07-10T18:00:00Z" },
        { id: "t2", startsAt: "2026-07-13T18:00:00Z" },
        { id: "t3", startsAt: "2026-07-17T18:00:00Z" },
      ],
      [{ eventId: "t1", profileId: "p1", status: "PRESENT" }],
      [
        { eventId: "t2", profileId: "p1" },
        { eventId: "t3", profileId: "p1" },
      ],
    ).get("p1")

    expect(result?.training).toEqual({
      present: 1,
      total: 1,
      percentage: 100,
    })
    expect(result?.recentTraining.map(({ eventId }) => eventId)).toEqual(["t1"])
  })

  it("keeps only the latest eight trainings and renders oldest first", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
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
