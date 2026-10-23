// Regolamento ASI: un rosso squalifica per la gara successiva; ogni terza
// ammonizione (in gare diverse) anche. Con due gialli si è diffidati.
// ponytail: conta solo le statistiche registrate in app (match_player_stats).

export type DisciplineRow = {
  profileId: string
  eventDate: string
  yellow: number
  red: number
}

export type DisciplineStatus = "DIFFIDATO" | "SQUALIFICATO"

/** Stato disciplinare per la prossima partita, dalle partite di campionato già giocate. */
export function disciplineByPlayer(rows: DisciplineRow[]) {
  const result = new Map<string, DisciplineStatus>()
  if (rows.length === 0) return result
  const lastMatch = rows.reduce((last, row) => (row.eventDate > last ? row.eventDate : last), rows[0].eventDate)

  const byPlayer = new Map<string, DisciplineRow[]>()
  for (const row of rows) byPlayer.set(row.profileId, [...(byPlayer.get(row.profileId) ?? []), row])

  for (const [profileId, matches] of byPlayer) {
    const sorted = [...matches].sort((left, right) => left.eventDate.localeCompare(right.eventDate))
    const yellows = sorted.reduce((sum, row) => sum + row.yellow, 0)
    const last = sorted.at(-1)!
    const yellowsBefore = yellows - (last.eventDate === lastMatch ? last.yellow : 0)
    const reachedThird = last.eventDate === lastMatch && Math.floor(yellows / 3) > Math.floor(yellowsBefore / 3)
    if (last.eventDate === lastMatch && (last.red > 0 || reachedThird)) {
      result.set(profileId, "SQUALIFICATO")
    } else if (yellows % 3 === 2) {
      result.set(profileId, "DIFFIDATO")
    }
  }
  return result
}
