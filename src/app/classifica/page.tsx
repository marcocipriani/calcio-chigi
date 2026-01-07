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
import { Loader2, Trophy } from 'lucide-react';
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function ClassificaPage() {
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // 1. Scarica la Classifica
      const { data: standingsData } = await supabase
        .from('standings')
        .select(`*, teams ( nome, logo_url, slug )`)
        .order('punti', { ascending: false })
        .order('gol_fatti', { ascending: false });

      // 2. Scarica le Partite Giocate (per calcolare la forma)
      const { data: matchesData } = await supabase
        .from('events')
        .select('squadra_casa, squadra_ospite, gol_casa, gol_ospite, data_ora')
        .eq('tipo', 'PARTITA')
        .eq('giocata', true)
        .order('data_ora', { ascending: false });

      setMatches(matchesData || []);
      setStandings(standingsData || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  // Calcola forma (V/N/P)
  const getForm = (teamName: string) => {
      const teamMatches = matches.filter(m => 
          m.squadra_casa === teamName || m.squadra_ospite === teamName
      ).slice(0, 3);

      return teamMatches.map(m => {
          let result = 'N'; // Nulle (Default)
          if (m.squadra_casa === teamName) {
              if (m.gol_casa > m.gol_ospite) result = 'V'; // Vittoria
              else if (m.gol_casa < m.gol_ospite) result = 'P'; // Persa
          } else {
              if (m.gol_ospite > m.gol_casa) result = 'V';
              else if (m.gol_ospite < m.gol_casa) result = 'P';
          }
          return { 
              result, 
              date: m.data_ora, 
              score: `${m.gol_casa}-${m.gol_ospite}`, 
              opponent: m.squadra_casa === teamName ? m.squadra_ospite : m.squadra_casa 
          };
      });
  };

  if (loading) return (
    <div className="flex justify-center items-center h-[80vh]">
        <Loader2 className="animate-spin text-primary h-8 w-8" />
    </div>
  );

  return (
    <div className="container max-w-5xl mx-auto p-2 pb-24">
      
      <div className="flex items-center gap-3 mb-6 px-2">
        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Classifica</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Girone Arti & Mestieri</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <TooltipProvider>
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-slate-800">
              <TableHead className="w-[10px] font-bold text-center text-[10px] uppercase">#</TableHead>
              <TableHead className="font-bold text-xs uppercase min-w-[140px]">Squadra</TableHead>
              
              <TableHead className="text-center font-black text-foreground text-sm bg-muted/20">PT</TableHead>
              <TableHead className="text-center text-[10px] uppercase font-bold text-muted-foreground">G</TableHead>
              <TableHead className="text-center text-[10px] uppercase font-bold text-emerald-600 hidden sm:table-cell">V</TableHead>
              <TableHead className="text-center text-[10px] uppercase font-bold text-amber-600 hidden sm:table-cell">N</TableHead>
              <TableHead className="text-center text-[10px] uppercase font-bold text-red-600 hidden sm:table-cell">P</TableHead>
              
              <TableHead className="text-center text-[10px] uppercase font-bold text-primary border-r-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">%V</TableHead>
              
              <TableHead className="text-center text-[10px] font-bold text-blue-500">GF</TableHead>
              <TableHead className="text-center text-[10px] font-bold text-orange-500">GS</TableHead>
              
              <TableHead className="text-center text-[10px] uppercase border-r-2 border-slate-200 dark:border-slate-700">+/-</TableHead>
              
              <TableHead className="text-center text-[10px] uppercase w-[100px]">Forma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((row, index) => {
              const isMyTeam = row.teams.slug === 'chigi';
              const diff = row.gol_fatti - row.gol_subiti;
              const winPct = row.giocate > 0 ? Math.round((row.vinte / row.giocate) * 100) : 0;
              const form = getForm(row.teams.nome);

              return (
                <TableRow 
                    key={row.id} 
                    className={`
                        border-b border-slate-100 dark:border-slate-800 transition-colors
                        ${isMyTeam ? 'bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 border-l-4 border-l-amber-500' : 'hover:bg-muted/50'}
                    `}
                >
                  <TableCell className="text-center font-medium text-xs text-muted-foreground p-2">
                    {index + 1}
                  </TableCell>
                  
                  <TableCell className="p-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border/50 bg-white">
                        <AvatarImage src={row.teams.logo_url} className="object-contain p-0.5" />
                        <AvatarFallback>{row.teams.nome[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                          <span className={`text-xs font-bold uppercase leading-tight ${isMyTeam ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                            {row.teams.nome}
                          </span>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center font-black text-lg p-2 bg-muted/5">
                    {row.punti}
                  </TableCell>
                  <TableCell className="text-center text-xs font-medium text-muted-foreground p-2">
                    {row.giocate}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground hidden sm:table-cell font-medium">{row.vinte}</TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground hidden sm:table-cell font-medium">{row.nulle}</TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground hidden sm:table-cell font-medium">{row.perse}</TableCell>
                  
                  <TableCell className="text-center p-1 border-r-2 border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10">
                      <Badge variant="secondary" className={`text-[9px] h-5 border-0 font-bold ${winPct >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                        {winPct}%
                      </Badge>
                  </TableCell>
                  
                  <TableCell className="text-center text-xs text-slate-500 p-1">{row.gol_fatti}</TableCell>
                  <TableCell className="text-center text-xs text-slate-500 p-1">{row.gol_subiti}</TableCell>
                  
                  <TableCell className={`text-center text-xs font-bold p-1 border-r-2 border-slate-100 dark:border-slate-800 ${diff > 0 ? 'text-green-600' : (diff < 0 ? 'text-red-500' : 'text-muted-foreground')}`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </TableCell>

                  <TableCell className="p-2">
                      <div className="flex items-center justify-center gap-1.5">
                          {form.map((match, i) => {
                              let colorClass = "bg-slate-100 text-slate-400 border-slate-200";
                              
                              if (match.result === 'V') colorClass = "bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
                              if (match.result === 'N') colorClass = "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
                              if (match.result === 'P') colorClass = "bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800";
                              
                              return (
                                  <Tooltip key={i}>
                                      <TooltipTrigger>
                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-black cursor-help border ${colorClass}`}>
                                            {match.result}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-xs bg-slate-900 text-white border-0 shadow-xl">
                                          <div className="text-center">
                                              <p className="font-bold text-[10px] uppercase opacity-70 mb-1">{format(new Date(match.date), 'dd MMM', { locale: it })}</p>
                                              <p className="font-black text-sm mb-0.5">{match.score}</p>
                                              <p className="text-[10px] truncate max-w-[100px]">vs {match.opponent}</p>
                                          </div>
                                      </TooltipContent>
                                  </Tooltip>
                              )
                          })}
                          {[...Array(3 - form.length)].map((_, i) => (
                              <div key={`empty-${i}`} className="h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"></div>
                          ))}
                      </div>
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </TooltipProvider>
      </div>
    </div>
  );
}