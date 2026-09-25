"use client"

import { useEffect, useState, use } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseBrowser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info, Trash2, Shield, Eye, UserCheck, UserX, Hand, Users, Share2, MoreHorizontal } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EventDialog } from '@/components/EventDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner";
import { genMsgWhatsApp } from '@/lib/whatsappTemplate';
import { Event } from '@/lib/types';
import { fetchEventById, fetchTeamLogoByName, fetchRosterForEvent, fetchAttendanceForEvent, type AttendanceRow } from '@/lib/api';
import { ageGroupAt, EVENT_TYPE_LABEL, isMatchEvent, isU35At } from '@/lib/utils';
import { useAppSession } from '@/components/auth/AppSessionProvider';
import { OfficialFormationPanel } from '@/components/formations/OfficialFormationPanel';
import { EventRosterPanel } from '@/components/events/EventRosterPanel';
import { PageContainer } from "@/components/layout/PageContainer";

interface RosterPlayer {
  id: string;
  nome: string;
  cognome: string;
  ruolo?: string | null;
  avatar_url?: string | null;
  data_nascita?: string | null;
  is_staff?: boolean;
  training_only?: boolean;
  status: string | null;
  vote_time: string | null;
  modified_by: string | null;
}

const STAT_TONES = {
  neutral: "border-border bg-card text-foreground",
  sky: "border-sky-100 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  green: "border-green-100 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100",
  amber: "border-amber-100 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  red: "border-red-100 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
} as const;

function StatTile({ className = "", count, icon: Icon, label, tone }: {
  className?: string;
  count: number;
  icon: typeof Users;
  label: string;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border p-2 shadow-xs ${STAT_TONES[tone]} ${className}`}>
      <span className="text-2xl font-black tabular-nums">{count}</span>
      <span className="flex items-center gap-1 text-[11px] font-bold uppercase">
        <Icon aria-hidden="true" className="size-3" />
        {label}
      </span>
    </div>
  );
}

function withAttendance<T extends { id: string }>(players: T[], rows: AttendanceRow[]) {
  const byProfile = new Map(rows.map(row => [row.profile_id, row]));
  return players.map(player => {
    const vote = byProfile.get(player.id);
    return {
      ...player,
      status: vote?.status ?? null,
      vote_time: vote?.updated_at || vote?.created_at || null,
      modified_by: vote?.modified_by ?? null,
    };
  });
}

function opponentOf(event: Event) {
  if (event.squadra_casa && event.squadra_ospite) {
    return event.squadra_casa.toLowerCase().includes('chigi') ? event.squadra_ospite : event.squadra_casa;
  }
  return event.avversario ?? null;
}

// Barra sotto l'header fisso: stessa superficie, a tutta larghezza, attaccata.
function EventBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-16 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-2 sm:px-5">
        {children}
      </div>
    </div>
  );
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const {
    isAssociated,
    isManager,
    loading: sessionLoading,
    profile,
    user,
  } = useAppSession();
  const myProfileId = profile?.id ?? null;

  const [event, setEvent] = useState<Event | null>(null);
  const [opponentLogo, setOpponentLogo] = useState<{ name: string; url: string | null } | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [surnamesByProfileId, setSurnamesByProfileId] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  // ponytail: istante di apertura; se l'evento inizia a pagina aperta ci pensa la RLS.
  const [openedAt] = useState(() => Date.now());

  const isMatch = event ? isMatchEvent(event.tipo) : false;
  const opponent = event && isMatch ? opponentOf(event) : null;

  // Si carica una volta sola, a sessione risolta: prima isAssociated è sempre false.
  useEffect(() => {
    if (sessionLoading) return;
    let active = true;
    Promise.all([
      fetchEventById(supabase, id),
      isAssociated ? fetchRosterForEvent(supabase, id) : Promise.resolve([]),
      isAssociated ? fetchAttendanceForEvent(supabase, id) : Promise.resolve([]),
    ])
      .then(([eventData, profiles, attendance]) => {
        if (!active) return;
        setEvent(eventData);
        setSurnamesByProfileId(Object.fromEntries(profiles.map(p => [p.id, p.cognome])));
        setRoster(withAttendance(profiles, attendance));
      })
      .catch((error) => {
        if (!active) return;
        console.error("Errore caricamento evento:", error);
        toast.error("Impossibile caricare l'evento.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, isAssociated, sessionLoading]);

  useEffect(() => {
    const refreshAttendance = () => {
      fetchAttendanceForEvent(supabase, id)
        .then(rows => setRoster(prev => withAttendance(prev, rows)))
        .catch(error => console.error("Errore aggiornamento presenze:", error));
    };

    let channel = supabase
      .channel(`event_detail_${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        (payload) => setEvent(prev => prev ? { ...prev, ...(payload.new as Partial<Event>) } : null)
      );
    if (isAssociated) {
      channel = channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${id}` },
          refreshAttendance
        )
        // I DELETE non sono filtrabili e con RLS portano solo la PK: si ricarica.
        // ponytail: ricarica anche per voti rimossi su altri eventi, filtrare se il traffico cresce.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance' }, refreshAttendance);
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, isAssociated]);

  useEffect(() => {
    if (!opponent) return;
    let active = true;
    fetchTeamLogoByName(supabase, opponent).then(url => {
      if (active) setOpponentLogo({ name: opponent, url });
    });
    return () => { active = false; };
  }, [opponent]);

  const userStatus = roster.find(p => p.id === myProfileId)?.status ?? null;

  const handleVote = async (newStatus: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE') => {
    if (!user) {
        toast.error("Devi effettuare il login per votare.");
        return;
    }
    if (!myProfileId) {
        toast.error("Profilo giocatore non trovato. Contatta l'amministratore.");
        return;
    }

    const prevRoster = roster;
    const now = new Date().toISOString();

    setRoster(prev => prev.map(p => p.id === myProfileId ? {
        ...p,
        status: newStatus,
        vote_time: now,
        modified_by: myProfileId
    } : p));

    const { error } = await supabase.from('attendance').upsert({
        event_id: id,
        profile_id: myProfileId,
        status: newStatus,
        modified_by: myProfileId
    }, { onConflict: 'event_id, profile_id' });

    if (error) {
        console.error("Errore salvataggio voto:", error);
        setRoster(prevRoster);
        toast.error("Disponibilità non salvata", {
            description: error.code === '42501' ? "Le disponibilità per questo evento sono chiuse." : error.message,
        });
    } else {
        toast.success("Disponibilità aggiornata!");
    }
  };

  const handleResetVote = async () => {
      if (!user || !myProfileId) return;
      const prevRoster = roster;

      setRoster(prev => prev.map(p => p.id === myProfileId ? { ...p, status: null, vote_time: null, modified_by: null } : p));

      const { error } = await supabase.from('attendance').delete().match({ event_id: id, profile_id: myProfileId });

      if (error) {
          setRoster(prevRoster);
          toast.error("Errore rimozione voto.");
      } else {
          toast.info("Scelta rimossa");
      }
  }

  const handleEventUpdate = async (updatedData: Partial<Event>) => {
      const prevEvent = event;
      setEvent(event ? { ...event, ...updatedData } : null);
      const { data, error } = await supabase.from('events').update(updatedData).eq('id', id).select();
      if (error || !data) {
          setEvent(prevEvent);
          throw error ?? new Error("Errore salvataggio.");
      }
  };

  const handleDeleteEvent = async () => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) toast.error(error.message); else { toast.success("Eliminato."); router.push('/'); }
  }

  const handleCopyWhatsApp = () => {
    if (!event) return;
    if (!event.data_ora) {
        toast.error("Evento senza data: imposta data e ora prima di generare il messaggio.");
        return;
    }
    const formattedPresenze = roster.map(p => ({
        status: p.status,
        profiles: p
    }));

    const testo = genMsgWhatsApp(event, formattedPresenze);

    navigator.clipboard.writeText(testo).then(() => {
        toast.success('Messaggio copiato!', {
            description: 'Pronto per essere incollato su WhatsApp.'
        });
    }).catch(err => {
        console.error("Errore nella copia: ", err);
        toast.error("Errore durante la copia del messaggio.");
    });
  };

  if (loading) return (
    <>
      <EventBar>
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="h-5 w-32" />
      </EventBar>
      <PageContainer className="bg-background" contentClassName="pb-24">
        <div className="mx-auto max-w-lg space-y-6">
          <div className="flex flex-col items-center gap-3 mt-2">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        </div>
      </PageContainer>
    </>
  );
  if (!event) return (
    <PageContainer contentClassName="mx-auto max-w-lg">
      <p className="py-10 text-center">Evento non trovato.</p>
    </PageContainer>
  );

  const isCancelled = event.cancellato;
  const eventDate = event.data_ora ? new Date(event.data_ora) : new Date('invalid');
  // Dopo l'inizio la disponibilità la gestisce il manager col check-in (RLS allineata).
  const canVote = isAssociated && !event.giocata && !isCancelled && !(eventDate.getTime() <= openedAt);
  const logoUrl = opponentLogo?.name === opponent ? opponentLogo.url : null;

  const presentPlayers = roster.filter(p => p.status === 'PRESENTE');
  const spectatorPlayers = roster.filter(p => p.status === 'INFORTUNATO_PRESENTE');
  const absentPlayers = roster.filter(p => p.status === 'ASSENTE');

  const countOver35 = presentPlayers.filter(p => ageGroupAt(p.data_nascita, eventDate) === 'OVER_35' && p.ruolo !== 'PORTIERE').length;
  const countU35 = presentPlayers.filter(p => isU35At(p.data_nascita, eventDate) && p.ruolo !== 'PORTIERE').length;
  const countGoalies = presentPlayers.filter(p => p.ruolo === 'PORTIERE').length;
  const countSpectators = spectatorPlayers.length;
  const countAbsents = absentPlayers.length;

  const countTrainingPresent = presentPlayers.length;
  const countTrainingKO = spectatorPlayers.length;

  const sortedRoster = [...roster].sort((a, b) => {
      if (a.is_staff && !b.is_staff) return 1;
      if (!a.is_staff && b.is_staff) return -1;

      const score = (s: string | null) => {
          if (s === 'PRESENTE') return 4;
          if (s === 'INFORTUNATO_PRESENTE') return 3;
          if (s === 'ASSENTE') return 1;
          return 0;
      };
      const scoreA = score(a.status);
      const scoreB = score(b.status);

      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.cognome.localeCompare(b.cognome);
  });

  let scoreBlock = null;
  if (isMatch && event.giocata) {
      const isChigiCasa = event.squadra_casa?.toLowerCase().includes('chigi');
      const golNoi = isChigiCasa ? (event.gol_casa ?? 0) : (event.gol_ospite ?? 0);
      const golLoro = isChigiCasa ? (event.gol_ospite ?? 0) : (event.gol_casa ?? 0);
      let resultColor = "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-200";
      let resultText = "PAREGGIO";
      if (golNoi > golLoro) { resultColor = "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"; resultText = "VITTORIA"; }
      else if (golNoi < golLoro) { resultColor = "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300"; resultText = "SCONFITTA"; }

      scoreBlock = (
          <div className="flex flex-col items-center mt-2 animate-in zoom-in">
              <div className={`px-6 py-2 rounded-2xl font-mono text-4xl font-black tracking-tighter ${resultColor}`}>{event.gol_casa} - {event.gol_ospite}</div>
              <Badge variant="outline" className="mt-1 text-[11px] font-bold border-0 text-muted-foreground">{resultText}</Badge>
          </div>
      );
  }

  return (
    <>
      <EventBar>
        <Button aria-label="Torna indietro" variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft aria-hidden="true" className="size-5" /></Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{EVENT_TYPE_LABEL[event.tipo]}</h1>
        {isCancelled && <Badge variant="destructive" className="shrink-0">Annullato</Badge>}
        {isManager && (
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    aria-label="Copia informazioni per WhatsApp"
                    onClick={handleCopyWhatsApp}
                    size="icon"
                    variant="ghost"
                    className="text-green-700 hover:bg-green-500/10 hover:text-green-800 dark:text-green-400"
                >
                    <Share2 aria-hidden="true" />
                </Button>
                <Button size="sm" onClick={() => setEditDialogOpen(true)} className="hidden sm:inline-flex bg-operative text-operative-foreground hover:bg-operative/90"><Pencil aria-hidden="true" /> Modifica</Button>
                <Button aria-label="Elimina evento" variant="ghost" size="icon" onClick={() => setDeleteDialogOpen(true)} className="hidden sm:inline-flex text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 aria-hidden="true" /></Button>
                <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
                    <PopoverTrigger asChild>
                        <Button aria-label="Altre azioni" variant="ghost" size="icon" className="sm:hidden"><MoreHorizontal aria-hidden="true" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1">
                        <Button variant="ghost" className="w-full justify-start" onClick={() => { setActionsOpen(false); setEditDialogOpen(true); }}><Pencil aria-hidden="true" /> Modifica</Button>
                        <Button variant="ghost" className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setActionsOpen(false); setDeleteDialogOpen(true); }}><Trash2 aria-hidden="true" /> Elimina</Button>
                    </PopoverContent>
                </Popover>
            </div>
        )}
      </EventBar>

      <PageContainer
        className="bg-background text-foreground"
        contentClassName="pb-24"
      >
        {/* Desktop: info e disponibilità a sinistra (sticky), formazione e rosa a destra. */}
        <div className={`mx-auto grid max-w-lg gap-6 ${isAssociated ? 'lg:max-w-6xl lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8' : ''}`}>
          {/* ponytail: colonna sticky senza scroll interno, regge finché note brevi. */}
          <div className={`space-y-6 ${isAssociated ? 'lg:sticky lg:top-34' : ''}`}>
            <div className="text-center space-y-3 mt-2 lg:mt-0 lg:rounded-xl lg:border lg:bg-card lg:p-6 lg:shadow-xs">
                {isMatch && logoUrl && (
                    <div className="flex justify-center mb-2">
                        <Avatar className="h-20 w-20 border-4 border-slate-100 shadow-lg bg-white"><AvatarImage src={logoUrl} alt={`Logo ${opponent ?? 'avversario'}`} className="object-contain p-1" /><AvatarFallback><Shield className="h-10 w-10 text-muted-foreground"/></AvatarFallback></Avatar>
                    </div>
                )}
                <h2 className={`text-3xl font-black uppercase leading-none tracking-tight ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{isMatch
                    ? opponent || "Avversario da definire"
                    : event.data_ora ? format(new Date(event.data_ora), 'EEEE d MMMM', { locale: it }) : "Data da definire"}</h2>
                {scoreBlock}
                <div className="flex flex-col gap-1 justify-center items-center text-sm text-muted-foreground pt-2">
                    {/* Per gli allenamenti la data è già il titolo. */}
                    {isMatch && <span className="flex items-center gap-1 font-medium"><Calendar aria-hidden="true" className="h-4 w-4 text-primary"/> {event.data_ora ? format(new Date(event.data_ora), 'd MMM yyyy', {locale: it}) : '—'}</span>}
                    <div className="flex items-center gap-3"><span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4 text-primary"/> {event.data_ora ? format(new Date(event.data_ora), 'HH:mm') : '—'}</span></div>
                </div>
                <div className="flex justify-center items-center gap-1 text-sm text-muted-foreground font-semibold"><MapPin className="h-4 w-4"/> {event.luogo}</div>
                {event.note && (
                    <div className="mt-4 bg-muted/30 p-3 rounded-lg border border-border text-sm text-muted-foreground flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider text-muted-foreground/70"><Info className="h-3 w-3" /> Note Mister</div>
                        <p className="italic text-center">{event.note}</p>
                    </div>
                )}
                {isCancelled && <p className="text-red-700 dark:text-red-300 font-bold text-sm bg-red-100 dark:bg-red-900/20 p-2 rounded">EVENTO ANNULLATO</p>}
            </div>

            {!isAssociated && (
              <Card className="border-dashed">
                <CardContent className="p-4 text-center">
                  <h3 className="font-bold">Accedi alle funzioni di squadra</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Disponibilità, presenze e formazione ufficiale richiedono un
                    account associato.
                  </p>
                  <Button asChild className="mt-3" size="sm">
                    <Link href={user ? "/profilo" : "/login"}>
                      {user ? "Controlla associazione" : "Accedi"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isAssociated && !isCancelled && (
                isMatch ? (
                    <div className="grid grid-cols-6 gap-2">
                        <StatTile className="col-span-2" count={countOver35} icon={Users} label="Over 35" tone="neutral" />
                        <StatTile className="col-span-2" count={countU35} icon={Users} label="Under 35" tone="sky" />
                        <StatTile className="col-span-2" count={countGoalies} icon={Hand} label="Portieri" tone="neutral" />
                        <StatTile className="col-span-3" count={countSpectators} icon={Eye} label="Spettatori" tone="neutral" />
                        <StatTile className="col-span-3" count={countAbsents} icon={UserX} label="Assenti" tone="red" />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        <StatTile count={countTrainingPresent} icon={UserCheck} label="Presenti" tone="green" />
                        <StatTile count={countTrainingKO} icon={AlertCircle} label="KO" tone="amber" />
                        <StatTile count={countAbsents} icon={UserX} label="Assenti" tone="red" />
                    </div>
                )
            )}

            {canVote && (
                <Card className="bg-muted/10 border-dashed border-2 shadow-sm border-slate-300 dark:border-slate-700">
                    <CardContent className="p-4 space-y-3">
                        <h3 className="text-center font-bold text-muted-foreground text-xs uppercase tracking-wide">La tua disponibilità</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                variant={userStatus === 'PRESENTE' ? 'default' : 'outline'}
                                aria-pressed={userStatus === 'PRESENTE'}
                                className={`flex flex-col h-16 gap-1 border-2 transition-[color,background-color,border-color] ${userStatus === 'PRESENTE' ? 'bg-green-700 hover:bg-green-800 border-transparent text-white' : 'hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-300 border-muted'}`}
                                onClick={() => handleVote('PRESENTE')}
                            >
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-[11px] font-bold">CI SONO</span>
                            </Button>

                            <Button
                                variant={userStatus === 'INFORTUNATO_PRESENTE' ? 'default' : 'outline'}
                                aria-pressed={userStatus === 'INFORTUNATO_PRESENTE'}
                                className={`flex flex-col h-16 gap-1 border-2 transition-[color,background-color,border-color] ${userStatus === 'INFORTUNATO_PRESENTE'
                                    ? (isMatch ? 'bg-slate-600 hover:bg-slate-700 border-transparent text-white' : 'bg-amber-400 hover:bg-amber-500 border-transparent text-amber-950')
                                    : 'hover:bg-muted border-muted'}`}
                                onClick={() => handleVote('INFORTUNATO_PRESENTE')}
                            >
                                {isMatch ? <Eye className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                                <span className="text-[11px] font-bold leading-tight text-center whitespace-normal">
                                    {isMatch ? "SPETTATORE" : "PRESENTE (KO)"}
                                </span>
                            </Button>

                            <Button
                                variant={userStatus === 'ASSENTE' ? 'default' : 'outline'}
                                aria-pressed={userStatus === 'ASSENTE'}
                                className={`flex flex-col h-16 gap-1 border-2 transition-[color,background-color,border-color] ${userStatus === 'ASSENTE' ? 'bg-red-700 hover:bg-red-800 border-transparent text-white' : 'hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300 border-muted'}`}
                                onClick={() => handleVote('ASSENTE')}
                            >
                                <XCircle className="h-5 w-5" />
                                <span className="text-[11px] font-bold">ASSENTE</span>
                            </Button>
                        </div>

                        {userStatus && (
                            <Button variant="ghost" size="sm" onClick={handleResetVote} className="w-full text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 aria-hidden="true" className="h-3 w-3 mr-1" /> Rimuovi la mia scelta
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
          </div>

          {isAssociated && (
            <div className="space-y-6">
              {isMatch && (
                <OfficialFormationPanel
                  eventDate={event.data_ora}
                  eventId={id}
                />
              )}
              <EventRosterPanel
                eventDate={eventDate}
                eventId={id}
                isManager={isManager}
                isMatch={isMatch}
                managerProfileId={myProfileId}
                namesByProfileId={surnamesByProfileId}
                roster={sortedRoster}
              />
            </div>
          )}
        </div>
      </PageContainer>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Eliminare l’evento?</AlertDialogTitle><AlertDialogDescription>L’evento sparisce dal calendario con disponibilità e presenze. L’azione non si può annullare.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <EventDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        eventToEdit={event}
        onSave={handleEventUpdate}
      />
    </>
  );
}
