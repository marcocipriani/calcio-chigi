import { isInjuredOn, type InjuryPeriod } from "@/lib/injuries"
import { romeDateKey } from "@/lib/season"

export type AttendanceEvent = {
  id: string
  startsAt: string
}

export type AttendanceCheckin = {
  eventId: string
  profileId: string
  status: "PRESENT" | "ABSENT"
}

export type AttendanceRate = {
  present: number
  /** Allenamenti senza KO: il denominatore della percentuale. */
  total: number
  /** Tutti gli allenamenti dall'ingresso in squadra, KO compresi. */
  all: number
  percentage: number
}

export type AttendanceSummary = {
  training: AttendanceRate
  /**
   * Tutti gli allenamenti della stagione, gli stessi per ogni giocatore: così i
   * pallini restano incolonnati per data. Gli slot fuori dal conteggio sono
   * NOT_JOINED (prima dell'ingresso in rosa) o KO (dentro un infortunio).
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
 * l'ingresso in rosa, esclusi i giorni di infortunio. La presenza reale batte
 * il KO. Le partite non entrano nel conteggio.
 */
export function aggregateManagementAttendance(
  people: AttendancePerson[],
  trainings: AttendanceEvent[],
  checkins: AttendanceCheckin[],
  injuries: InjuryPeriod[] = [],
) {
  const checkinByKey = new Map(
    checkins.map((row) => [`${row.profileId}:${row.eventId}`, row.status]),
  )
  // Il giorno è quello di Roma, come nei periodi di infortunio.
  const sortedTrainings = [...trainings]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((training) => ({
      ...training,
      day: romeDateKey(new Date(training.startsAt)),
    }))

  return new Map(
    people.map((person) => {
      const ownInjuries = injuries.filter(
        ({ profileId }) => profileId === person.profileId,
      )
      const recentTraining = sortedTrainings.map(
        ({ id, startsAt, day }): AttendanceSummary["recentTraining"][number] => ({
          eventId: id,
          startsAt,
          status:
            person.joinedOn && day < person.joinedOn
              ? "NOT_JOINED"
              : checkinByKey.get(`${person.profileId}:${id}`) === "PRESENT"
                ? "PRESENT"
                : isInjuredOn(ownInjuries, day)
                  ? "KO"
                  : // Assenza esplicita e check-in mancante valgono uguale.
                    "ABSENT",
        }),
      )
      const count = (status: AttendanceSummary["recentTraining"][number]["status"]) =>
        recentTraining.filter((item) => item.status === status).length
      const present = count("PRESENT")
      const total = present + count("ABSENT")

      const summary: AttendanceSummary = {
        training: {
          present,
          total,
          all: total + count("KO"),
          percentage: total ? (present / total) * 100 : 0,
        },
        recentTraining,
      }

      return [person.profileId, summary]
    }),
  )
}
