"use client"

import { useEffect, useState, use, useRef } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseBrowser'; 
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info, Trash2, Shield, Eye, UserCheck, UserX, Hand, Users, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EventDialog } from '@/components/EventDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { toast } from "sonner";
import { genMsgWhatsApp } from '@/lib/whatsappTemplate';
import { Event } from '@/lib/types';
import { fetchEventById, fetchTeamLogoByName, fetchRosterForEvent, fetchAttendanceForEvent } from '@/lib/api';
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

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); 
  const router = useRouter();
  const {
    isAssociated,
    isManager,
    profile,
    user,
  } = useAppSession();

  const [event, setEvent] = useState<Event | null>(null);
  const [opponentLogo, setOpponentLogo] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [allProfilesMap, setAllProfilesMap] = useState<Record<string, string>>({});
  const currentUser = user ? { id: user.id } : null;
  const myProfileId = profile?.id ?? null;
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const myProfileIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    myProfileIdRef.current = myProfileId;
  }, [myProfileId]);

  useEffect(() => {
    loadAllData();

    const channel = supabase
      .channel(`event_detail_${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${id}` },
        (payload) => { handleRealtimeUpdate(payload); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.new) setEvent((prev) => prev ? { ...prev, ...(payload.new as Partial<Event>) } : null);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAssociated, myProfileId, supabase]);

  const handleRealtimeUpdate = (payload: { new: Record<string, string | null>; old: Record<string, string | null>; eventType: string }) => {
      const { new: newRecord, old: oldRecord, eventType } = payload;
      const currentProfileId = myProfileIdRef.current;
      if (newRecord?.profile_id === currentProfileId && newRecord?.modified_by === currentProfileId) return;

      if (eventType === 'DELETE' && oldRecord) {
          setRoster(prev => prev.map(p =>
              p.id === oldRecord.profile_id ? { ...p, status: null, vote_time: null, modified_by: null } : p
          ));
          if (oldRecord.profile_id === currentProfileId) setUserStatus(null);
      }

      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
          setRoster(prev => prev.map(p =>
              p.id === newRecord.profile_id ? {
                  ...p,
                  status: newRecord.status,
                  vote_time: newRecord.updated_at || newRecord.created_at,
                  modified_by: newRecord.modified_by
              } : p
          ));
          if (newRecord.profile_id === currentProfileId) setUserStatus(newRecord.status);
      }
  };

  async function loadAllData() {
    const [eventData, allProfiles, attendanceData] = await Promise.all([
        fetchEventById(supabase, id),
        isAssociated ? fetchRosterForEvent(supabase, id) : Promise.resolve([]),
        isAssociated ? fetchAttendanceForEvent(supabase, id) : Promise.resolve([]),
    ]);

    setOpponentLogo(null);

    if (eventData) {
        let opponentName = eventData.avversario;
        if (isMatchEvent(eventData.tipo) && eventData.squadra_ospite && eventData.squadra_casa) {
            opponentName = eventData.squadra_casa.toLowerCase().includes('chigi') ? eventData.squadra_ospite : eventData.squadra_casa;
        }
        const processedEvent = { ...eventData, avversario: opponentName };
        setEvent(processedEvent);

        if (isMatchEvent(processedEvent.tipo) && opponentName) {
            const logo = await fetchTeamLogoByName(supabase, opponentName);
            setOpponentLogo(logo);
        }
    }

    const pMap: Record<string, string> = {};
    allProfiles.forEach(p => { pMap[p.id] = `${p.cognome} ${p.nome}` });
    setAllProfilesMap(pMap);

    const mergedRoster = allProfiles.map(p => {
        const vote = attendanceData.find(a => a.profile_id === p.id);
        if (p.id === myProfileId) setUserStatus(vote?.status || null);
        return {
            ...p,
            status: vote?.status || null,
            vote_time: vote?.updated_at || vote?.created_at || null,
            modified_by: vote?.modified_by || null
        };
    });
    setRoster(mergedRoster);
    setLoading(false);
  }

  const handleVote = async (newStatus: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE') => {
    if (!currentUser) {
        toast.error("Devi effettuare il login per votare.");
        return;
    }
    if (!myProfileId) {
        toast.error("Profilo giocatore non trovato. Contatta l'amministratore.");
        return;
    }

    const prevRoster = [...roster];
    const prevUserStatus = userStatus;
    const now = new Date().toISOString();
    
    setUserStatus(newStatus);
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
        setUserStatus(prevUserStatus);
        setRoster(prevRoster);
        toast.error("Errore salvataggio voto: " + error.message);
    } else {
        toast.success("Disponibilità aggiornata!");
    }
  };

  const handleResetVote = async () => {
      if (!currentUser || !myProfileId) return;
      const prevRoster = [...roster];
      const prevUserStatus = userStatus;

      setUserStatus(null);
      setRoster(prev => prev.map(p => p.id === myProfileId ? { ...p, status: null, vote_time: null, modified_by: null } : p));

      const { error } = await supabase.from('attendance').delete().match({ event_id: id, profile_id: myProfileId });

      if (error) {
          setUserStatus(prevUserStatus);
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
    <PageContainer
      className="bg-background"
      contentClassName="space-y-6 pb-24"
    >
      <div className="p-4 sticky top-16 z-40 bg-slate-900 flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md bg-white/20" />
        <Skeleton className="h-5 w-32 bg-white/20" />
      </div>
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
  );
  if (!event) return (
    <PageContainer contentClassName="mx-auto max-w-lg">
      <p className="py-10 text-center">Evento non trovato.</p>
    </PageContainer>
  );

  const isMatch = isMatchEvent(event.tipo);
  const isCancelled = event.cancellato;
  const eventDate = event.data_ora ? new Date(event.data_ora) : new Date('invalid');

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
    <PageContainer
      className="bg-background text-foreground"
      contentClassName="space-y-6 pb-24"
    >
      <div className={`p-4 sticky top-16 z-40 shadow-md flex items-center justify-between transition-colors ${isCancelled ? 'bg-red-900 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center gap-3">
                <Button aria-label="Torna indietro" variant="ghost" size="icon" onClick={() => router.back()} className="text-white hover:bg-white/20"><ArrowLeft aria-hidden="true" className="h-6 w-6" /></Button>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="font-bold text-lg leading-none">{isCancelled ? 'Annullato' : EVENT_TYPE_LABEL[event.tipo]}</h1>
                    </div>
                </div>
            </div>
            {isManager && (
                <div className="flex gap-2">
                    <Button 
                        aria-label="Copia informazioni per WhatsApp"
                        onClick={handleCopyWhatsApp}
                        size="icon"
                        className="h-8 w-8 bg-green-700 hover:bg-green-800 text-white shadow-md rounded-md"
                    >
                        <Share2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setEditDialogOpen(true)} className="gap-2 text-xs bg-operative text-operative-foreground hover:bg-operative/90"><Pencil aria-hidden="true" className="h-3 w-3" /> Modifica</Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button aria-label="Elimina evento" variant="destructive" size="icon" className="h-8 w-8 bg-red-600 hover:bg-red-700"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Eliminare l’evento?</AlertDialogTitle><AlertDialogDescription>L’evento sparisce dal calendario con disponibilità e presenze. L’azione non si può annullare.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
      </div>

      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center space-y-3 mt-2">
            {isMatch && opponentLogo && (
                <div className="flex justify-center mb-2">
                    <Avatar className="h-20 w-20 border-4 border-slate-100 shadow-lg bg-white"><AvatarImage src={opponentLogo} alt={`Logo ${event.avversario ?? 'avversario'}`} className="object-contain p-1" /><AvatarFallback><Shield className="h-10 w-10 text-muted-foreground"/></AvatarFallback></Avatar>
                </div>
            )}
            <h2 className={`text-3xl font-black uppercase leading-none tracking-tight ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{isMatch
                ? event.avversario || "Avversario da definire"
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

        {isAssociated ? (
          isMatch && (
            <OfficialFormationPanel
              eventDate={event.data_ora}
              eventId={id}
            />
          )
        ) : (
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

        <Separator />
        {isAssociated && !event.giocata && !isCancelled && (
            <Card className="bg-muted/10 border-dashed border-2 shadow-sm border-slate-300 dark:border-slate-700">
                <CardContent className="p-4 space-y-3">
                    <h3 className="text-center font-bold text-muted-foreground text-xs uppercase tracking-wide">La tua disponibilità</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <Button 
                            variant={userStatus === 'PRESENTE' ? 'default' : 'outline'}
                            aria-pressed={userStatus === 'PRESENTE'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-[color,background-color,border-color] ${userStatus === 'PRESENTE' ? 'bg-green-700 hover:bg-green-800 border-transparent text-white' : 'hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-300 border-muted'}`}
                            onClick={() => handleVote('PRESENTE')}
                            disabled={loading}
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
                            disabled={loading}
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
                            disabled={loading}
                        >
                            <XCircle className="h-5 w-5" />
                            <span className="text-[11px] font-bold">ASSENTE</span>
                        </Button>
                    </div>
                    
                    {userStatus && (
                        <Button variant="ghost" size="sm" onClick={handleResetVote} className="w-full text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={loading}>
                            <Trash2 aria-hidden="true" className="h-3 w-3 mr-1" /> Rimuovi la mia scelta
                        </Button>
                    )}
                </CardContent>
            </Card>
        )}

        {isAssociated && (
          <EventRosterPanel
            eventDate={eventDate}
            eventId={id}
            isManager={isManager}
            isMatch={isMatch}
            managerProfileId={myProfileId}
            namesByProfileId={allProfilesMap}
            roster={sortedRoster}
          />
        )}

      </div>

      <EventDialog 
        open={editDialogOpen} 
        onOpenChange={setEditDialogOpen}
        eventToEdit={event}
        onSave={handleEventUpdate}
      />
    </PageContainer>
  );
}
