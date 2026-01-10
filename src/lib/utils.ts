import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Event, Team, StandingRow } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const calculateStandings = (teams: Team[], matches: Event[]): StandingRow[] => {
    const stats: Record<string, StandingRow> = {};

    teams.forEach(team => {
      stats[team.nome] = {
        id: team.id.toString(),
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

    return Object.values(stats).sort((a, b) => {
      if (b.punti !== a.punti) return b.punti - a.punti;
      const diffA = a.gol_fatti - a.gol_subiti;
      const diffB = b.gol_fatti - b.gol_subiti;
      if (diffB !== diffA) return diffB - diffA;
      return b.gol_fatti - a.gol_fatti;
    });
};