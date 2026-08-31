import type { EventFase } from "@/lib/types"

export type PhaseFilter = EventFase | "ALL"

export type SeasonOption = {
  slug: "2026-2027" | "2025-2026"
  label: string
  attendanceAvailable: boolean
}

export type PlayerSeasonStat = {
  season_id: string
  phase_key: EventFase
  profile_id: string
  goals: number
  assists: number | null
  mvp: number
  yellow_cards: number
  red_cards: number
}

export type SeasonPlayerDirectoryEntry = {
  season_id: string
  profile_id: string
  nome: string
  cognome: string
  avatar_url: string | null
  role: string | null
  jersey_number: number | null
}

export type SafePlayerProfile = SeasonPlayerDirectoryEntry & {
  goals: number
  assists: number | null
  mvp: number
  yellow_cards: number
  red_cards: number
}

export const SEASON_OPTIONS = [
  {
    slug: "2026-2027",
    label: "Campionato ASI Over35 2026/2027",
    attendanceAvailable: true,
  },
  {
    slug: "2025-2026",
    label: "Campionato ASI Over35 2025/2026",
    attendanceAvailable: false,
  },
] as const satisfies readonly SeasonOption[]

const PHASES: readonly EventFase[] = [
  "FASE_1",
  "FASE_2_CALCIATORI",
  "FASE_2_PROFESSIONISTI",
  "COPPA_LAZIO_PROFESSIONISTI",
]

const PHASE_LABELS: Record<PhaseFilter, string> = {
  ALL: "Tutte le fasi",
  FASE_1: "Fase 1",
  FASE_2_CALCIATORI: "Fase 2 Calciatori",
  FASE_2_PROFESSIONISTI: "Fase 2 Professionisti",
  COPPA_LAZIO_PROFESSIONISTI: "Coppa Lazio Professionisti",
}

export type SeasonPhaseRow = {
  season_id: string
  fase?: EventFase | null
  phase_key?: EventFase | null
}

export function phaseOptionsForSeason(
  seasonId: string,
  rows: readonly SeasonPhaseRow[],
) {
  const available = new Set(
    rows
      .filter((row) => row.season_id === seasonId)
      .map((row) => row.phase_key ?? row.fase ?? "FASE_1"),
  )

  return (["ALL", ...PHASES.filter((phase) => available.has(phase))] as const)
    .map((value) => ({ value, label: PHASE_LABELS[value] }))
}

export function aggregateSeasonStats(
  rows: readonly Pick<
    PlayerSeasonStat,
    "goals" | "assists" | "mvp" | "yellow_cards" | "red_cards"
  >[],
) {
  return {
    goals: rows.reduce((total, row) => total + row.goals, 0),
    assists: rows.some((row) => row.assists === null)
      ? null
      : rows.reduce((total, row) => total + (row.assists ?? 0), 0),
    mvp: rows.reduce((total, row) => total + row.mvp, 0),
    yellow_cards: rows.reduce((total, row) => total + row.yellow_cards, 0),
    red_cards: rows.reduce((total, row) => total + row.red_cards, 0),
  }
}

/**
 * Percentuali che valgono la medaglia in /statistiche: le prime tre distinte,
 * contando solo chi ha almeno una presenza. I pari merito la ricevono tutti,
 * chi è a zero presenze non la riceve mai.
 */
export function medalPercentages(
  rows: readonly { present: number; percentage: number }[],
) {
  return [
    ...new Set(
      rows
        .filter(({ present }) => present > 0)
        .map(({ percentage }) => percentage),
    ),
  ]
    .sort((left, right) => right - left)
    .slice(0, 3)
}
