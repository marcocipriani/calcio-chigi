"use client"

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EventCard } from '@/components/EventCard';
import { EventDialog } from '@/components/EventDialog'; 
import { Loader2, Trophy, Dumbbell, ListFilter, CalendarDays, History, Plus, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { differenceInDays, differenceInHours } from 'date-fns';

type FilterType = 'ALL' | 'PARTITA' | 'ALLENAMENTO';

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');
  
  // STATI MANAGER
  const [isManager, setIsManager] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  useEffect(() => {
    fetchData();

    // REALTIME SUBSCRIPTION
    const channel = supabase
      .channel('public:events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    }
  }, []);

  const handleRealtimeUpdate = (payload: any) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      setEvents((currentEvents) => {
          if (eventType === 'INSERT') {
              return [...currentEvents, newRecord].sort((a, b) => new Date(a.data_ora).getTime() - new Date(b.data_ora).getTime());
          } 
          if (eventType === 'UPDATE') {
              return currentEvents.map(e => e.id === newRecord.id ? { ...e, ...newRecord } : e)
                  .sort((a, b) => new Date(a.data_ora).getTime() - new Date(b.data_ora).getTime());
          }
          if (eventType === 'DELETE') {
              return currentEvents.filter(e => e.id !== oldRecord.id);
          }
          return currentEvents;
      });
  };

  async function fetchData() {
    // 1. Check Manager
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('is_manager').eq('user_id', user.id).single();
        if (profile?.is_manager) setIsManager(true);
    }

    // 2. Events
    const { data: eventsData, error } = await supabase
      .from('events')
      .select(`*, attendance (status, profiles (nome, avatar_url))`)
      .order('data_ora', { ascending: true });
    
    if(error) console.error("Errore DB:", error);

    // 3. Teams
    const { data: teamsData } = await supabase
      .from('teams')
      .select('nome, logo_url');

    setEvents(eventsData || []);
    setTeams(teamsData || []);
    setLoading(false);
  }

  const handleCreateNew = () => {
      setEditingEvent(null);
      setDialogOpen(true);
  }

  const handleEditEvent = (event: any) => {
      setEditingEvent({ ...event });
      setDialogOpen(true);
  }

  const handleSaveEvent = async (eventData: any) => {
      const previousEvents = [...events];

      if (editingEvent) {
          setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...eventData } : e));
      } else {
            setEvents(prev => [...prev, eventData].sort((a, b) => new Date(a.data_ora).getTime() - new Date(b.data_ora).getTime()));
      }

      let error = null;
      if (editingEvent) {
          const res = await supabase
            .from('events')
            .update(eventData)
            .eq('id', editingEvent.id);
          error = res.error;
      } else {
          const res = await supabase
            .from('events')
            .insert([eventData]);
          error = res.error;
      }

      if(error) {
          alert("Errore: " + error.message);
          setEvents(previousEvents);
      } else {
            setDialogOpen(false);
      }
  }

  const getLogo = (teamName: string) => {
    if (!teamName) return null;
    const team = teams.find(t => t.nome && teamName.toLowerCase().includes(t.nome.toLowerCase()));
    return team?.logo_url;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0,0,0,0);

  const now = new Date();

  const myEvents = events.filter(e => {
    if (e.tipo === 'ALLENAMENTO') return true;
    return !e.avversario?.includes(' vs '); 
  });

  const futureRaw = myEvents.filter(e => new Date(e.data_ora) >= yesterday).sort((a,b) => new Date(a.data_ora).getTime() - new Date(b.data_ora).getTime());
  
  const pastRaw = myEvents.filter(e => new Date(e.data_ora) < yesterday && e.giocata === true).reverse();

  const applyTypeFilter = (list: any[]) => {
    if (filter === 'ALL') return list;
    return list.filter(e => e.tipo === filter);
  };

  const visibleFutureEvents = applyTypeFilter(futureRaw);
  const visiblePastEvents = applyTypeFilter(pastRaw);

  const nextMatch = visibleFutureEvents.find(e => e.tipo === 'PARTITA' && new Date(e.data_ora) > now);
  
  const getCountdownLabel = (dateStr: string) => {
      const matchDate = new Date(dateStr);
      const diffDays = differenceInDays(matchDate, now);
      const diffHours = differenceInHours(matchDate, now);

      if (diffDays > 1) return `${diffDays} Giorni`;
      if (diffDays === 1) return `Domani`;
      if (diffDays === 0) {
          if (diffHours > 0) return `${diffHours} Ore`;
          return "Meno di 1h";
      }
      return "LIVE";
  }

  return (
    <main className="container max-w-md mx-auto px-4 py-4 space-y-4 pb-20">
      
      <div className="pb-2 flex justify-between items-end">
        <div>
            <h2 className="text-3xl font-black text-foreground tracking-tight">Calendario</h2>
            <p className="text-sm text-muted-foreground font-medium">Gli impegni della squadra</p>
        </div>

        {nextMatch && (
            <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Next Match</span>
                <div className="bg-red-600 text-primary-foreground px-2 py-1 rounded-md text-xs font-black flex items-center gap-1 shadow-sm animate-pulse">
                    <Clock className="h-3 w-3" />
                    {getCountdownLabel(nextMatch.data_ora)}
                </div>
            </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <>
            <div className="flex items-center gap-3 overflow-x-auto pb-3 scrollbar-hide">
            <Button 
                variant={filter === 'ALL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('ALL')}
                className={`rounded-full h-9 px-5 text-xs font-bold transition-all ${filter === 'ALL' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground border-border'}`}
            >
                <ListFilter className="h-4 w-4 mr-2" /> Tutti
            </Button>
            <Button 
                variant={filter === 'PARTITA' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('PARTITA')}
                className={`rounded-full h-9 px-5 text-xs font-bold transition-all ${filter === 'PARTITA' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground border-border hover:text-primary'}`}
            >
                <Trophy className="h-4 w-4 mr-2" /> Partite
            </Button>
            <Button 
                variant={filter === 'ALLENAMENTO' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('ALLENAMENTO')}
                className={`rounded-full h-9 px-5 text-xs font-bold transition-all ${filter === 'ALLENAMENTO' ? 'bg-amber-chigi text-slate-900' : 'bg-card text-muted-foreground border-border hover:text-amber-chigi'}`}
            >
                <Dumbbell className="h-4 w-4 mr-2" /> Allenamenti
            </Button>
            </div>

            <Tabs defaultValue="upcoming" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-14 bg-muted/50 p-1.5 rounded-2xl backdrop-blur-sm dark:bg-slate-900/50 border dark:border-slate-800">
                    <TabsTrigger value="upcoming" className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-xl gap-2 transition-all">
                        <CalendarDays className="h-5 w-5" /> Calendario
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-xl gap-2 transition-all">
                        <History className="h-5 w-5" /> Risultati
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {visibleFutureEvents.length === 0 ? (
                        <div className="text-center py-16 bg-card/50 rounded-3xl border border-dashed dark:border-slate-800 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                                <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                            </div>
                            <p className="text-muted-foreground text-sm font-bold">Nessun impegno in programma.</p>
                        </div>
                    ) : (
                        visibleFutureEvents.map(event => (
                        <Link key={event.id} href={`/evento/${event.id}`} className="block transform transition-all duration-200 hover:scale-[1.02] relative group">
                            
                            {event.id === nextMatch?.id && (
                                <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 z-20">
                                    <span className="bg-red-600 text-white border-2 border-background shadow-md text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap">
                                        NEXT MATCH
                                    </span>
                                </div>
                            )}

                            <EventCard 
                                event={event} 
                                opponentLogo={getLogo(event.avversario)} 
                                isManager={isManager}
                                onEdit={handleEditEvent}
                            />
                        </Link>
                        ))
                    )}
                </TabsContent>

                <TabsContent value="history" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {visiblePastEvents.length === 0 ? (
                         <div className="text-center py-16 bg-card/50 rounded-3xl border border-dashed dark:border-slate-800 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                             <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                                <History className="h-8 w-8 text-muted-foreground/50" />
                            </div>
                            <p className="text-muted-foreground text-sm font-bold">Nessun risultato in archivio.</p>
                        </div>
                    ) : (
                        visiblePastEvents.map(event => (
                            <Link key={event.id} href={`/evento/${event.id}`} className="block transform transition-all duration-200 hover:scale-[1.02] opacity-95 hover:opacity-100">
                                <EventCard 
                                    event={event} 
                                    opponentLogo={getLogo(event.avversario)} 
                                    isManager={isManager}
                                    onEdit={handleEditEvent}
                                />
                            </Link>
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </>
      )}

      {isManager && (
          <Button 
            className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-2xl bg-purple-600 hover:bg-purple-700 z-50 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
            onClick={handleCreateNew}
          >
              <Plus className="h-8 w-8 text-white" />
          </Button>
      )}

      <EventDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        eventToEdit={editingEvent}
        onSave={handleSaveEvent}
      />

    </main>
  );
}