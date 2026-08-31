import type { SupabaseClient } from '@supabase/supabase-js'
import type { Event, Team, EventFase, FullProfile } from './types'
import type {
    PhaseFilter,
    PlayerSeasonStat,
    SafePlayerProfile,
    SeasonPlayerDirectoryEntry,
} from './season-statistics'

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
        .maybeSingle()

    return data ?? null
}

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Fetches public Chigi events (matches + trainings), without attendance or
 * profile joins. Ordered ascending by date.
 */
export async function fetchCalendarEvents(supabase: SupabaseClient): Promise<Event[]> {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .or('squadra_casa.ilike.%chigi%,squadra_ospite.ilike.%chigi%,tipo.neq.PARTITA')
        .order('data_ora', { ascending: true })

    if (error) { console.error('fetchCalendarEvents:', error); return [] }
    return data ?? []
}

/**
 * Fetches a single event by ID.
 */
export async function fetchEventById(supabase: SupabaseClient, id: string): Promise<Event | null> {
    const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
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

const SEASON_EVENT_SELECT =
    'id, created_at, season_id, tipo, data_ora, data_fine_ora, luogo, tipo_campo, avversario, gol_casa, gol_ospite, gol_nostri, gol_avversario, giocata, cancellato, note, giornata, fase, squadra_casa, squadra_ospite'

/**
 * Fetches every event attributed to one season, ordered chronologically.
 */
export async function fetchSeasonEvents(
    supabase: SupabaseClient,
    seasonId: string,
): Promise<Event[]> {
    const { data, error } = await supabase
        .from('events')
        .select(SEASON_EVENT_SELECT)
        .eq('season_id', seasonId)
        .order('data_ora', { ascending: true })

    if (error) throw error
    return (data ?? []) as Event[]
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
        .eq('cancellato', false)
        .or('squadra_casa.ilike.%chigi%,squadra_ospite.ilike.%chigi%')
        .gte('data_ora', now)
        .order('data_ora', { ascending: true })
        .limit(1)
        .maybeSingle()
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
 * Fetches the public player directory for one selected season.
 */
export async function fetchSeasonPlayerDirectory(
    supabase: SupabaseClient,
    seasonId: string,
): Promise<SeasonPlayerDirectoryEntry[]> {
    const { data, error } = await supabase
        .from('public_season_player_directory')
        .select('season_id, profile_id, nome, cognome, avatar_url, role, jersey_number')
        .eq('season_id', seasonId)
        .order('cognome', { ascending: true })
        .order('nome', { ascending: true })

    if (error) throw error
    return (data ?? []) as SeasonPlayerDirectoryEntry[]
}

/**
 * Fetches public player statistics by phase for one selected season.
 */
export async function fetchPlayerStatisticsByPhase(
    supabase: SupabaseClient,
    seasonId: string,
    phase: PhaseFilter = 'ALL',
): Promise<PlayerSeasonStat[]> {
    let query = supabase
        .from('public_player_statistics_by_phase')
        .select('season_id, phase_key, profile_id, goals, assists, mvp, yellow_cards, red_cards')
        .eq('season_id', seasonId)

    if (phase !== 'ALL') {
        query = query.eq('phase_key', phase)
    }

    const { data, error } = await query
        .order('phase_key', { ascending: true })
        .order('profile_id', { ascending: true })

    if (error) throw error
    return (data ?? []) as PlayerSeasonStat[]
}

/**
 * Fetches the approved-account-safe player profile and seasonal totals.
 */
export async function fetchSafePlayerProfile(
    supabase: SupabaseClient,
    profileId: string,
    seasonId: string,
): Promise<SafePlayerProfile | null> {
    const { data, error } = await supabase
        .rpc('get_player_profile', {
            p_profile_id: profileId,
            p_season_id: seasonId,
        })
        .maybeSingle()

    if (error) throw error
    if (!data) return null

    const profile = data as SafePlayerProfile

    return {
        profile_id: profile.profile_id,
        season_id: profile.season_id,
        nome: profile.nome,
        cognome: profile.cognome,
        avatar_url: profile.avatar_url,
        role: profile.role,
        jersey_number: profile.jersey_number,
        goals: profile.goals,
        assists: profile.assists,
        mvp: profile.mvp,
        yellow_cards: profile.yellow_cards,
        red_cards: profile.red_cards,
    }
}

/**
 * Fetches a minimal roster for the event detail page
 * (id, nome, cognome, ruolo, avatar_url, data_nascita, is_staff).
 */
export type EventRosterProfile = Pick<
    FullProfile,
    'id' | 'nome' | 'cognome' | 'ruolo' | 'avatar_url' | 'data_nascita' |
    'numero_maglia' | 'dipartimento' | 'tags' | 'is_staff'
> & {
    training_only: boolean
}

export type FormationRosterPlayer = {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    data_nascita: string | null
    ruolo: string | null
    numero_maglia: number | null
    dipartimento: string | null
    tags: string[]
    is_staff: boolean
    training_only: boolean
}

type PublicFormationRosterRow = {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    role: string | null
    jersey_number: number | null
    status: "YES"
}

/**
 * Fetches selectable players for the anonymous formation playground.
 * The public roster view deliberately excludes private profile fields.
 */
export async function fetchPublicFormationRoster(
    supabase: SupabaseClient,
): Promise<FormationRosterPlayer[]> {
    const { data, error } = await supabase
        .from("public_active_roster")
        .select("id,nome,cognome,avatar_url,role,jersey_number,status")
        .eq("status", "YES")
        .eq("category", "PLAYER")
        .order("cognome")

    if (error) throw error

    return ((data ?? []) as PublicFormationRosterRow[]).map((row) => ({
        id: row.id,
        nome: row.nome,
        cognome: row.cognome,
        avatar_url: row.avatar_url,
        data_nascita: null,
        ruolo: row.role,
        numero_maglia: row.jersey_number,
        dipartimento: null,
        tags: [],
        is_staff: false,
        training_only: false,
    }))
}

type EventRosterRpcRow = {
    profile_id: string
    nome: string
    cognome: string
    avatar_url: string | null
    data_nascita: string | null
    category: 'PLAYER' | 'STAFF'
    role: string | null
    staff_function: string | null
    jersey_number: number | null
    training_only: boolean
    department: string | null
    is_external: boolean
    is_aggregated: boolean
}

export async function fetchRosterForEvent(
    supabase: SupabaseClient,
    eventId: string,
): Promise<EventRosterProfile[]> {
    const { data, error } = await supabase.rpc('get_event_roster', {
        p_event_id: eventId,
    })
    if (error) throw error
    return ((data ?? []) as EventRosterRpcRow[]).map(row => ({
        id: row.profile_id,
        nome: row.nome,
        cognome: row.cognome,
        ruolo: row.category === 'STAFF' ? row.staff_function : row.role,
        avatar_url: row.avatar_url,
        data_nascita: row.data_nascita,
        numero_maglia: row.jersey_number,
        dipartimento: row.department,
        tags: [
            ...(row.is_external ? ['EXT'] : []),
            ...(row.is_aggregated ? ['AGG'] : []),
        ],
        is_staff: row.category === 'STAFF',
        training_only: row.training_only,
    }))
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
