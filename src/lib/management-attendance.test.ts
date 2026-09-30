import { describe, expect, it } from "vitest"

import { aggregateManagementAttendance } from "@/lib/management-attendance"

describe("aggregateManagementAttendance", () => {
  it("counts every training after the join date and keeps the earlier ones as empty slots", () => {
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
      "NOT_JOINED",
      "PRESENT",
      "ABSENT",
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
    expect(result?.recentTraining.map(({ status }) => status)).toEqual([
      "PRESENT",
      "KO",
      "KO",
    ])
  })

  it("shows an explicit absence like a missing check-in", () => {
    const result = aggregateManagementAttendance(
      [{ profileId: "p1", joinedOn: null }],
      [{ id: "t1", startsAt: "2026-07-10T18:00:00Z" }],
      [{ eventId: "t1", profileId: "p1", status: "ABSENT" }],
    ).get("p1")

    expect(result?.recentTraining[0].status).toBe("ABSENT")
  })

  it("gives every player the same training columns, oldest first", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      startsAt: `2026-07-${String(index + 1).padStart(2, "0")}T18:00:00Z`,
    }))
    const result = aggregateManagementAttendance(
      [
        { profileId: "veteran", joinedOn: null },
        { profileId: "late", joinedOn: "2026-07-09" },
      ],
      [...events].reverse(),
      [],
    )

    const columns = events.map(({ id }) => id)
    expect(
      result.get("veteran")?.recentTraining.map(({ eventId }) => eventId),
    ).toEqual(columns)
    expect(
      result.get("late")?.recentTraining.map(({ eventId }) => eventId),
    ).toEqual(columns)
    expect(result.get("late")?.training.total).toBe(2)
  })
})
