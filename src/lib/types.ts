export interface Team {
    id: number;
    nome: string;
    logo_url?: string;
    slug?: string;
}
  
export interface Profile {
    id: string;
    nome?: string;
    avatar_url?: string;
    is_manager?: boolean;
}

export interface Attendance {
    id: number;
    event_id: number;
    user_id: string;
    status: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE' | 'NON_IMPOSTATO';
    profiles?: Profile;
}

export interface Event {
    id: number;
    created_at: string;
    tipo: 'ALLENAMENTO' | 'PARTITA';
    data_ora: string;
    data_fine_ora?: string | null;
    luogo: string;
    tipo_campo?: 'a8' | 'a11' | null;
    avversario?: string | null;
    gol_casa?: number | null;
    gol_ospite?: number | null;
    giocata: boolean;
    cancellato: boolean;
    note?: string | null;
    giornata?: number | null;
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