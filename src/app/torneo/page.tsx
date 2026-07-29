"use client"

import { useEffect, useState, useRef, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabaseBrowser'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input" 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { CalendarDays, Trophy, FileText, Download, Pencil, Save } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/layout/PageContainer"
import {
    CommunicationsAction,
    TournamentSelector,
} from "@/components/tournament/TournamentSelector"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { StandingsContent } from '../classifica/page'
import { EventDialog } from '@/components/EventDialog'
import { toast } from "sonner" 

import { Event } from '@/lib/types'
import {
    phaseOptionsForSeason,
    SEASON_OPTIONS,
    type PhaseFilter,
} from '@/lib/season-statistics'
import {
    fetchComunicati,
    fetchPlayerStatisticsByPhase,
    fetchSeasonEvents,
    fetchTeams,
    getUserContext,
    type Comunicato,
} from '@/lib/api'

type SeasonRow = { id: string; slug: string }

function tournamentEdition(slug: string) {
  const [start, end] = slug.split('-')
  return `${start}/${end.slice(-2)}`
}

export default function TorneoPage() {
  const [loading, setLoading] = useState(true)
  const [allMatches, setAllMatches] = useState<Event[]>([])
  const [teamsMap, setTeamsMap] = useState<Record<string, string>>({})
  const [isManager, setIsManager] = useState(false)
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [seasonError, setSeasonError] = useState<string | null>(null)
  const [tournamentSlug, setTournamentSlug] = useState<string>(SEASON_OPTIONS[0].slug)
  const [activePhase, setActivePhase] = useState<PhaseFilter>('ALL')
  const [historicalStats, setHistoricalStats] = useState<{
    season_id: string
    phase_key: Event["fase"]
  }[]>([])
  const [comunicati, setComunicati] = useState<Comunicato[]>([])

  const [selectedGiornataOverride, setSelectedGiornataOverride] = useState<number | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  const [scoreDialogOpen, setScoreDialogOpen] = useState(false)
  const [tempScores, setTempScores] = useState<Record<string, {casa: string, ospite: string}>>({})

  const daysScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
        const [{ isManager }, comunicatiData, teamsData] = await Promise.all([
            getUserContext(supabase),
            fetchComunicati(supabase),
            fetchTeams(supabase),
        ])

        if (isManager) setIsManager(true)
        if (comunicatiData.length > 0) setComunicati(comunicatiData)

        const tMap: Record<string, string> = {}
        teamsData.forEach(t => {
            if (t.nome) tMap[t.nome.toLowerCase().trim()] = t.logo_url ?? ''
        })
        setTeamsMap(tMap)

    }
    void init()
  }, [])

  useEffect(() => {
    let active = true
    const defaultEdition = tournamentEdition(SEASON_OPTIONS[0].slug)

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('seasons')
          .select('id, slug')
          .in('slug', SEASON_OPTIONS.map(({ slug }) => slug))
        if (!active) return
        const seasonRows = data ?? []
        const slugs = new Set(seasonRows.map(({ slug }) => slug))
        if (error || SEASON_OPTIONS.some(({ slug }) => !slugs.has(slug))) {
          setSeasons([])
          setSeasonError(`Impossibile caricare il torneo ${defaultEdition}.`)
        } else {
          setSeasons(seasonRows as SeasonRow[])
          setSeasonError(null)
        }
        setSeasonsLoading(false)
      } catch {
        if (!active) return
        setSeasons([])
        setSeasonError(`Impossibile caricare il torneo ${defaultEdition}.`)
        setSeasonsLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const seasonId = useMemo(
    () => seasons.find(({ slug }) => slug === tournamentSlug)?.id ?? null,
    [seasons, tournamentSlug],
  )

  useEffect(() => {
    let active = true

    if (seasonsLoading) return () => {
      active = false
    }

    setAllMatches([])
    setHistoricalStats([])
    if (seasonError || !seasonId) {
      setLoading(false)
      return () => {
        active = false
      }
    }

    setLoading(true)

    void Promise.all([
        fetchSeasonEvents(supabase, seasonId),
        fetchPlayerStatisticsByPhase(supabase, seasonId),
    ]).then(([matches, stats]) => {
        if (!active) return
        setAllMatches(matches)
        setHistoricalStats(stats)
    }).catch(() => {
        if (active) {
          setSeasonError(`Impossibile caricare il torneo ${tournamentEdition(tournamentSlug)}.`)
        }
    }).finally(() => {
        if (active) setLoading(false)
    })

    return () => {
        active = false
    }
  }, [seasonError, seasonId, seasonsLoading, tournamentSlug])

  const phaseOptions = useMemo(
    () =>
        seasonId
            ? phaseOptionsForSeason(seasonId, [
                ...allMatches
                    .filter(({ tipo }) => tipo === 'PARTITA')
                    .map(({ season_id, fase }) => ({ season_id, fase })),
                ...historicalStats,
            ])
            : [{ value: 'ALL' as const, label: 'Tutte le fasi' }],
    [allMatches, historicalStats, seasonId],
  )

  const handleTournamentChange = (slug: string) => {
    setTournamentSlug(slug)
    setActivePhase('ALL')
    setSelectedGiornataOverride(null)
    setAllMatches([])
    setHistoricalStats([])
    if (!seasons.some((season) => season.slug === slug)) {
      setSeasonError(`Impossibile caricare il torneo ${tournamentEdition(slug)}.`)
      setLoading(false)
      return
    }
    setSeasonError(null)
  }

  const currentPhaseMatches = useMemo(() => {
    return allMatches.filter(m => {
        if (m.tipo !== 'PARTITA') return false
        if (activePhase === 'ALL') return true
        if (activePhase === 'FASE_1') return !m.fase || m.fase === 'FASE_1'
        return m.fase === activePhase
    })
  }, [allMatches, activePhase])

  const giornate = useMemo(() => {
    return Array.from(new Set(currentPhaseMatches.map(d => d.giornata))).filter(Boolean).sort((a, b) => (a as number) - (b as number)) as number[]
  }, [currentPhaseMatches])

  const autoGiornata = useMemo<number | null>(() => {
    if (currentPhaseMatches.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chigiMatches = currentPhaseMatches.filter(m =>
      m.squadra_casa?.toLowerCase().includes('chigi') ||
      m.squadra_ospite?.toLowerCase().includes('chigi')
    );
    const nextChigi = chigiMatches.find(m => m.data_ora && new Date(m.data_ora) >= today);
    if (nextChigi?.giornata) return nextChigi.giornata;
    const nextAny = currentPhaseMatches.find(m => m.data_ora && new Date(m.data_ora) >= today);
    return nextAny?.giornata ?? giornate[giornate.length - 1] ?? null;
  }, [currentPhaseMatches, giornate])

  const selectedGiornata = selectedGiornataOverride ?? autoGiornata;

  useEffect(() => {
    if (selectedGiornata && daysScrollRef.current) {
        const selectedBtn = document.getElementById(`day-btn-${selectedGiornata}`)
        if (selectedBtn) {
            daysScrollRef.current.scrollTo({
                left: selectedBtn.offsetLeft - daysScrollRef.current.offsetWidth / 2 + selectedBtn.offsetWidth / 2,
                behavior: 'smooth'
            })
        }
    }
  }, [selectedGiornata])

  const handleEditEvent = (event: Event) => {
    setEditingEvent({ ...event })
    setDialogOpen(true)
  }

  const handleSaveEvent = async (eventData: Partial<Event>) => {
    if (!editingEvent) return;
    const previousMatches = [...allMatches];
    const payload = { ...eventData, ...(!eventData.data_ora ? { data_ora: editingEvent.data_ora } : {}) };

    setAllMatches(prev => prev.map(m => m.id === editingEvent.id ? { ...m, ...payload } : m))

    const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id)

    if (error) {
        setAllMatches(previousMatches)
        throw error
    }

    setEditingEvent(null)
  }

  const currentMatches = currentPhaseMatches.filter(m => m.giornata === selectedGiornata)

  const handleOpenScoreDialog = () => {
    const initialScores: Record<string, {casa: string, ospite: string}> = {}
    
    currentMatches.forEach(m => {
        initialScores[m.id] = {
            casa: m.gol_casa != null ? m.gol_casa.toString() : '',
            ospite: m.gol_ospite != null ? m.gol_ospite.toString() : ''
        }
    })
    
    setTempScores(initialScores)
    setScoreDialogOpen(true)
  }

  const handleSaveScore = async (matchId: string) => {
      const s = tempScores[matchId]
      if (!s) return

      const golCasa = s.casa === '' ? null : parseInt(s.casa)
      const golOspite = s.ospite === '' ? null : parseInt(s.ospite)
      const previousMatches = [...allMatches]

      setAllMatches(prev => prev.map(m =>
          m.id === matchId
          ? { ...m, gol_casa: golCasa, gol_ospite: golOspite, giocata: (golCasa !== null && golOspite !== null) }
          : m
      ))

      const { error } = await supabase.from('events').update({
          gol_casa: golCasa,
          gol_ospite: golOspite,
          giocata: (golCasa !== null && golOspite !== null)
      }).eq('id', matchId)

      if (error) {
          setAllMatches(previousMatches)
          toast.error("Errore: " + error.message)
      } else {
          toast.success("Risultato salvato")
      }
  }

  if (loading) return (
    <PageContainer contentClassName="mx-auto max-w-4xl space-y-4 pb-24">
        <div className="flex justify-between items-start mb-2">
            <div className="space-y-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-10 w-[200px] rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-2 pb-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-14 rounded-2xl shrink-0" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
    </PageContainer>
  )

  return (
    <PageContainer contentClassName="mx-auto max-w-4xl space-y-4 pb-24">
        <PageTitleBar
            actions={
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Dialog>
                    <DialogTrigger asChild>
                        <CommunicationsAction />
                    </DialogTrigger>
                    <DialogContent className="max-w-sm rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" /> Comunicati ufficiali
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
                            {comunicati.map((com) => (
                                <a
                                    key={com.id}
                                    href={com.enjore_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted border transition-colors group"
                                >
                                    <div>
                                        <p className="font-bold text-sm">{com.titolo}</p>
                                        <p className="text-[10px] text-muted-foreground">{com.data ?? ''}</p>
                                    </div>
                                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </a>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>

                {isManager && (
                    <Button 
                        aria-label="Modifica risultati"
                        onClick={handleOpenScoreDialog}
                        size="icon"
                        className="h-11 w-11 rounded-full bg-purple-600 text-white shadow-lg shadow-purple-500/20 hover:bg-purple-700 sm:h-10 sm:w-auto sm:rounded-md"
                        title="Modifica risultati"
                    >
                        <Pencil className="h-5 w-5" />
                        <span className="hidden sm:inline">Modifica risultati</span>
                    </Button>
                )}
                </div>
            }
            filters={
                <TournamentSelector
                    onPhaseChange={(phase) => {
                        setActivePhase(phase)
                        setSelectedGiornataOverride(null)
                    }}
                    onSeasonChange={handleTournamentChange}
                    phase={activePhase}
                    phaseOptions={phaseOptions}
                    seasonId={tournamentSlug}
                />
            }
            subtitle="Calendario e classifica della stagione"
            title="Torneo"
        />

        {seasonError ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground" role="alert">
                {seasonError}
            </p>
        ) : (
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
                <StandingsContent fase={activePhase} seasonId={seasonId ?? undefined} />
            </TabsContent>

            <TabsContent value="calendario" className="space-y-4 animate-in fade-in slide-in-from-right-2">
                
                <div 
                    ref={daysScrollRef}
                    className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                >
                    {giornate.map(g => (
                        <button
                            aria-label={`Giornata ${g}`}
                            aria-pressed={selectedGiornata === g}
                            key={g}
                            id={`day-btn-${g}`}
                            onClick={() => setSelectedGiornataOverride(g)}
                            type="button"
                            className={`
                                flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 transition-[color,background-color,border-color,box-shadow,transform] font-black
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
                    {giornate.length === 0 && (
                        <div className="text-sm text-muted-foreground py-4">Nessuna giornata disponibile per questa fase.</div>
                    )}
                </div>

                {giornate.length > 0 && (
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
                                const isChigi = match.squadra_casa?.toLowerCase().includes('chigi') || match.squadra_ospite?.toLowerCase().includes('chigi')
                                const logoCasa = teamsMap[match.squadra_casa?.toLowerCase().trim() ?? '']
                                const logoOspite = teamsMap[match.squadra_ospite?.toLowerCase().trim() ?? '']
                                
                                return (
                                    <Card key={match.id} className={`border-l-4 ${isChigi ? 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10' : 'border-l-slate-300'}`}>
                                        <CardContent className="p-4 flex items-center gap-4 relative">
                                            
                                            <div className="flex flex-col items-center justify-center w-12 text-center border-r pr-4">
                                                <span className="text-lg font-black leading-none">
                                                    {match.data_ora ? format(new Date(match.data_ora), 'dd', { locale: it }) : '—'}
                                                </span>
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                                                    {match.data_ora ? format(new Date(match.data_ora), 'MMM', { locale: it }) : ''}
                                                </span>
                                                <span className="text-[10px] font-mono mt-1 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                                    {match.data_ora ? format(new Date(match.data_ora), 'HH:mm', { locale: it }) : ''}
                                                </span>
                                            </div>
                                            
                                            <div className="flex-1 space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-5 w-5 bg-transparent">
                                                            <AvatarImage src={logoCasa} alt={match.squadra_casa ?? ''} className="object-contain"/>
                                                            <AvatarFallback className="text-[8px]">{match.squadra_casa?.[0]}</AvatarFallback>
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
                                                            <AvatarImage src={logoOspite} alt={match.squadra_ospite ?? ''} className="object-contain"/>
                                                            <AvatarFallback className="text-[8px]">{match.squadra_ospite?.[0]}</AvatarFallback>
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
                                            
                                            {isManager && (
                                                <Button 
                                                    aria-label="Modifica partita"
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="absolute bottom-1 right-1 h-6 w-6 text-muted-foreground hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleEditEvent(match)
                                                    }}
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </Button>
                                            )}

                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                )}

            </TabsContent>
        </Tabs>
        )}

        <EventDialog 
            open={dialogOpen} 
            onOpenChange={setDialogOpen}
            eventToEdit={editingEvent}
            onSave={handleSaveEvent}
        />

        <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
            <DialogContent className="max-w-md rounded-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Aggiorna Risultati</DialogTitle>
                    <DialogDescription>Inserisci i gol per la giornata {selectedGiornata}</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                    {currentMatches.map(match => {
                        const s = tempScores[match.id] || { casa: '', ospite: '' }
                        return (
                            <div key={match.id} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border flex flex-col gap-3">
                                <div className="text-[10px] text-muted-foreground font-bold uppercase text-center">
                                    {match.data_ora ? format(new Date(match.data_ora), 'dd/MM HH:mm') : 'Data N.D.'} - {match.luogo}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-xs font-bold text-center leading-tight h-8 flex items-center justify-center">{match.squadra_casa}</span>
                                        <Input 
                                            type="number" 
                                            className="h-10 w-14 text-center font-bold text-lg" 
                                            value={s.casa}
                                            onChange={(e) => setTempScores({
                                                ...tempScores, 
                                                [match.id]: { ...s, casa: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <div className="font-black text-muted-foreground">-</div>
                                    <div className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-xs font-bold text-center leading-tight h-8 flex items-center justify-center">{match.squadra_ospite}</span>
                                        <Input 
                                            type="number" 
                                            className="h-10 w-14 text-center font-bold text-lg" 
                                            value={s.ospite}
                                            onChange={(e) => setTempScores({
                                                ...tempScores, 
                                                [match.id]: { ...s, ospite: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <Button aria-label="Salva risultato" size="icon" className="h-10 w-10 bg-purple-600 hover:bg-purple-700 shrink-0" onClick={() => handleSaveScore(match.id)}>
                                        <Save aria-hidden="true" className="h-4 w-4 text-white" />
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </DialogContent>
        </Dialog>
    </PageContainer>
  )
}
