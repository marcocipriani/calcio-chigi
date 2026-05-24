import type { SupabaseClient } from '@supabase/supabase-js'
import type { Event, Team, EventFase, FullProfile } from './types'

// ─── Return types ─────────────────────────────────────────────────────────────

export type UserContext = {
    isManager: boolean
    profileId: string | null
    defaultView?: string | null
}

export type AttendanceRow = {
    profile_id: string
    status: string | null
    created_at: string | null
    updated_at: string | null
    modified_by: string | null
}

export type Comunicato = {
    id: string
    titolo: string
    data: string | null
    enjore_url: string
}

// ─── Auth / User context ───────────────────────────────────────────────────────

/**
 * Returns manager status, profile ID, and default view for the authenticated user.
 * Returns defaults (isManager: false, profileId: null) when not logged in.
 */
export async function getUserContext(supabase: SupabaseClient): Promise<UserContext> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { isManager: false, profileId: null, defaultView: null }

    const { data } = await supabase
        .from('profiles')
        .select('id, is_manager, default_view')
        .eq('user_id', user.id)
        .maybeSingle()

    return {
        isManager: data?.is_manager ?? false,
        profileId: data?.id ?? null,
        defaultView: data?.default_view ?? null,
    }
}

/**
 * Fetches the complete profile row for the authenticated user.
 * Returns null when not logged in or no profile exists.
 */
export async function fetchOwnProfile(supabase: SupabaseClient): Promise<FullProfile | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

    return data ?? null
}

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Fetches all Chigi events (matches + trainings) for the home calendar,
 * including attendance preview. Ordered ascending by date.
 */
export async function fetchCalendarEvents(supabase: SupabaseClient): Promise<Event[]> {
    const { data, error } = await supabase
        .from('events')
        .select('*, attendance (status, profiles:profiles!attendance_profile_id_fkey (cognome, avatar_url))')
        .or('squadra_casa.ilike.%chigi%,squadra_ospite.ilike.%chigi%,tipo.neq.PARTITA')
        .order('data_ora', { ascending: true })

    if (error) { console.error('fetchCalendarEvents:', error); return [] }
    return data ?? []
}

/**
 * Fetches a single event by ID.
 */
export async function fetchEventById(supabase: SupabaseClient, id: string): Promise<Event | null> {
    const { data } = await supabase.from('events').select('*').eq('id', id).single()
    return data ?? null
}

/**
 * Fetches all matches across all phases for the torneo page (unfiltered).
 */
export async function fetchAllMatches(supabase: SupabaseClient): Promise<Event[]> {
    const { data } = await supabase
        .from('events')
        .select('*')
        .eq('tipo', 'PARTITA')
        .order('data_ora', { ascending: true })
    return data ?? []
}

/**
 * Fetches matches for a specific phase (for standings/classifica).
 * FASE_1 includes rows where fase IS NULL (legacy data).
 */
export async function fetchMatchesByPhase(supabase: SupabaseClient, fase: EventFase): Promise<Event[]> {
    let query = supabase.from('events').select('*').eq('tipo', 'PARTITA')

    if (fase !== 'FASE_1') {
        query = query.eq('fase', fase)
    } else {
        query = query.or('fase.eq.FASE_1,fase.is.null')
    }

    const { data } = await query.order('data_ora', { ascending: false })
    return data ?? []
}

/**
 * Fetches all matches for a specific giornata.
 */
export async function fetchMatchesByGiornata(supabase: SupabaseClient, giornata: number): Promise<Event[]> {
    const { data } = await supabase
        .from('events')
        .select('*')
        .eq('tipo', 'PARTITA')
        .eq('giornata', giornata)
        .order('data_ora', { ascending: true })
    return data ?? []
}

/**
 * Returns the distinct sorted list of giornate that have matches.
 */
export async function fetchAvailableGiornate(supabase: SupabaseClient): Promise<string[]> {
    const { data } = await supabase
        .from('events')
        .select('giornata')
        .eq('tipo', 'PARTITA')
        .not('giornata', 'is', null)
        .order('giornata', { ascending: true })

    if (!data) return []
    return Array.from(new Set(data.map(d => d.giornata?.toString()))).filter(Boolean) as string[]
}

/**
 * Fetches the next upcoming Chigi match (nearest future date).
 * Returns null when no upcoming match exists.
 */
export async function fetchNextChigiMatch(supabase: SupabaseClient): Promise<Event | null> {
    const now = new Date().toISOString()
    const { data } = await supabase
        .from('events')
        .select('*')
        .eq('tipo', 'PARTITA')
        .gte('data_ora', now)
        .order('data_ora', { ascending: true })
        .limit(1)
        .single()
    return data ?? null
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

/**
 * Fetches the full roster (all profiles), ordered by cognome.
 */
export async function fetchAllPlayers(supabase: SupabaseClient): Promise<FullProfile[]> {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('cognome', { ascending: true })
    return data ?? []
}

/**
 * Fetches a minimal roster for the event detail page
 * (id, nome, cognome, ruolo, avatar_url, data_nascita, is_staff).
 */
export async function fetchRosterForEvent(supabase: SupabaseClient): Promise<Pick<FullProfile, 'id' | 'nome' | 'cognome' | 'ruolo' | 'avatar_url' | 'data_nascita' | 'is_staff'>[]> {
    const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, ruolo, avatar_url, data_nascita, is_staff')
        .order('cognome')
    return data ?? []
}

// ─── Teams ────────────────────────────────────────────────────────────────────

/**
 * Fetches all teams with full fields.
 */
export async function fetchTeams(supabase: SupabaseClient): Promise<Team[]> {
    const { data } = await supabase.from('teams').select('id, nome, logo_url, slug')
    return data ?? []
}

/**
 * Fetches the logo URL for a team by partial name match.
 */
export async function fetchTeamLogoByName(supabase: SupabaseClient, name: string): Promise<string | null> {
    const { data } = await supabase
        .from('teams')
        .select('logo_url')
        .ilike('nome', `%${name}%`)
        .maybeSingle()
    return data?.logo_url ?? null
}

// ─── Attendance ───────────────────────────────────────────────────────────────

/**
 * Fetches all attendance rows for a specific event.
 */
export async function fetchAttendanceForEvent(supabase: SupabaseClient, eventId: string): Promise<AttendanceRow[]> {
    const { data } = await supabase
        .from('attendance')
        .select('profile_id, status, created_at, updated_at, modified_by')
        .eq('event_id', eventId)
    return data ?? []
}

// ─── Comunicati ───────────────────────────────────────────────────────────────

/**
 * Fetches official comunicati ordered by date descending.
 */
export async function fetchComunicati(supabase: SupabaseClient): Promise<Comunicato[]> {
    const { data } = await supabase
        .from('comunicati')
        .select('id, titolo, data, enjore_url')
        .order('data', { ascending: false })
    return data ?? []
}
