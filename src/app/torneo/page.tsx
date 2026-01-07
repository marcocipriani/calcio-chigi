"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Loader2, CalendarDays, Trophy, Settings } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Componente Classifica (Importato o Inline se preferisci)
import ClassificaPage from '../classifica/page'

export default function TorneoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<any[]>([])
  const [isManager, setIsManager] = useState(false)
  const [giornate, setGiornate] = useState<string[]>([])

  useEffect(() => {
    async function init() {
        // 1. Check manager
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('is_manager').eq('user_id', user.id).single()
            if (profile?.is_manager) setIsManager(true)
        }

        // 2. Load matches
        const { data } = await supabase
            .from('events')
            .select('*')
            .eq('tipo', 'PARTITA')
            .order('data_ora', { ascending: true })
        
        if (data) {
            setMatches(data)
            const uniqueG = Array.from(new Set(data.map(d => d.giornata?.toString()))).filter(Boolean) as string[];
            setGiornate(uniqueG)
        }
        setLoading(false)
    }
    init()
  }, [])

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>

  const matchesByDay = matches.reduce((acc, match) => {
      const g = match.giornata || 'ND';
      if (!acc[g]) acc[g] = [];
      acc[g].push(match);
      return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-24 space-y-6">
        
        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-3xl font-black text-foreground">Torneo</h1>
                <p className="text-sm text-muted-foreground">Calendario e Classifiche ufficiali</p>
            </div>

            {isManager && (
                <Button 
                    onClick={() => router.push('/risultati')}
                    className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 font-bold gap-2 h-9 text-xs px-3"
                >
                    <Settings className="h-3.5 w-3.5" /> Risultati
                </Button>
            )}
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

            <TabsContent value="classifica" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <ClassificaPage />
            </TabsContent>

            <TabsContent value="calendario" className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                {giornate.length === 0 && <p className="text-center text-muted-foreground py-10">Nessuna giornata trovata.</p>}
                
                {giornate.map(g => (
                    <div key={g} className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider">
                                Giornata {g}
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {matchesByDay[g]?.map((match: any) => {
                                const isChigi = match.squadra_casa?.toLowerCase().includes('chigi') || match.squadra_ospite?.toLowerCase().includes('chigi');
                                
                                return (
                                    <Card key={match.id} className={`border ${isChigi ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                        <CardContent className="p-3 flex items-center justify-between">
                                            <div className="text-xs text-muted-foreground font-bold w-12 text-center leading-tight">
                                                {format(new Date(match.data_ora), 'dd/MM HH:mm', { locale: it })}
                                            </div>
                                            
                                            <div className="flex-1 flex items-center justify-between px-4">
                                                <span className={`font-bold text-sm ${match.squadra_casa?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                                    {match.squadra_casa}
                                                </span>
                                                
                                                <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono font-black text-sm min-w-[3rem] text-center">
                                                    {match.giocata ? `${match.gol_casa} - ${match.gol_ospite}` : '-'}
                                                </div>
                                                
                                                <span className={`font-bold text-sm text-right ${match.squadra_ospite?.toLowerCase().includes('chigi') ? 'text-amber-600' : ''}`}>
                                                    {match.squadra_ospite}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </TabsContent>
        </Tabs>
    </div>
  )
}