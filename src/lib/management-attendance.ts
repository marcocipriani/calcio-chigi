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
  /**
   * Tutti gli allenamenti della stagione, gli stessi per ogni giocatore: così i
   * pallini restano incolonnati per data. Gli slot fuori dal conteggio sono
   * NOT_JOINED (prima dell'ingresso in rosa) o KO.
   */
  recentTraining: Array<{
    eventId: string
    startsAt: string
    status: "PRESENT" | "ABSENT" | "NOT_JOINED" | "KO"
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
      const recentTraining = sortedTrainings.map(
        ({ id, startsAt }): AttendanceSummary["recentTraining"][number] => ({
          eventId: id,
          startsAt,
          status:
            person.joinedOn && startsAt.slice(0, 10) < person.joinedOn
              ? "NOT_JOINED"
              : injuredKeys.has(`${person.profileId}:${id}`)
                ? "KO"
                : // Assenza esplicita e check-in mancante valgono uguale.
                  checkinByKey.get(`${person.profileId}:${id}`) === "PRESENT"
                  ? "PRESENT"
                  : "ABSENT",
        }),
      )
      const present = recentTraining.filter(
        ({ status }) => status === "PRESENT",
      ).length
      const total = recentTraining.filter(
        ({ status }) => status === "PRESENT" || status === "ABSENT",
      ).length

      const summary: AttendanceSummary = {
        training: {
          present,
          total,
          percentage: total ? (present / total) * 100 : 0,
        },
        recentTraining,
      }

      return [person.profileId, summary]
    }),
  )
}
