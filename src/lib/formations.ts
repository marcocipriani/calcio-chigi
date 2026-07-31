import { format, subMinutes } from "date-fns"
import { it } from "date-fns/locale"

import { FORMATIONS } from "@/lib/constants"
import { isU35At } from "@/lib/utils"

type FormationEvent = {
  data_ora: string | null
  luogo?: string | null
  squadra_casa?: string | null
  squadra_ospite?: string | null
  avversario?: string | null
}

type FormationMessagePlayer = {
  nome: string
  cognome: string
  role?: string | null
  birthDate?: string | null
  isStarter: boolean
}

export type PersonalFormationEntry = {
  nome: string
  cognome: string
  positionKey: string
}

type U35QuotaEntry = {
  birthDate?: string | null
  positionKey: string
  role?: string | null
}

export function isFormationBenchSlot(positionKey: string): boolean {
  return /^P[1-9]$/.test(positionKey)
}

export function u35Quota(entries: U35QuotaEntry[], matchDate: Date) {
  const eligible = entries.filter(
    ({ birthDate, positionKey, role }) =>
      positionKey !== "POR" &&
      role?.toUpperCase() !== "PORTIERE" &&
      isU35At(birthDate, matchDate),
  )
  const field = eligible.filter(
    ({ positionKey }) => !isFormationBenchSlot(positionKey),
  ).length
  const total = eligible.length
  const fieldExceeded = field > 3
  const totalExceeded = total > 4
  return {
    field,
    total,
    fieldExceeded,
    totalExceeded,
    exceeded: fieldExceeded || totalExceeded,
  }
}

export function isUnderPlayer(
  birthDate: string | null | undefined,
  matchDate: Date,
) {
  return isU35At(birthDate, matchDate)
}

function opponent(event: FormationEvent) {
  if (event.avversario) return event.avversario
  return event.squadra_casa?.toLocaleLowerCase("it").includes("chigi")
    ? event.squadra_ospite
    : event.squadra_casa
}

function playerLine(
  player: FormationMessagePlayer,
  matchDate: Date,
) {
  const badges: string[] = []
  if (player.role === "PORTIERE") badges.push("PORTIERE")
  if (isUnderPlayer(player.birthDate, matchDate)) {
    badges.push("UNDER")
  }
  return `${player.nome} ${player.cognome}${
    badges.length ? ` [${badges.join(" · ")}]` : ""
  }`
}

export function buildOfficialFormationMessage(
  event: FormationEvent,
  players: FormationMessagePlayer[],
) {
  if (!event.data_ora) return "Partita senza data."

  const matchDate = new Date(event.data_ora)
  const meetingDate = subMinutes(matchDate, 45)
  const starters = players.filter(({ isStarter }) => isStarter)
  const bench = players.filter(({ isStarter }) => !isStarter)
  const lines = (group: FormationMessagePlayer[]) =>
    group.length
      ? group.map((player) => playerLine(player, matchDate)).join("\n")
      : "Da definire"

  return `⚽ INFO PARTITA per ${format(matchDate, "EEEE d MMMM", {
    locale: it,
  })} vs ${opponent(event) ?? "avversario da definire"}

📍 DOVE E QUANDO:
Ritrovo ore ${format(meetingDate, "HH:mm")} – ${event.luogo ?? "campo da definire"}
Calcio d’inizio ore ${format(matchDate, "HH:mm")}

🔴⚪️ DIVISA:
Portate entrambe le divise complete (maglia, pantaloncino, calze) per sicurezza

🟢 TITOLARI:
${lines(starters)}

🪑 PANCHINA:
${lines(bench)}

Ci vediamo al campo! 💪`
}

export function buildPersonalFormationMessage(
  module: string,
  shirtColor: string,
  entries: PersonalFormationEntry[],
): string {
  const roleBySlot = new Map(
    (FORMATIONS[module] ?? []).map(({ id, role }) => [id, role]),
  )
  const groups = [
    { role: "PT", title: "🧤 PORTIERE" },
    { role: "DIF", title: "🛡️ DIFESA" },
    { role: "CEN", title: "⚙️ CENTROCAMPO" },
    { role: "ATT", title: "🎯 ATTACCO" },
    { role: "BENCH", title: "🪑 PANCHINA" },
  ]
  const sections = groups.flatMap(({ role, title }) => {
    const players = entries.filter(({ positionKey }) =>
      role === "BENCH"
        ? isFormationBenchSlot(positionKey)
        : roleBySlot.get(positionKey) === role,
    )
    return players.length
      ? [
          `${title}\n${players
            .map(({ nome, cognome }) => `${nome} ${cognome}`)
            .join("\n")}`,
        ]
      : []
  })
  const shirt = shirtColor === "ROSSA" ? "🔴 Maglia rossa" : "🔵 Maglia blu"

  return `⚽ LA MIA FORMAZIONE · ${module}\n\n${sections.join("\n\n")}\n\n${shirt}`
}
