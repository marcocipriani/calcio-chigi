import { romeDateKey } from "@/lib/season"
import { isMatchEvent } from "@/lib/utils"
import type { EventType } from "@/lib/types"

// Modalità partita: logica pura su sessione e cronaca.
// Spec: docs/superpowers/specs/2026-10-24-modalita-partita-design.md

export type MatchStatus = "FIRST_HALF" | "HALFTIME" | "SECOND_HALF" | "FINISHED"

export type MatchLineup = {
  module: string
  starters: { profileId: string; positionKey: string }[]
  bench: string[]
}

export type MatchSession = {
  eventId: string
  status: MatchStatus
  periodMinutes: number
  periodStartedAt: string
  addedMinutes: number
  timeoutUsed: boolean
  lineup: MatchLineup
  scoreOurs: number
  scoreTheirs: number
  operatorProfileId: string | null
  operatorSince: string
  operatorName: string | null
  finishedAt: string | null
}

export type TimelineKind =
  | "PERIOD_START"
  | "PERIOD_END"
  | "GOAL"
  | "OWN_GOAL_FOR"
  | "UNATTRIBUTED_GOAL"
  | "GOAL_AGAINST"
  | "YELLOW"
  | "RED"
  | "SUB"

export type TimelineEntry = {
  id: string
  kind: TimelineKind
  period: 1 | 2
  minute: number
  stoppage: number
  occurredAt: string
  profileId: string | null
  assistProfileId: string | null
  subInProfileId: string | null
  playerName: string | null
  assistName: string | null
  subInName: string | null
}

const HALFTIME_SECONDS = 15 * 60
export const RECOVERY_CHIPS_FROM_MINUTE = 30

const OUR_GOALS: TimelineKind[] = ["GOAL", "OWN_GOAL_FOR", "UNATTRIBUTED_GOAL"]

const pad = (value: number) => String(value).padStart(2, "0")

export function minuteLabel(minute: number, stoppage: number) {
  return stoppage > 0 ? `${minute}+${stoppage}'` : `${minute}'`
}

/**
 * Orologio derivato dall'istante d'inizio del tempo: regge a schermo bloccato
 * e app riaperta. Minuto alla maniera del calcio: a 0:00–0:59 è il 1'.
 */
export function periodClock(session: MatchSession, now: Date) {
  const elapsed = Math.max(
    0,
    Math.floor((now.getTime() - new Date(session.periodStartedAt).getTime()) / 1000),
  )
  if (session.status === "HALFTIME") {
    return {
      period: null,
      seconds: elapsed,
      minute: session.periodMinutes,
      stoppage: 0,
      display: "Intervallo",
      halftimeRemaining: Math.max(0, HALFTIME_SECONDS - elapsed),
    }
  }
  if (session.status === "FINISHED") {
    return { period: null, seconds: 0, minute: 0, stoppage: 0, display: "Finale", halftimeRemaining: null }
  }

  const period: 1 | 2 = session.status === "FIRST_HALF" ? 1 : 2
  const baseMinutes = period === 1 ? 0 : session.periodMinutes
  const seconds = baseMinutes * 60 + elapsed
  const inPeriod = Math.floor(elapsed / 60) + 1
  const stoppage = Math.max(0, inPeriod - session.periodMinutes)
  return {
    period,
    seconds,
    minute: baseMinutes + inPeriod - stoppage,
    stoppage,
    display: `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`,
    halftimeRemaining: null,
  }
}

export function formatCountdown(seconds: number) {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

export function scoreOf(timeline: TimelineEntry[]) {
  return {
    ours: timeline.filter(({ kind }) => OUR_GOALS.includes(kind)).length,
    theirs: timeline.filter(({ kind }) => kind === "GOAL_AGAINST").length,
  }
}

const byTime = (left: TimelineEntry, right: TimelineEntry) =>
  left.occurredAt.localeCompare(right.occurredAt)

export type FieldState = {
  onField: Record<string, string | null>
  bench: string[]
  expelled: Set<string>
  subbedIn: Map<string, string>
  subbedOut: Map<string, string>
  yellows: Map<string, number>
  goals: Map<string, number>
}

/** Chi è in campo e in panchina adesso, a partire dal calcio d'inizio. */
export function fieldState(lineup: MatchLineup, timeline: TimelineEntry[]): FieldState {
  const onField: Record<string, string | null> = Object.fromEntries(
    lineup.starters.map(({ positionKey, profileId }) => [positionKey, profileId]),
  )
  let bench = [...lineup.bench]
  const state: FieldState = {
    onField,
    bench,
    expelled: new Set(),
    subbedIn: new Map(),
    subbedOut: new Map(),
    yellows: new Map(),
    goals: new Map(),
  }
  const positionOf = (profileId: string) =>
    Object.keys(onField).find((key) => onField[key] === profileId)
  const increment = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

  for (const entry of [...timeline].sort(byTime)) {
    const player = entry.profileId
    if (!player) continue
    const label = minuteLabel(entry.minute, entry.stoppage)
    if (entry.kind === "SUB" && entry.subInProfileId) {
      const position = positionOf(player)
      if (!position) continue
      onField[position] = entry.subInProfileId
      bench = [...bench.filter((id) => id !== entry.subInProfileId), player]
      state.subbedOut.set(player, label)
      state.subbedIn.set(entry.subInProfileId, label)
      state.subbedOut.delete(entry.subInProfileId)
    } else if (entry.kind === "RED") {
      const position = positionOf(player)
      // L'espulso lascia il posto vuoto: si gioca in dieci.
      if (position) onField[position] = null
      bench = bench.filter((id) => id !== player)
      state.expelled.add(player)
    } else if (entry.kind === "YELLOW") {
      increment(state.yellows, player)
    } else if (entry.kind === "GOAL") {
      increment(state.goals, player)
    }
  }
  state.bench = bench
  return state
}

function periodBounds(timeline: TimelineEntry[]) {
  const find = (kind: TimelineKind, period: 1 | 2) =>
    timeline.find((entry) => entry.kind === kind && entry.period === period)?.occurredAt ?? null
  return {
    start1: find("PERIOD_START", 1),
    end1: find("PERIOD_END", 1),
    start2: find("PERIOD_START", 2),
    end2: find("PERIOD_END", 2),
  }
}

/** Cambi del tempo corrente; nell'intervallo contano solo quelli dell'intervallo. */
export function substitutionsInPeriod(timeline: TimelineEntry[], status: MatchStatus) {
  const { end1, start2 } = periodBounds(timeline)
  return timeline.filter((entry) => {
    if (entry.kind !== "SUB") return false
    if (status === "FIRST_HALF") return !end1 || entry.occurredAt <= end1
    if (status === "HALFTIME") {
      return Boolean(end1) && entry.occurredAt > end1! && (!start2 || entry.occurredAt < start2)
    }
    return Boolean(start2) && entry.occurredAt >= start2!
  }).length
}

/** Limiti del regolamento ASI; le amichevoli non ne hanno. */
export function substitutionLimit(tipo: EventType | null | undefined, status: MatchStatus) {
  if (tipo !== "PARTITA") return null
  if (status === "FIRST_HALF") return 3
  if (status === "SECOND_HALF") return 7
  return null
}

export type MatchSummaryPlayer = {
  profileId: string
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  minutesPlayed: number
}

export type MatchSummary = {
  golNostri: number
  golAvversario: number
  opponentOwnGoals: number
  unattributedGoals: number
  players: MatchSummaryPlayer[]
}

/**
 * Riepilogo del fischio finale. I minuti si contano sugli istanti reali,
 * dentro i due tempi: l'intervallo non conta, il recupero sì.
 */
export function buildSummary(
  lineup: MatchLineup,
  timeline: TimelineEntry[],
  finishedAt: Date,
): MatchSummary {
  const sorted = [...timeline].sort(byTime)
  const { start1, end1, start2, end2 } = periodBounds(sorted)
  const periods: [number, number][] = []
  if (start1) periods.push([Date.parse(start1), end1 ? Date.parse(end1) : finishedAt.getTime()])
  if (start2) periods.push([Date.parse(start2), end2 ? Date.parse(end2) : finishedAt.getTime()])

  const enteredAt = new Map<string, number>()
  const played = new Map<string, number>()
  const close = (profileId: string, at: number) => {
    const from = enteredAt.get(profileId)
    if (from === undefined) return
    enteredAt.delete(profileId)
    let ms = 0
    for (const [start, end] of periods) {
      ms += Math.max(0, Math.min(end, at) - Math.max(start, from))
    }
    played.set(profileId, (played.get(profileId) ?? 0) + ms)
  }

  const kickoff = start1 ? Date.parse(start1) : finishedAt.getTime()
  const appeared = new Set<string>()
  for (const { profileId } of lineup.starters) {
    enteredAt.set(profileId, kickoff)
    appeared.add(profileId)
  }
  for (const entry of sorted) {
    const at = Date.parse(entry.occurredAt)
    if (entry.kind === "SUB" && entry.profileId && entry.subInProfileId) {
      close(entry.profileId, at)
      enteredAt.set(entry.subInProfileId, at)
      appeared.add(entry.subInProfileId)
    } else if (entry.kind === "RED" && entry.profileId) {
      close(entry.profileId, at)
    }
  }
  for (const profileId of [...enteredAt.keys()]) close(profileId, finishedAt.getTime())

  const count = (kind: TimelineKind, profileId: string, field: "profileId" | "assistProfileId" = "profileId") =>
    sorted.filter((entry) => entry.kind === kind && entry[field] === profileId).length
  const score = scoreOf(sorted)

  return {
    golNostri: score.ours,
    golAvversario: score.theirs,
    opponentOwnGoals: sorted.filter(({ kind }) => kind === "OWN_GOAL_FOR").length,
    unattributedGoals: sorted.filter(({ kind }) => kind === "UNATTRIBUTED_GOAL").length,
    players: [...appeared].map((profileId) => ({
      profileId,
      goals: count("GOAL", profileId),
      assists: count("GOAL", profileId, "assistProfileId"),
      yellowCards: count("YELLOW", profileId),
      redCards: count("RED", profileId),
      minutesPlayed: Math.round((played.get(profileId) ?? 0) / 60_000),
    })),
  }
}

type MatchModeEvent = { tipo?: EventType | null; cancellato?: boolean | null; data_ora?: string | null }

/** Il pulsante compare il giorno della partita (a Roma) e finché la sessione è aperta. */
export function canOpenMatchMode(
  event: MatchModeEvent,
  now: Date,
  session: Pick<MatchSession, "status"> | null,
) {
  if (!isMatchEvent(event.tipo) || event.cancellato) return false
  if (session) return session.status !== "FINISHED"
  return Boolean(event.data_ora) && romeDateKey(new Date(event.data_ora!)) === romeDateKey(now)
}

/** Minuto da registrare su un evento: nell'intervallo vale come inizio ripresa. */
export function eventMoment(session: MatchSession, now: Date) {
  if (session.status === "HALFTIME") {
    return { period: 2 as const, minute: session.periodMinutes, stoppage: 0 }
  }
  const clock = periodClock(session, now)
  return { period: (clock.period ?? 2) as 1 | 2, minute: clock.minute, stoppage: clock.stoppage }
}

const REPORT_ICON: Partial<Record<TimelineKind, string>> = {
  GOAL: "⚽",
  OWN_GOAL_FOR: "⚽",
  UNATTRIBUTED_GOAL: "⚽",
  GOAL_AGAINST: "⚽",
  YELLOW: "🟨",
  RED: "🟥",
  SUB: "🔁",
}

/** Chi ha fatto cosa, come si legge in cronaca e nel messaggio WhatsApp. */
export function describeEntry(entry: TimelineEntry, opponent: string) {
  switch (entry.kind) {
    case "GOAL":
      return `${entry.playerName ?? "Goal"}${entry.assistName ? ` (assist ${entry.assistName})` : ""}`
    case "OWN_GOAL_FOR":
      return "Autogol avversario"
    case "UNATTRIBUTED_GOAL":
      return "Goal Chigi"
    case "GOAL_AGAINST":
      return opponent
    case "SUB":
      return `${entry.subInName ?? "?"} per ${entry.playerName ?? "?"}`
    default:
      return entry.playerName ?? ""
  }
}

/** Cronaca da incollare su WhatsApp, in ordine di gioco. */
export function buildMatchReport(opponent: string, timeline: TimelineEntry[]) {
  const score = scoreOf(timeline)
  const lines = [...timeline].sort(byTime).flatMap((entry) => {
    const icon = REPORT_ICON[entry.kind]
    if (!icon) return []
    return [`${minuteLabel(entry.minute, entry.stoppage)} ${icon} ${describeEntry(entry, opponent)}`]
  })
  return [`⚽ CHIGI ${score.ours}-${score.theirs} ${opponent.toUpperCase()}`, "", ...lines].join("\n")
}
