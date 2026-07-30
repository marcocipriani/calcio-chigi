export type AttendanceEvent = {
  id: string
  type: "ALLENAMENTO" | "PARTITA"
  startsAt: string
}

export type AttendanceCheckin = {
  eventId: string
  profileId: string
  status: "PRESENT" | "ABSENT"
}

export type AttendanceRate = {
  present: number
  total: number
  percentage: number
}

export type AttendanceSummary = {
  training: AttendanceRate
  matches: AttendanceRate
  recentTraining: Array<{
    eventId: string
    startsAt: string
    status: "PRESENT" | "ABSENT" | "MISSING"
  }>
}

type AttendancePerson = {
  profileId: string
  joinedOn: string | null
}

function attendanceRate(
  events: AttendanceEvent[],
  profileId: string,
  checkinByKey: Map<string, AttendanceCheckin["status"]>,
): AttendanceRate {
  const recorded = events
    .map((event) => checkinByKey.get(`${profileId}:${event.id}`))
    .filter((status): status is AttendanceCheckin["status"] => Boolean(status))
  const present = recorded.filter((status) => status === "PRESENT").length
  const total = recorded.length
  return { present, total, percentage: total ? (present / total) * 100 : 0 }
}

export function aggregateManagementAttendance(
  people: AttendancePerson[],
  events: AttendanceEvent[],
  checkins: AttendanceCheckin[],
) {
  const checkinByKey = new Map(
    checkins.map((row) => [`${row.profileId}:${row.eventId}`, row.status]),
  )
  const trainingByDate = events
    .filter(({ type }) => type === "ALLENAMENTO")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return new Map(
    people.map((person) => {
      const eligible = events.filter(
        ({ startsAt }) =>
          !person.joinedOn || startsAt.slice(0, 10) >= person.joinedOn,
      )
      const latestTraining = trainingByDate
        .filter(
          ({ startsAt }) =>
            !person.joinedOn || startsAt.slice(0, 10) >= person.joinedOn,
        )
        .slice(-8)

      const summary: AttendanceSummary = {
        training: attendanceRate(
          eligible.filter(({ type }) => type === "ALLENAMENTO"),
          person.profileId,
          checkinByKey,
        ),
        matches: attendanceRate(
          eligible.filter(({ type }) => type === "PARTITA"),
          person.profileId,
          checkinByKey,
        ),
        recentTraining: latestTraining.map((event) => ({
          eventId: event.id,
          startsAt: event.startsAt,
          status: checkinByKey.get(`${person.profileId}:${event.id}`) ?? "MISSING",
        })),
      }

      return [person.profileId, summary]
    }),
  )
}
