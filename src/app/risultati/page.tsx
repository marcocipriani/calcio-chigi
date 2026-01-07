"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save, CalendarDays, ArrowLeft, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default function GestioneRisultatiPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  
  // Dati
  const [matches, setMatches] = useState<any[]>([])
  const [originalMatches, setOriginalMatches] = useState<any[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  // Filtri
  const [giornateDisponibili, setGiornateDisponibili] = useState<string[]>([])
  const [giornata, setGiornata] = useState<string>("")
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    checkManager()
    loadAvailableMatchdays()
  }, [])

  useEffect(() => {
    if (giornata) {
        loadMatches()
    }
  }, [giornata])

  // Rileva modifiche
  useEffect(() => {
      if (originalMatches.length === 0) return;
      const isDifferent = JSON.stringify(matches) !== JSON.stringify(originalMatches);
      setHasChanges(isDifferent);
  }, [matches, originalMatches])

  async function checkManager() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('is_manager').eq('user_id', user.id).single()
        if (profile?.is_manager) {
            setIsManager(true)
        } else {
            router.push('/')
        }
    }
  }

  async function loadAvailableMatchdays() {
      const { data } = await supabase
        .from('events')
        .select('giornata')
        .eq('tipo', 'PARTITA')
        .not('giornata', 'is', null)
        .order('giornata', { ascending: true });
      
      if (data) {
          const unique = Array.from(new Set(data.map(d => d.giornata?.toString()))).filter(Boolean);
          setGiornateDisponibili(unique as string[]);
          if (unique.length > 0) setGiornata(unique[0] as string);
      }
  }

  async function loadMatches() {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('tipo', 'PARTITA')
      .eq('giornata', parseInt(giornata))
      .order('data_ora', { ascending: true })

    if (data) {
        const sortedData = data.sort((a,b) => a.id.localeCompare(b.id));
        setMatches(JSON.parse(JSON.stringify(sortedData)))
        setOriginalMatches(JSON.parse(JSON.stringify(sortedData)))
        setHasChanges(false)
    }
    setLoading(false)
  }

  const handleScoreChange = (id: string, field: 'gol_casa' | 'gol_ospite', value: string) => {
      setMatches(prev => prev.map(m => {
          if (m.id === id) {
              return { ...m, [field]: value === '' ? null : parseInt(value) }
          }
          return m
      }))
  }

  const togglePlayed = (id: string, currentStatus: boolean) => {
      setMatches(prev => prev.map(m => {
          if (m.id === id) return { ...m, giocata: !currentStatus }
          return m
      }))
  }

  const resetChanges = () => {
      setMatches(JSON.parse(JSON.stringify(originalMatches)));
      setHasChanges(false);
  }

  const saveAll = async () => {
      setLoading(true)
      try {
          const updates = matches.map(m => ({
              id: m.id,
              gol_casa: m.gol_casa,
              gol_ospite: m.gol_ospite,
              giocata: m.giocata,
          }))

          const { error } = await supabase.from('events').upsert(updates)
          
          if (error) throw error;

          setOriginalMatches(JSON.parse(JSON.stringify(matches)));
          setHasChanges(false);
          alert("Giornata salvata e Classifica aggiornata!")
      } catch (error: any) {
          alert("Errore salvataggio: " + error.message)
      } finally {
          setLoading(false)
      }
  }

  if (!isManager) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto"/></div>

  return (
    <div className="container max-w-3xl mx-auto p-4 pb-32 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.push('/torneo')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-black">Risultati</h1>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin Panel</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <Select value={giornata} onValueChange={setGiornata}>
                    <SelectTrigger className="w-[130px] font-bold h-9 text-xs">
                        <SelectValue placeholder="Giornata" />
                    </SelectTrigger>
                    <SelectContent>
                        {giornateDisponibili.map(g => (
                            <SelectItem key={g} value={g}>Giornata {g}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        {/* Lista Partite */}
        <Card className="border-2 border-primary/10 shadow-sm">
            <CardContent className="p-0">
                {matches.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Nessuna partita trovata.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {matches.map((match) => (
                            <div key={match.id} className="flex flex-col gap-3 p-4 hover:bg-muted/10 transition-colors">
                                
                                {/* Riga 1: Info e Toggle */}
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
                                        {format(new Date(match.data_ora), 'EEE d MMM HH:mm', { locale: it })}
                                    </span>
                                    <Button 
                                        variant={match.giocata ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => togglePlayed(match.id, match.giocata)}
                                        className={`h-6 text-[10px] font-bold px-2 ${match.giocata ? 'bg-green-600 hover:bg-green-700' : 'text-muted-foreground'}`}
                                    >
                                        {match.giocata ? 'TERMINATA' : 'DA GIOCARE'}
                                    </Button>
                                </div>

                                {/* Riga 2: Squadre e Input */}
                                <div className="flex items-center justify-between gap-4">
                                    {/* Casa */}
                                    <div className="flex-1 text-right">
                                        <span className={`font-bold text-sm block leading-tight ${match.squadra_casa?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                            {match.squadra_casa}
                                        </span>
                                    </div>

                                    {/* Punteggio */}
                                    <div className={`flex items-center gap-2 shrink-0 ${!match.giocata ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                        <Input 
                                            type="number" 
                                            className="w-10 h-10 text-center font-black text-lg p-0 border-2 focus-visible:ring-purple-500" 
                                            value={match.gol_casa ?? ''}
                                            onChange={(e) => handleScoreChange(match.id, 'gol_casa', e.target.value)}
                                        />
                                        <span className="font-bold text-muted-foreground">-</span>
                                        <Input 
                                            type="number" 
                                            className="w-10 h-10 text-center font-black text-lg p-0 border-2 focus-visible:ring-purple-500"
                                            value={match.gol_ospite ?? ''}
                                            onChange={(e) => handleScoreChange(match.id, 'gol_ospite', e.target.value)}
                                        />
                                    </div>

                                    {/* Ospite */}
                                    <div className="flex-1 text-left">
                                        <span className={`font-bold text-sm block leading-tight ${match.squadra_ospite?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                            {match.squadra_ospite}
                                        </span>
                                    </div>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>

        {/* POPUP FLUTTUANTE SALVATAGGIO */}
        {hasChanges && (
            <div className="fixed bottom-24 left-0 right-0 z-50 flex justify-center px-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="bg-purple-900 text-white p-2 pl-4 pr-2 rounded-full shadow-2xl flex items-center justify-between border border-purple-500/50 backdrop-blur-md w-full max-w-xs ring-4 ring-black/10">
                    <span className="text-xs font-bold ml-1 flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse"></span>
                        Modifiche non salvate
                    </span>
                    <div className="flex items-center gap-1">
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={resetChanges}
                            className="h-8 w-8 p-0 rounded-full hover:bg-white/20 text-white/70 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button 
                            size="sm" 
                            onClick={saveAll} 
                            disabled={loading}
                            className="h-8 rounded-full bg-white text-purple-900 hover:bg-white/90 font-bold px-4 text-xs"
                        >
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="flex items-center gap-1"><Check className="h-3 w-3" /> SALVA</span>}
                        </Button>
                    </div>
                </div>
            </div>
        )}

    </div>
  )
}