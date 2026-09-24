import type { SupabaseClient } from "@supabase/supabase-js"

import {
  parseJerseyChoices,
  type JerseyAssignment,
  type JerseyChoice,
} from "@/lib/jersey-numbers"

export type JerseyBoardRow = {
  membershipId: string
  profileId: string
  nome: string
  cognome: string
  avatarUrl: string | null
  role: string | null
  jerseyNumber: number | null
  uniformSize: string | null
  previousJerseyNumber: number | null
  choices: JerseyChoice[]
  noPreference: boolean
  // null finché il giocatore non ha risposto.
  updatedAt: string | null
  updatedByManager: boolean
}

export type JerseyDraft = {
  seasonId: string
  assignment: JerseyAssignment
  publishedAt: string
  confirmedAt: string | null
}

export type OwnJerseyPreferences = {
  choices: JerseyChoice[]
  noPreference: boolean
  avoidNumbers: number[]
  updatedAt: string
}

export type JerseyPreferenceVersion = {
  membershipId: string
  versionOn: string
  choices: JerseyChoice[]
  noPreference: boolean
  avoidNumbers: number[]
  updatedBy: string | null
}

export type JerseyHistoryEntry = {
  seasonId: string
  seasonName: string
  startsOn: string
  jerseyNumber: number | null
}

type UnknownRow = Record<string, unknown>

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null
}

function asText(value: unknown) {
  return typeof value === "string" ? value : null
}

function asNumbers(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : []
}

export async function fetchJerseyBoard(
  client: SupabaseClient,
  seasonId: string,
): Promise<JerseyBoardRow[]> {
  const { data, error } = await client
    .from("jersey_preference_board")
    .select(
      "membership_id, profile_id, nome, cognome, avatar_url, role, jersey_number, uniform_size, previous_jersey_number, choices, no_preference, updated_at, updated_by_manager",
    )
    .eq("season_id", seasonId)
    .order("cognome", { ascending: true })
  if (error) throw error

  return ((data ?? []) as UnknownRow[]).map((row) => ({
    membershipId: String(row.membership_id),
    profileId: String(row.profile_id),
    nome: String(row.nome ?? ""),
    cognome: String(row.cognome ?? ""),
    avatarUrl: asText(row.avatar_url),
    role: asText(row.role),
    jerseyNumber: asNumber(row.jersey_number),
    uniformSize: asText(row.uniform_size),
    previousJerseyNumber: asNumber(row.previous_jersey_number),
    choices: parseJerseyChoices(row.choices),
    noPreference: row.no_preference === true,
    updatedAt: asText(row.updated_at),
    updatedByManager: row.updated_by_manager === true,
  }))
}

export async function fetchJerseyDraft(
  client: SupabaseClient,
  seasonId: string,
): Promise<JerseyDraft | null> {
  const { data, error } = await client
    .from("jersey_assignment_drafts")
    .select("season_id, assignments, published_at, confirmed_at")
    .eq("season_id", seasonId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const assignment: JerseyAssignment = {}
  for (const item of (data.assignments ?? []) as UnknownRow[]) {
    assignment[String(item.membership_id)] = asNumber(item.jersey_number)
  }
  return {
    seasonId: String(data.season_id),
    assignment,
    publishedAt: String(data.published_at),
    confirmedAt: asText(data.confirmed_at),
  }
}

export async function fetchOwnJerseyPreferences(
  client: SupabaseClient,
  membershipId: string,
): Promise<OwnJerseyPreferences | null> {
  const { data, error } = await client
    .from("jersey_preferences")
    .select("choices, no_preference, avoid_numbers, updated_at")
    .eq("membership_id", membershipId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    choices: parseJerseyChoices(data.choices),
    noPreference: data.no_preference === true,
    avoidNumbers: asNumbers(data.avoid_numbers),
    updatedAt: String(data.updated_at),
  }
}

/** Numeri da evitare di tutta la stagione: leggibili solo dal manager. */
export async function fetchSeasonAvoidedNumbers(
  client: SupabaseClient,
  membershipIds: string[],
): Promise<Map<string, number[]>> {
  if (!membershipIds.length) return new Map()
  const { data, error } = await client
    .from("jersey_preferences")
    .select("membership_id, avoid_numbers")
    .in("membership_id", membershipIds)
  if (error) throw error
  return new Map(
    ((data ?? []) as UnknownRow[]).map((row) => [
      String(row.membership_id),
      asNumbers(row.avoid_numbers),
    ]),
  )
}

export async function fetchJerseyPreferenceVersions(
  client: SupabaseClient,
  membershipIds: string[],
): Promise<JerseyPreferenceVersion[]> {
  if (!membershipIds.length) return []
  const { data, error } = await client
    .from("jersey_preference_versions")
    .select(
      "membership_id, version_on, choices, no_preference, avoid_numbers, updated_by",
    )
    .in("membership_id", membershipIds)
    .order("version_on", { ascending: false })
  if (error) throw error
  return ((data ?? []) as UnknownRow[]).map((row) => ({
    membershipId: String(row.membership_id),
    versionOn: String(row.version_on),
    choices: parseJerseyChoices(row.choices),
    noPreference: row.no_preference === true,
    avoidNumbers: asNumbers(row.avoid_numbers),
    updatedBy: asText(row.updated_by),
  }))
}

export async function saveJerseyPreferences(
  client: SupabaseClient,
  seasonId: string,
  choices: JerseyChoice[],
  avoidNumbers: number[],
  noPreference: boolean,
  // Solo manager: salva al posto di questo giocatore.
  membershipId?: string,
) {
  const { error } = await client.rpc("save_jersey_preferences", {
    p_season_id: seasonId,
    p_choices: noPreference ? [] : choices,
    p_avoid_numbers: avoidNumbers,
    p_no_preference: noPreference,
    ...(membershipId ? { p_membership_id: membershipId } : {}),
  })
  if (error) throw error
}

function assignmentPayload(assignment: JerseyAssignment) {
  return Object.entries(assignment).map(([membershipId, jerseyNumber]) => ({
    membership_id: membershipId,
    jersey_number: jerseyNumber,
  }))
}

export async function publishJerseyDraft(
  client: SupabaseClient,
  seasonId: string,
  assignment: JerseyAssignment,
) {
  const { error } = await client.rpc("publish_jersey_draft", {
    p_season_id: seasonId,
    p_assignments: assignmentPayload(assignment),
  })
  if (error) throw error
}

export async function saveUniformSize(
  client: SupabaseClient,
  membershipId: string,
  uniformSize: string,
) {
  const { error } = await client
    .from("season_memberships")
    .update({ uniform_size: uniformSize.trim() || null })
    .eq("id", membershipId)
  if (error) throw error
}

export type OwnUniformSize = {
  current: string | null
  previous: string | null
}

export async function fetchOwnUniformSize(
  client: SupabaseClient,
  profileId: string,
  seasonId: string,
): Promise<OwnUniformSize> {
  const { data, error } = await client
    .from("season_memberships")
    .select("season_id, uniform_size, seasons(starts_on)")
    .eq("profile_id", profileId)
  if (error) throw error

  const rows = ((data ?? []) as UnknownRow[]).map((row) => ({
    seasonId: String(row.season_id),
    size: asText(row.uniform_size),
    startsOn: asText((row.seasons as UnknownRow | null)?.starts_on) ?? "",
  }))
  const current = rows.find((row) => row.seasonId === seasonId)
  const previous = rows
    .filter((row) => current && row.startsOn < current.startsOn && row.size)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]
  return { current: current?.size ?? null, previous: previous?.size ?? null }
}

export async function saveOwnUniformSize(
  client: SupabaseClient,
  membershipId: string,
  uniformSize: string,
) {
  const { error } = await client.rpc("save_own_uniform_size", {
    p_membership_id: membershipId,
    p_uniform_size: uniformSize,
  })
  if (error) throw error
}

export async function confirmJerseyDraft(
  client: SupabaseClient,
  seasonId: string,
) {
  const { error } = await client.rpc("confirm_jersey_draft", {
    p_season_id: seasonId,
  })
  if (error) throw error
}

export async function sendJerseyPreferenceReminder(
  client: SupabaseClient,
  seasonId: string,
): Promise<number> {
  const { data, error } = await client.rpc("send_jersey_preference_reminder", {
    p_season_id: seasonId,
  })
  if (error) throw error
  return Number(data ?? 0)
}

/**
 * Numeri ufficiali stagione per stagione: la fonte è la membership di ogni
 * stagione, esposta dalla directory pubblica dei giocatori.
 */
export async function fetchJerseyHistory(
  client: SupabaseClient,
  profileId: string,
): Promise<JerseyHistoryEntry[]> {
  const [
    { data: rows, error: rowsError },
    { data: seasons, error: seasonsError },
  ] = await Promise.all([
    client
      .from("public_season_player_directory")
      .select("season_id, jersey_number")
      .eq("profile_id", profileId),
    client.from("seasons").select("id, name, starts_on"),
  ])
  if (rowsError) throw rowsError
  if (seasonsError) throw seasonsError

  const seasonsById = new Map(
    ((seasons ?? []) as UnknownRow[]).map((season) => [
      String(season.id),
      season,
    ]),
  )
  return ((rows ?? []) as UnknownRow[])
    .flatMap((row) => {
      const season = seasonsById.get(String(row.season_id))
      if (!season) return []
      return [
        {
          seasonId: String(row.season_id),
          seasonName: String(season.name ?? ""),
          startsOn: String(season.starts_on ?? ""),
          jerseyNumber: asNumber(row.jersey_number),
        },
      ]
    })
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn))
}
