import type { SupabaseClient } from "@supabase/supabase-js"

// Chigio d'Oro: votazione interna del migliore in campo. Regole e anonimato
// stanno nel DB (RPC submit_chigio_vote / close_chigio_poll); qui solo letture.

export type ChigioPoll = {
  event_id: string
  opened_at: string
  closes_at: string
  closed_at: string | null
  voters_total: number
  ballots_count: number
}

export type ChigioResult = {
  profile_id: string
  tops: number
  applause: number
  rank: number
  is_winner: boolean
}

export type ChigioBallot = { top: string | null; applause: string[] }

export type ChigioSeasonStat = {
  profile_id: string
  tipo: "PARTITA" | "AMICHEVOLE"
  wins: number
  tops: number
  applause: number
}

export type ChigioEventState = {
  poll: ChigioPoll | null
  candidates: string[]
  canVote: boolean
  ballot: ChigioBallot
  results: ChigioResult[]
}

export const EMPTY_BALLOT: ChigioBallot = { top: null, applause: [] }

// Tap: un giocatore libero prende il primo slot libero (🔝, poi 👏); 🔝 → 👏 → nessuno.
// Nessun tap toglie il voto a un altro: per cambiare 🔝 si libera prima quello attuale.
export function cyclePick(ballot: ChigioBallot, profileId: string): ChigioBallot {
  if (ballot.top === profileId) {
    if (ballot.applause.length >= 2) return { top: null, applause: ballot.applause }
    return { top: null, applause: [...ballot.applause, profileId] }
  }
  if (ballot.applause.includes(profileId)) {
    return { top: ballot.top, applause: ballot.applause.filter(id => id !== profileId) }
  }
  if (!ballot.top) return { top: profileId, applause: ballot.applause }
  if (ballot.applause.length < 2) return { top: ballot.top, applause: [...ballot.applause, profileId] }
  return ballot
}

export function isPollOpen(poll: ChigioPoll | null, now = Date.now()) {
  return !!poll && !poll.closed_at && new Date(poll.closes_at).getTime() > now
}

export async function fetchChigioEventState(
  supabase: SupabaseClient,
  eventId: string,
  myProfileId: string | null,
): Promise<ChigioEventState> {
  const { data: poll, error } = await supabase
    .from("chigio_polls")
    .select("event_id, opened_at, closes_at, closed_at, voters_total, ballots_count")
    .eq("event_id", eventId)
    .maybeSingle()
  if (error) throw error
  if (!poll) return { poll: null, candidates: [], canVote: false, ballot: EMPTY_BALLOT, results: [] }

  const [candidates, voter, ballot, results] = await Promise.all([
    supabase.from("chigio_poll_candidates").select("profile_id").eq("event_id", eventId),
    myProfileId
      ? supabase.from("chigio_poll_voters").select("profile_id").eq("event_id", eventId).eq("profile_id", myProfileId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("chigio_ballots").select("top_profile_id, applause_1, applause_2").eq("event_id", eventId).maybeSingle(),
    supabase.from("chigio_results").select("profile_id, tops, applause, rank, is_winner").eq("event_id", eventId).order("rank"),
  ])
  for (const res of [candidates, voter, ballot, results]) if (res.error) throw res.error

  const mine = ballot.data
  return {
    poll,
    candidates: (candidates.data ?? []).map(row => row.profile_id),
    canVote: !!voter.data,
    ballot: mine
      ? { top: mine.top_profile_id, applause: [mine.applause_1, mine.applause_2].filter((id): id is string => !!id) }
      : EMPTY_BALLOT,
    // Chi non ha preso voti non compare.
    results: ((results.data ?? []) as ChigioResult[]).filter(r => r.tops > 0 || r.applause > 0),
  }
}

export async function submitChigioVote(supabase: SupabaseClient, eventId: string, ballot: ChigioBallot) {
  const { error } = await supabase.rpc("submit_chigio_vote", {
    p_event_id: eventId,
    p_top_profile_id: ballot.top,
    p_applause_profile_ids: ballot.applause,
  })
  if (error) throw error
}

export async function closeChigioPoll(supabase: SupabaseClient, eventId: string) {
  const { error } = await supabase.rpc("close_chigio_poll", { p_event_id: eventId })
  if (error) throw error
}

export async function fetchChigioSeasonStats(
  supabase: SupabaseClient,
  seasonId: string,
  profileId?: string,
): Promise<ChigioSeasonStat[]> {
  let query = supabase
    .from("chigio_season_stats")
    .select("profile_id, tipo, wins, tops, applause")
    .eq("season_id", seasonId)
  if (profileId) query = query.eq("profile_id", profileId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ChigioSeasonStat[]
}

export function sortSeasonStats(stats: ChigioSeasonStat[]) {
  return [...stats].sort((a, b) => b.wins - a.wins || b.tops - a.tops || b.applause - a.applause)
}
