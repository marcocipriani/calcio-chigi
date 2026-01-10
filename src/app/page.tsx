"use client"

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EventCard } from '@/components/EventCard';
import { EventDialog } from '@/components/EventDialog'; 
import { Loader2, Trophy, Dumbbell, CalendarDays, History, Plus, Clock, LayoutGrid, List, ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    differenceInDays, 
    differenceInHours, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths, 
    format,
    isToday
} from 'date-fns';
import { it } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type FilterType = 'ALL' | 'PARTITA' | 'ALLENAMENTO';
type ViewMode = 'ACTIVITY' | 'CALENDAR';

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('ACTIVITY');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [isManager, setIsManager] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  useEffect(() => {
    fetchData();

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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('is_manager').eq('user_id', user.id).single();
        if (profile?.is_manager) setIsManager(true);
    }

    const { data: eventsData, error } = await supabase
      .from('events')
      .select(`*, attendance (status, profiles (nome, avatar_url))`)
      .order('data_ora', { ascending: true });
    
    if(error) console.error("Errore DB:", error);

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
          const res = await supabase.from('events').update(eventData).eq('id', editingEvent.id);
          error = res.error;
      } else {
          const res = await supabase.from('events').insert([eventData]);
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

  const applyTypeFilter = (list: any[]) => {
    if (filter === 'ALL') return list;
    return list.filter(e => e.tipo === filter);
  };

  const filteredEvents = applyTypeFilter(myEvents);

  const futureRaw = filteredEvents.filter(e => new Date(e.data_ora) >= yesterday).sort((a,b) => new Date(a.data_ora).getTime() - new Date(b.data_ora).getTime());
  
  const pastRaw = filteredEvents.filter(e => {
      const isPast = new Date(e.data_ora) < yesterday;
      if (!isPast) return false;
      if (e.tipo === 'PARTITA') return e.giocata === true;
      return true;
  }).reverse();

  const nextMatch = filteredEvents.find(e => e.tipo === 'PARTITA' && new Date(e.data_ora) > now);
  
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

  const renderCalendar = () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(monthStart);
      const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
      const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
      const dateFormat = "d";
      const days = eachDayOfInterval({ start: startDate, end: endDate });

      const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

      return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 select-none">
              <div className="flex items-center justify-between mb-4 px-2">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="font-black text-lg capitalize text-foreground">
                      {format(currentMonth, 'MMMM yyyy', { locale: it })}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronRight className="h-5 w-5" />
                  </Button>
              </div>

              <div className="grid grid-cols-7 mb-2">
                  {weekDays.map(day => (
                      <div key={day} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {day}
                      </div>
                  ))}
              </div>

              <div className="grid grid-cols-7 gap-1 lg:gap-2">
                  {days.map((day, i) => {
                      const dayEvents = filteredEvents.filter(e => isSameDay(new Date(e.data_ora), day));
                      const isCurrentMonth = isSameMonth(day, monthStart);
                      const isDayToday = isToday(day);

                      return (
                          <div 
                            key={i} 
                            className={`min-h-[80px] lg:min-h-[100px] rounded-xl border flex flex-col items-center justify-start pt-1.5 relative transition-colors
                                ${isCurrentMonth ? 'bg-card' : 'bg-muted/20 opacity-50'}
                                ${isDayToday ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border'}
                            `}
                          >
                              <span className={`text-xs font-medium mb-1 ${isDayToday ? 'text-primary font-black' : 'text-muted-foreground'}`}>
                                  {format(day, dateFormat)}
                              </span>

                              <div className="flex flex-wrap justify-center gap-1.5 w-full px-1">
                                  {dayEvents.map((evt) => {
                                      const isMatch = evt.tipo === 'PARTITA';
                                      const isCancelled = evt.cancellato;
                                      const opponentLogo = isMatch ? getLogo(evt.avversario) : null;
                                      
                                      return (
                                        <TooltipProvider key={evt.id}>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Link href={`/evento/${evt.id}`}>
                                                        <div 
                                                            className={`h-7 w-7 flex items-center justify-center rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform overflow-hidden
                                                                ${isCancelled 
                                                                    ? 'bg-slate-200 text-slate-500' 
                                                                    : (isMatch 
                                                                        ? 'bg-white border border-blue-600' // Bordo blu per le partite
                                                                        : 'bg-orange-500 text-white border border-transparent') // Arancione per allenamenti
                                                                }
                                                            `}
                                                        >
                                                            {isCancelled ? (
                                                                <X className="h-4 w-4" /> 
                                                            ) : (isMatch ? (
                                                                opponentLogo ? (
                                                                    <img src={opponentLogo} alt="vs" className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <Trophy className="h-3.5 w-3.5 text-blue-600" />
                                                                )
                                                            ) : (
                                                                <Dumbbell className="h-3.5 w-3.5" />
                                                            ))}
                                                        </div>
                                                    </Link>
                                                </TooltipTrigger>
                                                <TooltipContent className="text-xs bg-slate-900 text-white border-slate-800 p-2">
                                                    <div className="font-bold mb-0.5">
                                                        {isCancelled ? 'ANNULLATO' : (isMatch ? 'PARTITA' : 'ALLENAMENTO')}
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-80">
                                                        <Clock className="h-3 w-3" /> {format(new Date(evt.data_ora), 'HH:mm')}
                                                    </div>
                                                    {isMatch && (
                                                        <div className="font-semibold text-blue-300 mt-1">
                                                            vs {evt.avversario}
                                                        </div>
                                                    )}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                      );
                                  })}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )
  }

  return (
    <main className="container max-w-md mx-auto px-4 py-4 space-y-4 pb-20">
      
      <div className="flex flex-col gap-2">
          <div className="flex justify-between items-end">
              <div>
                  <h2 className="text-3xl font-black text-foreground tracking-tight">Calendario</h2>
                  <p className="text-sm text-muted-foreground font-medium">Gli impegni della squadra</p>
              </div>
              
              {nextMatch && (
                <div className="flex flex-col items-end pb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Next Match</span>
                    <div className="bg-red-600 text-white px-2 py-1 rounded-md text-xs font-black flex items-center gap-1 shadow-sm animate-pulse">
                        <Clock className="h-3 w-3" />
                        {getCountdownLabel(nextMatch.data_ora)}
                    </div>
                </div>
              )}
          </div>

          <div className="flex items-center justify-between gap-2 py-2">
              
              {/* FILTRI CAPSULE RAGGRUPPATE */}
              <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-full overflow-hidden">
                <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter('ALL')}
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-all border border-transparent 
                        ${filter === 'ALL' 
                            ? 'bg-slate-800 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                        }`}
                >
                     Tutti
                </Button>
                <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter('PARTITA')}
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-all border border-transparent
                        ${filter === 'PARTITA' 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-blue-100 hover:text-blue-700'
                        }`}
                >
                    <Trophy className="h-3.5 w-3.5 mr-2" /> Partite
                </Button>
                <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter('ALLENAMENTO')}
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-all border border-transparent
                        ${filter === 'ALLENAMENTO' 
                            ? 'bg-orange-500 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-orange-100 hover:text-orange-700'
                        }`}
                >
                    <Dumbbell className="h-3.5 w-3.5 mr-2" /> Allenamenti
                </Button>
              </div>

              <div className="flex items-center bg-muted/50 p-1 rounded-xl shrink-0">
                  <Button 
                    variant={viewMode === 'ACTIVITY' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className={`h-8 w-9 p-0 rounded-lg transition-all ${viewMode === 'ACTIVITY' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-transparent'}`}
                    onClick={() => setViewMode('ACTIVITY')}
                  >
                      <List className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant={viewMode === 'CALENDAR' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className={`h-8 w-9 p-0 rounded-lg transition-all ${viewMode === 'CALENDAR' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-transparent'}`}
                    onClick={() => setViewMode('CALENDAR')}
                  >
                      <LayoutGrid className="h-4 w-4" />
                  </Button>
              </div>

          </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <>
            {viewMode === 'CALENDAR' ? (
                renderCalendar()
            ) : (
                <Tabs defaultValue="upcoming" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-muted/50 p-1 rounded-xl backdrop-blur-sm dark:bg-slate-900/50 border dark:border-slate-800">
                        <TabsTrigger value="upcoming" className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-lg gap-2 transition-all">
                            <CalendarDays className="h-4 w-4" /> Prossimi
                        </TabsTrigger>
                        <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-lg gap-2 transition-all">
                            <History className="h-4 w-4" /> Archivio
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upcoming" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {futureRaw.length === 0 ? (
                            <div className="text-center py-16 bg-card/50 rounded-3xl border border-dashed dark:border-slate-800 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                                    <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <p className="text-muted-foreground text-sm font-bold">Nessun impegno in programma.</p>
                            </div>
                        ) : (
                            futureRaw.map(event => {
                                const isNext = event.id === nextMatch?.id;
                                
                                if (isNext) {
                                    return (
                                        <div key={event.id} className="relative w-full mt-6 mb-2">
                                            {/* Badge centrato sul bordo superiore */}
                                            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                                                <span className="bg-[#D32F2F] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wider">
                                                    Next Match
                                                </span>
                                            </div>
                                            {/* Card con bordo rosso fissato, bg-white e flex per riempire lo spazio */}
                                            <Link 
                                                href={`/evento/${event.id}`} 
                                                className="flex flex-col w-full bg-white border-2 border-[#D32F2F] rounded-xl shadow-sm overflow-hidden transform transition-all duration-200 hover:scale-[1.02]"
                                            >
                                                <EventCard 
                                                    event={event} 
                                                    opponentLogo={getLogo(event.avversario)} 
                                                    isManager={isManager}
                                                    onEdit={handleEditEvent}
                                                />
                                            </Link>
                                        </div>
                                    )
                                }

                                return (
                                    <Link key={event.id} href={`/evento/${event.id}`} className="block transform transition-all duration-200 hover:scale-[1.02]">
                                        <EventCard 
                                            event={event} 
                                            opponentLogo={getLogo(event.avversario)} 
                                            isManager={isManager}
                                            onEdit={handleEditEvent}
                                        />
                                    </Link>
                                )
                            })
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {pastRaw.length === 0 ? (
                             <div className="text-center py-16 bg-card/50 rounded-3xl border border-dashed dark:border-slate-800 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                 <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                                    <History className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <p className="text-muted-foreground text-sm font-bold">Nessun risultato in archivio.</p>
                            </div>
                        ) : (
                            pastRaw.map(event => (
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
            )}
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