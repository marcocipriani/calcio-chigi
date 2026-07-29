"use client"

import { useEffect, useState, useMemo } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseBrowser';
import { EventCard } from '@/components/EventCard';
import { EventDialog } from '@/components/EventDialog'; 
import { Trophy, Dumbbell, CalendarDays, History, Plus, Clock, List, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageTitleBar } from "@/components/layout/PageTitleBar";
import { Event, Team } from "@/lib/types";
import { getUserContext, fetchCalendarEvents, fetchTeams } from "@/lib/api";

type FilterType = 'ALL' | 'PARTITA' | 'ALLENAMENTO';
type ViewMode = 'ACTIVITY' | 'CALENDAR';

// Mirror the server-side filter in fetchCalendarEvents: all trainings + only Chigi matches.
// Without this, a realtime INSERT of another team's match (e.g. during a full sync) would
// leak non-Chigi matches into the calendar until the next refresh.
const isChigiCalendarEvent = (e: Event) =>
    e.tipo !== 'PARTITA' ||
    !!e.squadra_casa?.toLowerCase().includes('chigi') ||
    !!e.squadra_ospite?.toLowerCase().includes('chigi');

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('ACTIVITY');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [isManager, setIsManager] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const handleRealtimeUpdate = (payload: { eventType: string; new: Event; old: Event }) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      setEvents((currentEvents) => {
          if (eventType === 'INSERT') {
              if (!isChigiCalendarEvent(newRecord)) return currentEvents;
              if (currentEvents.some(e => e.id === newRecord.id)) return currentEvents;
              return [...currentEvents, newRecord].sort((a, b) => new Date(a.data_ora ?? 0).getTime() - new Date(b.data_ora ?? 0).getTime());
          }
          if (eventType === 'UPDATE') {
              return currentEvents.map(e => e.id === newRecord.id ? { ...e, ...newRecord } : e)
                  .sort((a, b) => new Date(a.data_ora ?? 0).getTime() - new Date(b.data_ora ?? 0).getTime());
          }
          if (eventType === 'DELETE') {
              return currentEvents.filter(e => e.id !== oldRecord.id);
          }
          return currentEvents;
      });
  };

  async function fetchData() {
    const { isManager, defaultView } = await getUserContext(supabase);
    if (isManager) setIsManager(true);
    if (defaultView) setViewMode(defaultView as ViewMode);

    const [eventsData, teamsData] = await Promise.all([
      fetchCalendarEvents(supabase),
      fetchTeams(supabase),
    ]);

    setEvents(eventsData);
    setTeams(teamsData);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('public:events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          handleRealtimeUpdate(payload as unknown as { eventType: string; new: Event; old: Event });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleCreateNew = () => {
      setEditingEvent(null);
      setDialogOpen(true);
  }

  const handleSaveEvent = async (eventData: Partial<Event>) => {
      const previousEvents = [...events];

      const payload = { ...eventData, ...(editingEvent && !eventData.data_ora ? { data_ora: editingEvent.data_ora } : {}) };

      // Nuovo evento: niente append ottimistico (no id -> card fantasma + duplicato col realtime).
      // L'evento inserito arriva via realtime INSERT. Per gli edit invece aggiorno subito.
      if (editingEvent) {
          setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...payload } : e));
      }

      let error = null;
      if (editingEvent) {
          const res = await supabase.from('events').update(payload).eq('id', editingEvent.id);
          error = res.error;
      } else {
          const res = await supabase.from('events').insert([payload]);
          error = res.error;
      }

      if (error) {
          setEvents(previousEvents);
          throw error;
      }
  }

  const processedEvents = useMemo(() => {
    return events.map(e => {
        let opponent = e.avversario;
        if (e.tipo === 'PARTITA' && e.squadra_casa && e.squadra_ospite) {
            if (e.squadra_casa.toLowerCase().includes('chigi')) {
                opponent = e.squadra_ospite;
            } else if (e.squadra_ospite.toLowerCase().includes('chigi')) {
                opponent = e.squadra_casa;
            }
        }
        return { ...e, avversario: opponent };
    });
  }, [events]);

  const getLogo = (teamName?: string | null) => {
    if (!teamName) return null;
    const normalizedName = teamName.toLowerCase().trim();
    const team = teams.find(t => 
        t.nome && (
            normalizedName.includes(t.nome.toLowerCase().trim()) || 
            t.nome.toLowerCase().trim().includes(normalizedName)
        )
    );
    return team?.logo_url;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0,0,0,0);
  const now = new Date();

  const applyTypeFilter = (list: Event[]) => {
    if (filter === 'ALL') return list;
    return list.filter(e => e.tipo === filter);
  };

  const filteredEvents = applyTypeFilter(processedEvents);

  const futureRaw = filteredEvents.filter(e => e.data_ora && new Date(e.data_ora) >= yesterday).sort((a,b) => new Date(a.data_ora!).getTime() - new Date(b.data_ora!).getTime());

  const pastRaw = filteredEvents.filter(e => {
      if (!e.data_ora) return e.giocata === true; // forfeit: no date, show in archive if played
      const isPast = new Date(e.data_ora) < yesterday;
      if (!isPast) return false;
      if (e.tipo === 'PARTITA') return e.giocata === true;
      return true;
  }).reverse();

  const nextMatch = filteredEvents.find(e => e.tipo === 'PARTITA' && e.data_ora != null && new Date(e.data_ora) > now);
  
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
                  <Button aria-label="Mese precedente" variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="font-black text-lg capitalize text-foreground">
                      {format(currentMonth, 'MMMM yyyy', { locale: it })}
                  </span>
                  <Button aria-label="Mese successivo" variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
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
                      const dayEvents = filteredEvents.filter(e => e.data_ora && isSameDay(new Date(e.data_ora), day));
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
                                                                        ? 'bg-white border border-blue-600' 
                                                                        : 'bg-orange-500 text-white border border-transparent')
                                                                }
                                                            `}
                                                        >
                                                            {isCancelled ? (
                                                                <X className="h-4 w-4" /> 
                                                            ) : (isMatch ? (
                                                                opponentLogo ? (
                                                                    <Image src={opponentLogo} alt={`Logo ${evt.avversario ?? 'avversario'}`} width={28} height={28} className="h-full w-full object-cover" />
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
                                                        <Clock className="h-3 w-3" /> {evt.data_ora ? format(new Date(evt.data_ora), 'HH:mm') : '—'}
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

  const renderDesktopCalendar = () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(monthStart);
      const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
      const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
      const agenda = futureRaw.slice(0, 6);

      return (
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,0.78fr)] gap-5">
              <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-labelledby="desktop-calendar-heading">
                  <div className="flex items-center justify-between border-b px-5 py-4">
                      <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Vista mensile</p>
                          <h3 id="desktop-calendar-heading" className="mt-0.5 text-xl font-black capitalize">
                              {format(currentMonth, 'MMMM yyyy', { locale: it })}
                          </h3>
                      </div>
                      <div className="flex items-center gap-1">
                          <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs font-bold"
                              onClick={() => setCurrentMonth(new Date())}
                          >
                              Oggi
                          </Button>
                          <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Mese precedente"
                              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                          >
                              <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Mese successivo"
                              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                          >
                              <ChevronRight className="h-4 w-4" />
                          </Button>
                      </div>
                  </div>

                  <div className="grid grid-cols-7 border-b bg-muted/25">
                      {weekDays.map((day) => (
                          <div key={day} className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                              {day}
                          </div>
                      ))}
                  </div>

                  <div className="grid grid-cols-7">
                      {days.map((day) => {
                          const dayEvents = filteredEvents
                              .filter((event) => event.data_ora && isSameDay(new Date(event.data_ora), day))
                              .slice(0, 3);
                          const remaining = filteredEvents.filter(
                              (event) => event.data_ora && isSameDay(new Date(event.data_ora), day)
                          ).length - dayEvents.length;
                          const inMonth = isSameMonth(day, monthStart);
                          const today = isToday(day);

                          return (
                              <div
                                  key={day.toISOString()}
                                  className={`min-h-32 border-b border-r p-2.5 transition-colors last:border-r-0 ${
                                      inMonth ? 'bg-card' : 'bg-muted/15 text-muted-foreground'
                                  } ${today ? 'bg-primary/[0.045] shadow-[inset_0_3px_0_hsl(var(--primary))]' : ''}`}
                              >
                                  <div className="mb-2 flex items-center justify-between">
                                      <span
                                          className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${
                                              today ? 'bg-primary text-primary-foreground' : ''
                                          }`}
                                          aria-current={today ? 'date' : undefined}
                                      >
                                          {format(day, 'd')}
                                      </span>
                                  </div>
                                  <div className="space-y-1">
                                      {dayEvents.map((event) => {
                                          const isMatch = event.tipo === 'PARTITA';
                                          return (
                                              <Link
                                                  key={event.id}
                                                  href={`/evento/${event.id}`}
                                                  aria-label={`${isMatch ? 'Partita' : 'Allenamento'} ${format(new Date(event.data_ora!), 'd MMMM HH:mm', { locale: it })}`}
                                                  className={`group flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                      event.cancellato
                                                          ? 'border-border bg-muted text-muted-foreground line-through'
                                                          : isMatch
                                                              ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                                                              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                                                  }`}
                                              >
                                                  {isMatch ? <Trophy className="h-3 w-3 shrink-0" /> : <Dumbbell className="h-3 w-3 shrink-0" />}
                                                  <span className="truncate">
                                                      {format(new Date(event.data_ora!), 'HH:mm')} · {isMatch ? event.avversario : 'Allenamento'}
                                                  </span>
                                              </Link>
                                          );
                                      })}
                                      {remaining > 0 && (
                                          <span className="block px-2 pt-0.5 text-[10px] font-bold text-muted-foreground">
                                              +{remaining} {remaining === 1 ? 'altro' : 'altri'}
                                          </span>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </section>

              <aside className="space-y-3" aria-labelledby="desktop-agenda-heading">
                  <div className="sticky top-20 rounded-2xl border bg-card p-4 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                          <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Agenda</p>
                              <h3 id="desktop-agenda-heading" className="text-lg font-black">Prossimi impegni</h3>
                          </div>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-black">{futureRaw.length}</span>
                      </div>

                      {agenda.length === 0 ? (
                          <p className="rounded-xl border border-dashed p-6 text-center text-sm font-medium text-muted-foreground">
                              Nessun impegno in programma.
                          </p>
                      ) : (
                          <div className="space-y-2">
                              {agenda.map((event) => {
                                  const date = new Date(event.data_ora!);
                                  const isMatch = event.tipo === 'PARTITA';
                                  const isNext = event.id === nextMatch?.id;
                                  return (
                                      <Link
                                          key={event.id}
                                          href={`/evento/${event.id}`}
                                          className={`grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border p-2.5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                              isNext ? 'border-red-500 bg-red-50/70 dark:bg-red-950/20' : 'hover:border-primary/40'
                                          }`}
                                      >
                                          <div className="rounded-lg bg-muted/65 py-1.5 text-center">
                                              <span className="block text-[9px] font-black uppercase text-slate-700 dark:text-slate-200">{format(date, 'MMM', { locale: it })}</span>
                                              <span className="block text-lg font-black leading-none">{format(date, 'd')}</span>
                                          </div>
                                          <div className="min-w-0">
                                              <p className="truncate text-sm font-black">
                                                  {isMatch ? event.avversario : 'Allenamento'}
                                              </p>
                                              <p className="truncate text-[11px] font-medium text-muted-foreground">
                                                  {format(date, 'EEEE · HH:mm', { locale: it })} · {event.luogo || 'Luogo da definire'}
                                              </p>
                                          </div>
                                          <span className={`h-2.5 w-2.5 rounded-full ${isMatch ? 'bg-blue-500' : 'bg-amber-500'}`} aria-hidden="true" />
                                      </Link>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </aside>
          </div>
      );
  };

  return (
    <PageContainer contentClassName="mx-auto max-w-md pb-20 lg:max-w-7xl">
      <main className="space-y-4">
      
      <div className="flex flex-col gap-2">
          <PageTitleBar
            actions={isManager ? (
              <Button
                aria-label="Aggiungi evento"
                className="hidden gap-1.5 sm:inline-flex"
                onClick={handleCreateNew}
                size="sm"
              >
                <Plus aria-hidden="true" />
                Aggiungi evento
              </Button>
            ) : null}
            context={nextMatch ? (
              <div className="flex justify-end">
                <div className="flex flex-col items-end pb-1">
                  <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next Match</span>
                  <div className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-black text-white shadow-sm animate-pulse">
                    <Clock className="h-3 w-3" />
                    {getCountdownLabel(nextMatch.data_ora!)}
                  </div>
                </div>
              </div>
            ) : null}
            subtitle="Gli impegni della squadra"
            title="Calendario"
          />

          <div className="flex items-center justify-between gap-2 py-2">
              
              <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-full overflow-hidden">
                <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter('ALL')}
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-[color,background-color,box-shadow] border border-transparent
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
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-[color,background-color,box-shadow] border border-transparent
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
                    className={`rounded-full h-8 px-4 text-xs font-bold transition-[color,background-color,box-shadow] border border-transparent
                        ${filter === 'ALLENAMENTO' 
                            ? 'bg-orange-500 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-orange-100 hover:text-orange-700'
                        }`}
                >
                    <Dumbbell className="h-3.5 w-3.5 mr-2" /> Allenamenti
                </Button>
              </div>

              <div className="flex items-center bg-muted/50 p-1 rounded-xl shrink-0 lg:hidden">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    aria-label="Vista lista"
                    className={`h-8 w-9 p-0 rounded-lg transition-[color,background-color,box-shadow] border border-transparent
                        ${viewMode === 'ACTIVITY' 
                            ? 'bg-slate-800 text-white shadow-sm' 
                            : 'text-muted-foreground hover:bg-gray-200 hover:text-gray-900'
                        }`}
                    onClick={() => setViewMode('ACTIVITY')}
                  >
                      <List className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    aria-label="Vista calendario"
                    className={`h-8 w-9 p-0 rounded-lg transition-[color,background-color,box-shadow] border border-transparent
                        ${viewMode === 'CALENDAR' 
                            ? 'bg-slate-800 text-white shadow-sm' 
                            : 'text-muted-foreground hover:bg-gray-200 hover:text-gray-900'
                        }`}
                    onClick={() => setViewMode('CALENDAR')}
                  >
                      <CalendarDays className="h-4 w-4" />
                  </Button>
              </div>

          </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[120px] w-full rounded-xl" />
          <Skeleton className="h-[120px] w-full rounded-xl" />
          <Skeleton className="h-[120px] w-full rounded-xl" />
        </div>
      ) : (
        <>
            <div className="lg:hidden">
              {viewMode === 'CALENDAR' ? (
                  renderCalendar()
              ) : (
                  <Tabs defaultValue="upcoming" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-muted/50 p-1 rounded-xl backdrop-blur-sm dark:bg-slate-900/50 border dark:border-slate-800">
                        <TabsTrigger value="upcoming" className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-lg gap-2 transition-[color,background-color,box-shadow]">
                            <CalendarDays className="h-4 w-4" /> Prossimi
                        </TabsTrigger>
                        <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-xs font-black uppercase h-full rounded-lg gap-2 transition-[color,background-color,box-shadow]">
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
                                                <span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wider">
                                                    Next Match
                                                </span>
                                            </div>
                
                                            <Link 
                                                href={`/evento/${event.id}`} 
                                                className="block w-full transform transition-transform duration-200 hover:scale-[1.02] motion-reduce:transform-none"
                                            >
                                                <EventCard 
                                                    event={event} 
                                                    opponentLogo={getLogo(event.avversario)} 
                                                    className="border-2 border-red-600 dark:border-red-600 shadow-lg shadow-red-500/10"
                                                />
                                            </Link>
                                        </div>
                                    )
                                }

                                return (
                                    <Link key={event.id} href={`/evento/${event.id}`} className="block transform transition-transform duration-200 hover:scale-[1.02] motion-reduce:transform-none">
                                        <EventCard 
                                            event={event} 
                                            opponentLogo={getLogo(event.avversario)} 
                                            className='mb-3'
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
                                <Link key={event.id} href={`/evento/${event.id}`} className="block transform opacity-95 transition-[transform,opacity] duration-200 hover:scale-[1.02] hover:opacity-100 motion-reduce:transform-none">
                                    <EventCard 
                                        event={event} 
                                        opponentLogo={getLogo(event.avversario)} 
                                        className="mb-3"
                                    />
                                </Link>
                            ))
                        )}
                    </TabsContent>
                  </Tabs>
              )}
            </div>
            <div className="hidden lg:block">
                {renderDesktopCalendar()}
            </div>
        </>
      )}

      {isManager && (
          <Button 
            aria-label="Aggiungi evento"
            className="fixed bottom-24 right-4 z-50 size-14 rounded-full bg-purple-600 shadow-2xl transition-transform hover:scale-110 hover:bg-purple-700 active:scale-95 sm:hidden"
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
    </PageContainer>
  );
}
