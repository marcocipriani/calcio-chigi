import { format, subMinutes } from "date-fns"
import { it } from "date-fns/locale"

import { FORMATIONS } from "@/lib/constants"
import type { EventType } from "@/lib/types"
import { isU35At } from "@/lib/utils"

export type MatchMessageEvent = {
  data_ora: string | null
  tipo?: EventType | null
  luogo?: string | null
  squadra_casa?: string | null
  squadra_ospite?: string | null
  avversario?: string | null
}

export type MatchMessagePlayer = {
  nome: string
  cognome: string
  role?: string | null
  birthDate?: string | null
  isStarter?: boolean
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

// Panchina P1–P12: stessa regex in publish_official_formation.
export function isFormationBenchSlot(positionKey: string): boolean {
  return /^P([1-9]|1[0-2])$/.test(positionKey)
}

// La distinta Excel ha 20 righe giocatore (titolari + P1–P9), poi lo staff:
// P10–P12 sono convocati che restano fuori distinta.
export function isOutsideDistinta(positionKey: string): boolean {
  return /^P1[0-2]$/.test(positionKey)
}

// Regolamento 2026/27: fino a 5 Under 35 convocati (portiere escluso), di cui
// al massimo 3 in campo insieme. Stesso limite in publish_official_formation.
export const U35_FIELD_MAX = 3
export const U35_SQUAD_MAX = 5

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
  const fieldExceeded = field > U35_FIELD_MAX
  const totalExceeded = total > U35_SQUAD_MAX
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

function opponent(event: MatchMessageEvent) {
  if (event.avversario) return event.avversario
  return event.squadra_casa?.toLocaleLowerCase("it").includes("chigi")
    ? event.squadra_ospite
    : event.squadra_casa
}

// Link Maps per campo, con il nome scritto come in events.luogo.
// Campo non in mappa: nel messaggio resta solo il nome.
export const FIELD_MAPS: Record<string, string> = {
  "SS Romulea": "https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9",
}

type Named = { nome?: string | null; cognome?: string | null }

// Ordine alfabetico come lo si dice a voce: "Di Mucci" prima di "D'Oria".
export const bySurname = (left: Named, right: Named) =>
  (left.cognome ?? "").localeCompare(right.cognome ?? "", "it", {
    ignorePunctuation: true,
  }) ||
  (left.nome ?? "").localeCompare(right.nome ?? "", "it", {
    ignorePunctuation: true,
  })

export function buildMatchMessage(
  event: MatchMessageEvent,
  players: MatchMessagePlayer[],
  { lineup, shirtColor }: { lineup: boolean; shirtColor?: string | null },
) {
  if (!event.data_ora) return "Partita senza data."

  const matchDate = new Date(event.data_ora)
  const tipo = event.tipo ?? "PARTITA"
  const line = (player: MatchMessagePlayer) => {
    // La quota Under 35 vale solo in torneo e non conta i portieri.
    const tag =
      player.role?.toUpperCase() === "PORTIERE"
        ? " (POR)"
        : tipo === "PARTITA" && isU35At(player.birthDate, matchDate)
          ? " (U35)"
          : ""
    return `${player.nome} ${player.cognome}${tag}`
  }
  const block = (title: string, group: MatchMessagePlayer[], empty: string) =>
    `${title}\n${
      group.length ? [...group].sort(bySurname).map(line).join("\n") : empty
    }`
  const field = event.luogo?.trim() || "campo da definire"
  const map = FIELD_MAPS[field]
  const shirt =
    shirtColor === "ROSSA"
      ? "🔴 Maglia rossa"
      : shirtColor
        ? "🔵 Maglia blu"
        : null

  return [
    `⚽ INFO ${tipo} per ${format(matchDate, "EEEE dd MMMM", {
      locale: it,
    })} vs ${opponent(event) ?? "avversario da definire"}`,
    `📍 ${field}${map ? ` ${map}` : ""}\n🕘 Ritrovo ${format(
      subMinutes(matchDate, 60),
      "HH:mm",
    )}, Calcio d’inizio ${format(matchDate, "HH:mm")}`,
    shirt,
    lineup
      ? [
          block(
            "🟢 TITOLARI:",
            players.filter(({ isStarter }) => isStarter),
            "Da definire",
          ),
          block(
            "🪑 PANCHINA:",
            players.filter(({ isStarter }) => !isStarter),
            "Da definire",
          ),
        ].join("\n\n")
      : block("📋 CONVOCATI:", players, "Ancora nessun convocato."),
  ]
    .filter(Boolean)
    .join("\n\n")
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
