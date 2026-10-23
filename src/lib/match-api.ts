import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  MatchLineup,
  MatchSession,
  MatchSummary,
  TimelineEntry,
  TimelineKind,
} from "@/lib/match"

type UnknownRow = Record<string, unknown>

type LineupRow = {
  module?: string
  starters?: { profile_id: string; position_key: string }[]
  bench?: string[]
}

const text = (value: unknown) => (typeof value === "string" ? value : null)

function toLineup(value: unknown): MatchLineup {
  const row = (value ?? {}) as LineupRow
  return {
    module: row.module ?? "4-4-2",
    starters: (row.starters ?? []).map(({ profile_id, position_key }) => ({
      profileId: profile_id,
      positionKey: position_key,
    })),
    bench: row.bench ?? [],
  }
}

export function lineupToRow(lineup: MatchLineup): LineupRow {
  return {
    module: lineup.module,
    starters: lineup.starters.map(({ profileId, positionKey }) => ({
      profile_id: profileId,
      position_key: positionKey,
    })),
    bench: lineup.bench,
  }
}

export function toSession(row: UnknownRow): MatchSession {
  const name = [text(row.operator_nome), text(row.operator_cognome)].filter(Boolean).join(" ")
  return {
    eventId: String(row.event_id),
    status: row.status as MatchSession["status"],
    periodMinutes: Number(row.period_minutes),
    periodStartedAt: String(row.period_started_at),
    addedMinutes: Number(row.added_minutes ?? 0),
    timeoutUsed: Boolean(row.timeout_used),
    lineup: toLineup(row.lineup),
    scoreOurs: Number(row.score_ours ?? 0),
    scoreTheirs: Number(row.score_theirs ?? 0),
    operatorProfileId: text(row.operator_profile_id),
    operatorSince: String(row.operator_since),
    operatorName: name || null,
    finishedAt: text(row.finished_at),
  }
}

export function toEntry(row: UnknownRow): TimelineEntry {
  return {
    id: String(row.id),
    kind: row.kind as TimelineKind,
    period: Number(row.period) === 2 ? 2 : 1,
    minute: Number(row.minute),
    stoppage: Number(row.stoppage ?? 0),
    occurredAt: String(row.occurred_at),
    profileId: text(row.profile_id),
    assistProfileId: text(row.assist_profile_id),
    subInProfileId: text(row.sub_in_profile_id),
    playerName: text(row.player_cognome),
    assistName: text(row.assist_cognome),
    subInName: text(row.sub_in_cognome),
  }
}

export async function fetchMatch(client: SupabaseClient, eventId: string) {
  const [sessionResult, timelineResult] = await Promise.all([
    client.from("public_match_sessions").select("*").eq("event_id", eventId).maybeSingle(),
    client
      .from("public_match_timeline")
      .select("*")
      .eq("event_id", eventId)
      .order("occurred_at", { ascending: true }),
  ])
  if (sessionResult.error) throw sessionResult.error
  if (timelineResult.error) throw timelineResult.error
  return {
    session: sessionResult.data ? toSession(sessionResult.data) : null,
    timeline: ((timelineResult.data ?? []) as UnknownRow[]).map(toEntry),
  }
}

export async function fetchLiveSessions(client: SupabaseClient) {
  const { data, error } = await client
    .from("public_match_sessions")
    .select("*")
    .neq("status", "FINISHED")
  if (error) throw error
  return ((data ?? []) as UnknownRow[]).map(toSession)
}

async function rpcSession(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data as UnknownRow
}

export const startMatch = (
  client: SupabaseClient,
  eventId: string,
  periodMinutes: number,
  lineup: MatchLineup,
) =>
  rpcSession(client, "match_start", {
    p_event_id: eventId,
    p_period_minutes: periodMinutes,
    p_lineup: lineupToRow(lineup),
  })

export const takeControl = (client: SupabaseClient, eventId: string) =>
  rpcSession(client, "match_take_control", { p_event_id: eventId })

export const advancePeriod = (client: SupabaseClient, eventId: string) =>
  rpcSession(client, "match_advance_period", { p_event_id: eventId })

export const updateClock = (
  client: SupabaseClient,
  eventId: string,
  change: { addedMinutes?: number; timeoutUsed?: boolean; startShiftSeconds?: number },
) =>
  rpcSession(client, "match_update_clock", {
    p_event_id: eventId,
    p_added_minutes: change.addedMinutes ?? null,
    p_timeout_used: change.timeoutUsed ?? null,
    p_start_shift_seconds: change.startShiftSeconds ?? null,
  })

export const voidEntry = (client: SupabaseClient, eventId: string, entryId: string) =>
  rpcSession(client, "match_void", { p_event_id: eventId, p_timeline_id: entryId })

export const finishMatch = (client: SupabaseClient, eventId: string, summary: MatchSummary) =>
  rpcSession(client, "match_finish", {
    p_event_id: eventId,
    p_summary: {
      gol_nostri: summary.golNostri,
      gol_avversario: summary.golAvversario,
      opponent_own_goals: summary.opponentOwnGoals,
      unattributed_goals: summary.unattributedGoals,
      players: summary.players.map((player) => ({
        profile_id: player.profileId,
        goals: player.goals,
        assists: player.assists,
        yellow_cards: player.yellowCards,
        red_cards: player.redCards,
        minutes_played: player.minutesPlayed,
      })),
    },
  })

export type RecordAction = {
  id: string
  eventId: string
  kind: Exclude<TimelineKind, "PERIOD_START" | "PERIOD_END">
  period: 1 | 2
  minute: number
  stoppage: number
  occurredAt: string
  profileId: string | null
  assistProfileId: string | null
  subInProfileId: string | null
}

export async function recordEntry(client: SupabaseClient, action: RecordAction) {
  const { error } = await client.rpc("match_record", {
    p_id: action.id,
    p_event_id: action.eventId,
    p_kind: action.kind,
    p_period: action.period,
    p_minute: action.minute,
    p_stoppage: action.stoppage,
    p_occurred_at: action.occurredAt,
    p_profile_id: action.profileId,
    p_assist_profile_id: action.assistProfileId,
    p_sub_in_profile_id: action.subInProfileId,
  })
  return error
}

/** Messaggio utente per gli errori noti delle RPC. */
export function matchErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
  if (message.includes("MATCH_CONTROL_LOST")) return "Un altro manager ha preso il controllo della partita."
  if (message.includes("MATCH_ALREADY_STARTED")) return "La partita è già stata avviata da un altro manager."
  if (message.includes("MATCH_FINISHED")) return "La partita è già chiusa."
  return message
}
