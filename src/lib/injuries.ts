import type { SupabaseClient } from "@supabase/supabase-js"

/** Giorni di KO, estremi inclusi. `endedOn` null = ancora fermo. */
export type InjuryPeriod = {
  profileId: string
  startedOn: string
  endedOn: string | null
}

export type Injury = InjuryPeriod & {
  id: string
  note: string | null
}

export function isInjuredOn(periods: InjuryPeriod[], day: string) {
  return periods.some(
    ({ startedOn, endedOn }) =>
      day >= startedOn && (endedOn === null || day <= endedOn),
  )
}

export function openInjury<T extends InjuryPeriod>(injuries: T[]) {
  return injuries.find(({ endedOn }) => endedOn === null)
}

function toPeriod(row: Record<string, unknown>): InjuryPeriod {
  return {
    profileId: String(row.profile_id),
    startedOn: String(row.started_on),
    endedOn: typeof row.ended_on === "string" ? row.ended_on : null,
  }
}

/** Sole date, per ogni account associato: servono a calcolare il KO. */
export async function fetchInjuryPeriods(
  client: SupabaseClient,
  profileIds?: string[],
): Promise<InjuryPeriod[]> {
  if (profileIds && !profileIds.length) return []
  const query = client
    .from("authenticated_injury_periods")
    .select("profile_id, started_on, ended_on")
  const { data, error } = await (profileIds
    ? query.in("profile_id", profileIds)
    : query)
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(toPeriod)
}

/** Storia con nota: la RLS la concede solo al giocatore stesso e ai manager. */
export async function fetchInjuries(
  client: SupabaseClient,
  profileIds: string[],
): Promise<Injury[]> {
  if (!profileIds.length) return []
  const { data, error } = await client
    .from("injuries")
    .select("id, profile_id, started_on, ended_on, note")
    .in("profile_id", profileIds)
    .order("started_on", { ascending: false })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...toPeriod(row),
    id: String(row.id),
    note: typeof row.note === "string" ? row.note : null,
  }))
}

function injuryError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return new Error("Ha già un infortunio aperto: segna prima il rientro")
  }
  if (error.code === "23514") {
    return new Error("Il rientro non può precedere l’inizio")
  }
  return new Error(error.message)
}

export async function saveInjury(
  client: SupabaseClient,
  injury: {
    id?: string
    profileId: string
    startedOn: string
    endedOn: string | null
    note: string | null
  },
) {
  const values = {
    started_on: injury.startedOn,
    ended_on: injury.endedOn || null,
    note: injury.note?.trim() || null,
  }
  const { error } = injury.id
    ? await client.from("injuries").update(values).eq("id", injury.id)
    : await client
        .from("injuries")
        .insert({ ...values, profile_id: injury.profileId })
  if (error) throw injuryError(error)
}

export async function deleteInjury(client: SupabaseClient, id: string) {
  const { error } = await client.from("injuries").delete().eq("id", id)
  if (error) throw injuryError(error)
}
