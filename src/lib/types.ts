export interface Team {
    id: string;
    nome: string;
    logo_url?: string;
    slug?: string;
}
  
export interface Profile {
    id: string;
    nome?: string;
    cognome?: string;
    avatar_url?: string;
    is_manager?: boolean;
    ruolo?: string | null;
    data_nascita?: string | null;
}

export interface Attendance {
    id: number;
    event_id: string;
    user_id: string;
    profile_id?: string;
    modified_by?: string | null;
    created_at?: string;
    updated_at?: string | null;
    status: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE' | 'NON_IMPOSTATO';
    profiles?: Profile;
}

export type EventFase =
    | 'FASE_1'
    | 'FASE_2_CALCIATORI'
    | 'FASE_2_PROFESSIONISTI'
    | 'COPPA_LAZIO_PROFESSIONISTI';

export interface Event {
    id: string;
    created_at: string;
    tipo: 'ALLENAMENTO' | 'PARTITA';
    data_ora: string;
    data_fine_ora?: string | null;
    luogo: string;
    tipo_campo?: 'a8' | 'a11' | null;
    avversario?: string | null;
    gol_casa?: number | null;
    gol_ospite?: number | null;
    gol_nostri?: number | null;
    gol_avversario?: number | null;
    giocata: boolean;
    cancellato: boolean;
    note?: string | null;
    giornata?: number | null;
    fase?: EventFase | null;
    squadra_casa?: string | null;
    squadra_ospite?: string | null;
    attendance?: Attendance[];
}

export interface StandingRow {
    id: string;
    teamData: Partial<Team>;
    punti: number;
    giocate: number;
    vinte: number;
    nulle: number;
    perse: number;
    gol_fatti: number;
    gol_subiti: number;
}
