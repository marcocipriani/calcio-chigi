"use client"

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Loader2, CalendarDays, Trophy, Settings, FileText, Download } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Badge } from "@/components/ui/badge"
import ClassificaPage from '../classifica/page'

const COMUNICATI = [
    { id: 8, data: "06/12/2025", titolo: "Comunicato n. 8", url: "https://cdn.enjore.com/source/doc/comunicate/113994-campionato-asi-over35_artimestieri_20252026-comunicato-8-06-12-2025_sn25.pdf" },
    { id: 7, data: "22/11/2025", titolo: "Comunicato n. 7", url: "https://cdn.enjore.com/source/doc/comunicate/113994-campionato-asi-over35_artimestieri_20252026-comunicato-7-22-11-2025_4EZ3.pdf" },
    { id: 6, data: "08/11/2025", titolo: "Comunicato n. 6", url: "https://cdn.enjore.com/source/doc/comunicate/113994-campionato-asi-over35_artimestieri_20252026-comunicato-6-08-11-2025_OMop.pdf" },
    { id: 99, data: "02/11/2025", titolo: "Comunicazione Importante Società", url: "https://cdn.enjore.com/source/doc/comunicate/113994-comunicazione-importante-alle-societa-partecipanti-ai-campionati-asi-del-02112025_S455.pdf" },
    { id: 4, data: "25/10/2025", titolo: "Comunicato n. 4", url: "https://cdn.enjore.com/source/doc/comunicate/113994-campionato-asi-over35_artimestieri_20252026-comunicato-4-25-10-2025_FT7L.pdf" },
    { id: 102, data: "14/10/2025", titolo: "CIRCOLARE n. 2", url: "https://cdn.enjore.com/source/doc/comunicate/113994-circolare-n-2-del-14102025_tIZN.pdf" },
    { id: 2, data: "11/10/2025", titolo: "Comunicato n. 2", url: "https://cdn.enjore.com/source/doc/comunicate/113994-campionato-asi-over35_artimestieri_20252026-comunicato-2-11-10-2025_ifIS.pdf" },
    { id: 101, data: "06/10/2025", titolo: "CIRCOLARE n. 1", url: "https://cdn.enjore.com/source/doc/comunicate/113994-circolare-n-1-del-06102025_84fG.pdf" },
    { id: 1, data: "01/10/2025", titolo: "Regolamento", url: "https://cdn.enjore.com/source/doc/tournament_doc/113994-zFUMr1Pcin-regolamento.pdf" },
];

export default function TorneoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<any[]>([])
  const [teamsMap, setTeamsMap] = useState<Record<string, string>>({})
  const [isManager, setIsManager] = useState(false)
  
  const [giornate, setGiornate] = useState<number[]>([])
  const [selectedGiornata, setSelectedGiornata] = useState<number | null>(null)
  
  const daysScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
        // 1. Check Manager
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('is_manager').eq('user_id', user.id).single()
            if (profile?.is_manager) setIsManager(true)
        }

        // 2. Load Teams
        const { data: teamsData } = await supabase.from('teams').select('nome, logo_url')
        const tMap: Record<string, string> = {}
        if (teamsData) {
            teamsData.forEach(t => { tMap[t.nome] = t.logo_url })
            setTeamsMap(tMap)
        }

        // 3. Load Matches
        const { data } = await supabase
            .from('events')
            .select('*')
            .eq('tipo', 'PARTITA')
            .order('data_ora', { ascending: true })
        
        if (data && data.length > 0) {
            setMatches(data)
            
            const uniqueG = Array.from(new Set(data.map(d => d.giornata))).filter(Boolean).sort((a:any, b:any) => a - b) as number[];
            setGiornate(uniqueG)

            const today = new Date();
            today.setHours(0,0,0,0); // Azzera orario per confronto corretto

            // Filtra solo le partite del Circolo Chigi
            const chigiMatches = data.filter(m => 
                m.squadra_casa?.toLowerCase().includes('chigi') || 
                m.squadra_ospite?.toLowerCase().includes('chigi')
            );

            // Cerca la prima partita futura (o oggi) del Chigi
            const nextChigiMatch = chigiMatches.find(m => new Date(m.data_ora) >= today);
            
            if (nextChigiMatch && nextChigiMatch.giornata) {
                // Se c'è una partita futura del Chigi, seleziona quella giornata
                setSelectedGiornata(nextChigiMatch.giornata);
            } else {
                // Altrimenti prendi la prima partita futura GENERALE del torneo
                const generalNextMatch = data.find(m => new Date(m.data_ora) >= today);
                if (generalNextMatch) {
                    setSelectedGiornata(generalNextMatch.giornata);
                } else {
                    // Se il torneo è finito, mostra l'ultima giornata
                    setSelectedGiornata(uniqueG[uniqueG.length - 1]);
                }
            }
        }
        setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (selectedGiornata && daysScrollRef.current) {
        const selectedBtn = document.getElementById(`day-btn-${selectedGiornata}`);
        if (selectedBtn) {
            daysScrollRef.current.scrollTo({
                left: selectedBtn.offsetLeft - daysScrollRef.current.offsetWidth / 2 + selectedBtn.offsetWidth / 2,
                behavior: 'smooth'
            });
        }
    }
  }, [selectedGiornata])

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>

  const currentMatches = matches.filter(m => m.giornata === selectedGiornata);

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-24 space-y-4">
        
        <div className="flex justify-between items-center mb-2">
            <div>
                <h1 className="text-3xl font-black text-foreground tracking-tight">Torneo</h1>
                <p className="text-xs text-muted-foreground font-bold uppercase">Campionato ASI Over35</p>
            </div>
            
            <div className="flex gap-2">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full border-2 border-primary/20 text-primary hover:bg-primary/10">
                            <FileText className="h-5 w-5" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" /> Comunicati Ufficiali
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
                            {COMUNICATI.map((com) => (
                                <a 
                                    key={com.id} 
                                    href={com.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted border transition-colors group"
                                >
                                    <div>
                                        <p className="font-bold text-sm">{com.titolo}</p>
                                        <p className="text-[10px] text-muted-foreground">{com.data}</p>
                                    </div>
                                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </a>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>

                {isManager && (
                    <Button 
                        onClick={() => router.push('/risultati')}
                        size="icon"
                        className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 rounded-full"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                )}
            </div>
        </div>

        <Tabs defaultValue="classifica" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12 bg-muted/50 p-1 rounded-xl mb-6">
                <TabsTrigger value="classifica" className="rounded-lg font-bold gap-2">
                    <Trophy className="h-4 w-4" /> Classifica
                </TabsTrigger>
                <TabsTrigger value="calendario" className="rounded-lg font-bold gap-2">
                    <CalendarDays className="h-4 w-4" /> Calendario
                </TabsTrigger>
            </TabsList>

            <TabsContent value="classifica" className="space-y-4 animate-in fade-in slide-in-from-left-2">
                <ClassificaPage />
            </TabsContent>

            <TabsContent value="calendario" className="space-y-4 animate-in fade-in slide-in-from-right-2">
                
                <div 
                    ref={daysScrollRef}
                    className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                >
                    {giornate.map(g => (
                        <button
                            key={g}
                            id={`day-btn-${g}`}
                            onClick={() => setSelectedGiornata(g)}
                            className={`
                                flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 transition-all font-black
                                ${selectedGiornata === g 
                                    ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-105' 
                                    : 'bg-card text-muted-foreground border-transparent hover:bg-muted'
                                }
                            `}
                        >
                            <span className="text-[9px] font-bold uppercase opacity-70">Giornata</span>
                            <span className="text-xl leading-none">{g}</span>
                        </button>
                    ))}
                </div>

                <div className="space-y-3 min-h-[300px]">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-sm font-bold text-muted-foreground">
                            Partite Giornata {selectedGiornata}
                        </span>
                    </div>

                    {currentMatches.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground">
                            Nessuna partita trovata.
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {currentMatches.map(match => {
                            const isChigi = match.squadra_casa?.toLowerCase().includes('chigi') || match.squadra_ospite?.toLowerCase().includes('chigi');
                            
                            return (
                                <Card key={match.id} className={`border-l-4 ${isChigi ? 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10' : 'border-l-slate-300'}`}>
                                    <CardContent className="p-4 flex items-center gap-4">
                                        
                                        <div className="flex flex-col items-center justify-center w-12 text-center border-r pr-4">
                                            <span className="text-lg font-black leading-none">
                                                {format(new Date(match.data_ora), 'dd', { locale: it })}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                                                {format(new Date(match.data_ora), 'MMM', { locale: it })}
                                            </span>
                                            <span className="text-[10px] font-mono mt-1 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                                {format(new Date(match.data_ora), 'HH:mm', { locale: it })}
                                            </span>
                                        </div>
                                        
                                        <div className="flex-1 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5 bg-transparent">
                                                        <AvatarImage src={teamsMap[match.squadra_casa]} className="object-contain"/>
                                                        <AvatarFallback className="text-[8px]">{match.squadra_casa[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <span className={`font-bold text-sm ${match.squadra_casa?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                                        {match.squadra_casa}
                                                    </span>
                                                </div>
                                                <span className="font-mono font-bold text-lg">
                                                    {match.giocata ? match.gol_casa : ''}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5 bg-transparent">
                                                        <AvatarImage src={teamsMap[match.squadra_ospite]} className="object-contain"/>
                                                        <AvatarFallback className="text-[8px]">{match.squadra_ospite[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <span className={`font-bold text-sm ${match.squadra_ospite?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                                        {match.squadra_ospite}
                                                    </span>
                                                </div>
                                                <span className="font-mono font-bold text-lg">
                                                    {match.giocata ? match.gol_ospite : ''}
                                                </span>
                                            </div>
                                        </div>

                                        {!match.giocata && (
                                            <div className="absolute top-2 right-2">
                                                <Badge variant="outline" className="text-[8px] px-1 h-4 border-slate-200 text-slate-400">
                                                    DA GIOCARE
                                                </Badge>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </div>

            </TabsContent>
        </Tabs>
    </div>
  )
}