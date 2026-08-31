export type AttendanceEvent = {
  id: string
  startsAt: string
}

export type AttendanceCheckin = {
  eventId: string
  profileId: string
  status: "PRESENT" | "ABSENT"
}

/** Allenamento in cui il giocatore si è dichiarato KO: esce dal conteggio. */
export type AttendanceInjury = {
  eventId: string
  profileId: string
}

export type AttendanceRate = {
  present: number
  total: number
  percentage: number
}

export type AttendanceSummary = {
  training: AttendanceRate
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

/**
 * Presenze ufficiali: numeratore = check-in PRESENT del manager, denominatore =
 * tutti gli allenamenti della stagione (già filtrati a non annullati) dopo
 * l'ingresso in rosa, esclusi quelli in cui il giocatore si era dichiarato KO.
 * Le partite non entrano nel conteggio.
 */
export function aggregateManagementAttendance(
  people: AttendancePerson[],
  trainings: AttendanceEvent[],
  checkins: AttendanceCheckin[],
  injuries: AttendanceInjury[] = [],
) {
  const checkinByKey = new Map(
    checkins.map((row) => [`${row.profileId}:${row.eventId}`, row.status]),
  )
  const injuredKeys = new Set(
    injuries.map(({ profileId, eventId }) => `${profileId}:${eventId}`),
  )
  const sortedTrainings = [...trainings].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )

  return new Map(
    people.map((person) => {
      const eligible = sortedTrainings.filter(
        ({ id, startsAt }) =>
          (!person.joinedOn || startsAt.slice(0, 10) >= person.joinedOn) &&
          !injuredKeys.has(`${person.profileId}:${id}`),
      )
      const present = eligible.filter(
        ({ id }) => checkinByKey.get(`${person.profileId}:${id}`) === "PRESENT",
      ).length

      const summary: AttendanceSummary = {
        training: {
          present,
          total: eligible.length,
          percentage: eligible.length ? (present / eligible.length) * 100 : 0,
        },
        recentTraining: eligible.slice(-8).map((event) => ({
          eventId: event.id,
          startsAt: event.startsAt,
          status:
            checkinByKey.get(`${person.profileId}:${event.id}`) ?? "MISSING",
        })),
      }

      return [person.profileId, summary]
    }),
  )
}
