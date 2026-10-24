import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { differenceInYears, isAfter, isValid, parseISO } from "date-fns"
import { Event, EventType, Team, StandingRow } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getAge = (dob?: string | null) => dob ? differenceInYears(new Date(), new Date(dob)) : null;

export function ageGroupAt(
  birthDate: string | null | undefined,
  referenceDate: Date,
): "U35" | "OVER_35" | null {
  if (!birthDate || !isValid(referenceDate)) return null
  const parsedBirthDate = parseISO(birthDate)
  if (!isValid(parsedBirthDate) || isAfter(parsedBirthDate, referenceDate)) {
    return null
  }
  return differenceInYears(referenceDate, parsedBirthDate) < 35
    ? "U35"
    : "OVER_35"
}

export const isU35At = (
  birthDate: string | null | undefined,
  referenceDate: Date,
) => ageGroupAt(birthDate, referenceDate) === "U35"

// Team names arrive UPPERCASE from the sync script but teams.nome may be stored in any case:
// normalize both sides so the standings/form never silently drop matches on a casing mismatch.
export const normKey = (s?: string | null) => (s ?? '').toLowerCase().trim();

export const isMatchEvent = (tipo?: EventType | null) => tipo === 'PARTITA' || tipo === 'AMICHEVOLE';

export const isChigi = (team?: string | null) => normKey(team).includes('chigi');

// Stesso filtro di fetchCalendarEvents: tutti gli allenamenti e amichevoli, solo le partite Chigi.
// Senza, un INSERT realtime di un'altra partita del torneo (es. durante il sync) finirebbe in calendario.
const isChigiCalendarEvent = (e: Event) =>
    e.tipo !== 'PARTITA' || isChigi(e.squadra_casa) || isChigi(e.squadra_ospite);

const byDate = (a: Event, b: Event) => new Date(a.data_ora ?? 0).getTime() - new Date(b.data_ora ?? 0).getTime();

export type CalendarChange = { eventType: string; new: Event; old: Partial<Event> };

/** Calendario dopo un cambio realtime su events: un UPDATE può far entrare o uscire un evento dal filtro. */
export function applyCalendarChange(events: Event[], { eventType, new: next, old }: CalendarChange) {
    if (eventType === 'DELETE') return events.filter(e => e.id !== old.id);
    if (eventType !== 'INSERT' && eventType !== 'UPDATE') return events;
    const others = events.filter(e => e.id !== next.id);
    if (!isChigiCalendarEvent(next)) return others.length === events.length ? events : others;
    const current = events.find(e => e.id === next.id);
    return [...others, { ...current, ...next }].sort(byDate);
}

type OpponentFields = Pick<Event, 'avversario' | 'squadra_casa' | 'squadra_ospite'>;

// La squadra che non è Chigi; senza squadre (amichevoli, eventi a mano) vale `avversario`.
export const opponentOf = (event: OpponentFields) =>
    (isChigi(event.squadra_casa) ? event.squadra_ospite : isChigi(event.squadra_ospite) ? event.squadra_casa : null) ||
    event.avversario ||
    null;

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
    PARTITA: 'Partita',
    AMICHEVOLE: 'Amichevole',
    ALLENAMENTO: 'Allenamento',
};

export const HOME_PLACE = 'SS Romulea';

// Il nostro campo sempre primo, poi alfabetico; varianti di maiuscole collassate.
export const sortPlaces = (places: (string | null | undefined)[]) => {
    const unique = new Map<string, string>();
    for (const place of places) {
        const trimmed = place?.trim();
        if (trimmed && !unique.has(normKey(trimmed))) unique.set(normKey(trimmed), trimmed);
    }
    unique.delete(normKey(HOME_PLACE));
    return [HOME_PLACE, ...[...unique.values()].sort((a, b) => a.localeCompare(b, 'it'))];
};

function buildMiniStats(teamNames: string[], matches: Event[]) {
    const mini: Record<string, { punti: number; diff: number; golFatti: number }> = {};
    teamNames.forEach(n => (mini[normKey(n)] = { punti: 0, diff: 0, golFatti: 0 }));

    matches.forEach(m => {
        if (!m.giocata || !m.squadra_casa || !m.squadra_ospite) return;
        const casa = normKey(m.squadra_casa);
        const ospite = normKey(m.squadra_ospite);
        if (!mini[casa] || !mini[ospite]) return;

        const golCasa = Number(m.gol_casa) || 0;
        const golOspite = Number(m.gol_ospite) || 0;

        mini[casa].golFatti += golCasa;
        mini[ospite].golFatti += golOspite;
        mini[casa].diff += golCasa - golOspite;
        mini[ospite].diff += golOspite - golCasa;

        if (golCasa > golOspite) {
            mini[casa].punti += 3;
        } else if (golCasa < golOspite) {
            mini[ospite].punti += 3;
        } else {
            mini[casa].punti += 1;
            mini[ospite].punti += 1;
        }
    });

    return mini;
}

export const calculateStandings = (teams: Team[], matches: Event[]): StandingRow[] => {
    const stats: Record<string, StandingRow> = {};

    teams.forEach(team => {
        stats[normKey(team.nome)] = {
            id: team.id,
            teamData: team,
            punti: 0,
            giocate: 0,
            vinte: 0,
            nulle: 0,
            perse: 0,
            gol_fatti: 0,
            gol_subiti: 0,
        };
    });

    matches.forEach(match => {
        if (!match.giocata || !match.squadra_casa || !match.squadra_ospite) return;

        const casa = normKey(match.squadra_casa);
        const ospite = normKey(match.squadra_ospite);
        const golCasa = Number(match.gol_casa) || 0;
        const golOspite = Number(match.gol_ospite) || 0;

        if (stats[casa] && stats[ospite]) {
            stats[casa].giocate += 1;
            stats[ospite].giocate += 1;
            stats[casa].gol_fatti += golCasa;
            stats[casa].gol_subiti += golOspite;
            stats[ospite].gol_fatti += golOspite;
            stats[ospite].gol_subiti += golCasa;

            if (golCasa > golOspite) {
                stats[casa].punti += 3;
                stats[casa].vinte += 1;
                stats[ospite].perse += 1;
            } else if (golCasa < golOspite) {
                stats[ospite].punti += 3;
                stats[ospite].vinte += 1;
                stats[casa].perse += 1;
            } else {
                stats[casa].punti += 1;
                stats[casa].nulle += 1;
                stats[ospite].punti += 1;
                stats[ospite].nulle += 1;
            }
        }
    });

    // Sort: first by punti, then apply ASI tiebreakers within tied groups
    const rows = Object.values(stats).sort((a, b) => b.punti - a.punti);
    if (rows.length === 0) return [];

    // Group consecutive rows with same punti
    const groups: StandingRow[][] = [];
    let current: StandingRow[] = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].punti === current[0].punti) {
            current.push(rows[i]);
        } else {
            groups.push(current);
            current = [rows[i]];
        }
    }
    groups.push(current);

    const result: StandingRow[] = [];
    for (const group of groups) {
        if (group.length === 1) {
            result.push(group[0]);
            continue;
        }

        // ASI tiebreaker: mini-league among tied teams
        // 1. H2H punti, 2. H2H diff reti, 3. H2H gol fatti
        // 4. Diff reti generale, 5. Gol fatti generale, 6. Alfabetico
        const names = group.map(r => r.teamData.nome).filter((n): n is string => !!n);
        const mini = buildMiniStats(names, matches);

        const sorted = [...group].sort((a, b) => {
            const mA = mini[normKey(a.teamData.nome)] ?? { punti: 0, diff: 0, golFatti: 0 };
            const mB = mini[normKey(b.teamData.nome)] ?? { punti: 0, diff: 0, golFatti: 0 };

            if (mB.punti !== mA.punti) return mB.punti - mA.punti;
            if (mB.diff !== mA.diff) return mB.diff - mA.diff;
            if (mB.golFatti !== mA.golFatti) return mB.golFatti - mA.golFatti;

            const diffA = a.gol_fatti - a.gol_subiti;
            const diffB = b.gol_fatti - b.gol_subiti;
            if (diffB !== diffA) return diffB - diffA;

            if (b.gol_fatti !== a.gol_fatti) return b.gol_fatti - a.gol_fatti;

            return (a.teamData.nome ?? '').localeCompare(b.teamData.nome ?? '');
        });

        result.push(...sorted);
    }

    return result;
};
