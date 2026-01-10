"use client"

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function ClassificaPage() {
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id, nome, logo_url, slug');

        const { data: matchesData } = await supabase
          .from('events')
          .select('*')
          .eq('tipo', 'PARTITA')
          .eq('giocata', true)
          .order('data_ora', { ascending: false });

        if (teamsData && matchesData) {
          setMatches(matchesData);
          const calculatedStandings = calculateStandings(teamsData, matchesData);
          setStandings(calculatedStandings);
        }
      } catch (error) {
        console.error("Errore fetch:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const calculateStandings = (teams: any[], matches: any[]) => {
    const stats: Record<string, any> = {};

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

  const getForm = (teamName: string) => {
      const teamMatches = matches.filter(m => 
          m.squadra_casa === teamName || m.squadra_ospite === teamName
      ).slice(0, 3);

      return teamMatches.map(m => {
          let result = 'N'; 
          const golCasa = Number(m.gol_casa);
          const golOspite = Number(m.gol_ospite);

          if (m.squadra_casa === teamName) {
              if (golCasa > golOspite) result = 'V';
              else if (golCasa < golOspite) result = 'P';
          } else {
              if (golOspite > golCasa) result = 'V';
              else if (golOspite < golCasa) result = 'P';
          }
          return { 
            result, 
            date: m.data_ora, 
            score: `${golCasa}-${golOspite}`, 
            opponent: m.squadra_casa === teamName ? m.squadra_ospite : m.squadra_casa 
          };
      });
  };

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="container max-w-5xl mx-auto p-1 pb-24">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <TooltipProvider>
        <div className="overflow-x-auto">
            <Table>
            <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-slate-800">
                <TableHead className="w-[10px] font-bold text-center text-[10px] uppercase">#</TableHead>
                <TableHead className="font-bold text-xs uppercase min-w-[140px]">Squadra</TableHead>

                <TableHead className="text-center font-black text-sm text-foreground bg-muted/20">Pt</TableHead>
                <TableHead className="text-center text-[11px] font-bold">G</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-emerald-600">V</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-amber-600">N</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-red-600">P</TableHead>
                
                <TableHead className="text-center text-[11px] font-bold border-r-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50">%V</TableHead>
                
                <TableHead className="text-center text-[11px] font-bold text-blue-500">GF</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-orange-500">GS</TableHead>
                
                <TableHead className="text-center text-[11px] font-bold border-r">+/-</TableHead>
                
                <TableHead className="text-center text-[10px] uppercase min-w-[110px]">Forma</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {standings.map((row, index) => {
                const isMyTeam = row.teamData.slug === 'chigi';
                const diff = row.gol_fatti - row.gol_subiti;
                const winPct = row.giocate > 0 ? Math.round((row.vinte / row.giocate) * 100) : 0;
                const form = getForm(row.teamData.nome);

                return (
                    <TableRow key={row.id} className={`border-b border-slate-100 dark:border-slate-800 ${isMyTeam ? 'bg-amber-50/50 dark:bg-amber-900/10 border-l-4 border-l-amber-500' : ''}`}>
                    <TableCell className="text-center text-sm text-muted-foreground p-2 font-medium">{index + 1}</TableCell>
                    <TableCell className="p-2">
                        <div className="flex items-center gap-3">
                        <Avatar className="h-7 w-7 border bg-white"><AvatarImage src={row.teamData.logo_url} className="object-contain" /><AvatarFallback>{row.teamData.nome[0]}</AvatarFallback></Avatar>
                        <span className={`text-xs font-bold uppercase ${isMyTeam ? 'text-amber-600' : ''}`}>{row.teamData.nome}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-center font-black text-lg bg-muted/5">{row.punti}</TableCell>
                    <TableCell className="text-center text-sm font-medium">{row.giocate}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.vinte}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.nulle}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.perse}</TableCell>
                    
                    <TableCell className="text-center p-1 border-r-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                        <Badge variant="secondary" className={`text-[10px] h-5 border-0 font-bold ${winPct >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                            {winPct}%
                        </Badge>
                    </TableCell>

                    <TableCell className="text-center text-sm text-muted-foreground">{row.gol_fatti}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.gol_subiti}</TableCell>
                    
                    <TableCell className={`text-center text-sm font-bold border-r ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : ''}`}>{diff > 0 ? `+${diff}` : diff}</TableCell>
                    
                    <TableCell className="p-2">
                        <div className="flex items-center justify-center gap-1.5">
                            {form.map((m, i) => {
                                let colorClass = "bg-slate-100 text-slate-400 border-slate-200";
                                if (m.result === 'V') colorClass = "bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
                                if (m.result === 'N') colorClass = "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
                                if (m.result === 'P') colorClass = "bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800";

                                return (
                                    <Tooltip key={i}>
                                        <TooltipTrigger>
                                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-black cursor-help border ${colorClass}`}>
                                                {m.result}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="text-xs">
                                            <div className="text-center">
                                                <p className="font-bold text-[10px] uppercase opacity-70 mb-1">{format(new Date(m.date), 'dd MMM', { locale: it })}</p>
                                                <p className="font-black mb-0.5">{m.score}</p>
                                                <p className="text-[10px] truncate max-w-[100px]">vs {m.opponent}</p>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                )
                            })}
                            {[...Array(3 - form.length)].map((_, i) => (
                              <div key={`empty-${i}`} className="h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 opacity-50"></div>
                            ))}
                        </div>
                    </TableCell>
                    </TableRow>
                );
                })}
            </TableBody>
            </Table>
        </div>
        </TooltipProvider>
      </div>
    </div>
  );
}