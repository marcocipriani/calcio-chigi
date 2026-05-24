import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Event, Team, StandingRow } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function buildMiniStats(teamNames: string[], matches: Event[]) {
    const mini: Record<string, { punti: number; diff: number; golFatti: number }> = {};
    teamNames.forEach(n => (mini[n] = { punti: 0, diff: 0, golFatti: 0 }));

    matches.forEach(m => {
        if (!m.squadra_casa || !m.squadra_ospite) return;
        if (!teamNames.includes(m.squadra_casa) || !teamNames.includes(m.squadra_ospite)) return;

        const golCasa = Number(m.gol_casa) || 0;
        const golOspite = Number(m.gol_ospite) || 0;

        mini[m.squadra_casa].golFatti += golCasa;
        mini[m.squadra_ospite].golFatti += golOspite;
        mini[m.squadra_casa].diff += golCasa - golOspite;
        mini[m.squadra_ospite].diff += golOspite - golCasa;

        if (golCasa > golOspite) {
            mini[m.squadra_casa].punti += 3;
        } else if (golCasa < golOspite) {
            mini[m.squadra_ospite].punti += 3;
        } else {
            mini[m.squadra_casa].punti += 1;
            mini[m.squadra_ospite].punti += 1;
        }
    });

    return mini;
}

export const calculateStandings = (teams: Team[], matches: Event[]): StandingRow[] => {
    const stats: Record<string, StandingRow> = {};

    teams.forEach(team => {
        stats[team.nome] = {
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
        if (!match.squadra_casa || !match.squadra_ospite) return;

        const casa = match.squadra_casa;
        const ospite = match.squadra_ospite;
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
            const mA = mini[a.teamData.nome ?? ''] ?? { punti: 0, diff: 0, golFatti: 0 };
            const mB = mini[b.teamData.nome ?? ''] ?? { punti: 0, diff: 0, golFatti: 0 };

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
