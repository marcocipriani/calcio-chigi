"use client"

import { useEffect, useState, use, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { format, differenceInYears } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info, Trash2, Shield, Loader2, ShieldCheck, Trophy, Dumbbell, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EventDialog } from '@/components/EventDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const getAge = (dob: string) => dob ? differenceInYears(new Date(), new Date(dob)) : null;
const isU35Func = (dob: string) => { const age = getAge(dob); return age !== null && age < 35; };

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); 
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [opponentLogo, setOpponentLogo] = useState<string | null>(null);
  const [roster, setRoster] = useState<any[]>([]); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isManager, setIsManager] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

    useEffect(() => {
    loadAllData();

    const channel = supabase
      .channel(`event_attendance_${id}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'attendance',
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    }
  }, [id]);

  const handleRealtimeUpdate = async (payload: any) => {
      const { new: newRecord, old: oldRecord, eventType } = payload;
      
      if ((newRecord?.profile_id === myProfileId) || (oldRecord?.profile_id === myProfileId)) {

      }

      if (eventType === 'DELETE' && oldRecord) {
          setRoster(prev => prev.map(p => 
              p.id === oldRecord.profile_id ? { ...p, status: null, vote_time: null } : p
          ));
      }

      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
          setRoster(prev => prev.map(p => 
              p.id === newRecord.profile_id ? { ...p, status: newRecord.status, vote_time: newRecord.created_at || new Date().toISOString() } : p
          ));
      }
  };

  async function loadAllData() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    
    let currentPid = null;

    if (user) {
        const { data: profile } = await supabase.from('profiles').select('id, is_manager').eq('user_id', user.id).single();
        if (profile) {
            currentPid = profile.id;
            setIsManager(profile.is_manager);
            setMyProfileId(profile.id);
        }
    }

    const { data: eventData } = await supabase.from('events').select('*').eq('id', id).single();
    
    if (eventData) {
        setEvent(eventData);
        if (eventData.tipo === 'PARTITA' && eventData.squadra_ospite && eventData.squadra_casa) {
            const opponentName = eventData.squadra_casa.toLowerCase().includes('chigi') ? eventData.squadra_ospite : eventData.squadra_casa;
            const { data: teamData } = await supabase.from('teams').select('logo_url').ilike('nome', `%${opponentName}%`).maybeSingle();
            if (teamData) setOpponentLogo(teamData.logo_url);
        }
    }

    const { data: allProfiles } = await supabase.from('profiles').select('id, nome, cognome, ruolo, avatar_url, data_nascita, is_staff').order('cognome');
    const { data: attendanceData } = await supabase.from('attendance').select('profile_id, status, created_at, updated_at').eq('event_id', id);

    if (allProfiles) {
        const mergedRoster = allProfiles.map(p => {
            const vote = attendanceData?.find((a: any) => a.profile_id === p.id);
            if (p.id === currentPid) setUserStatus(vote?.status || null);
            return { 
                ...p, 
                status: vote?.status || null,
                vote_time: vote?.updated_at || vote?.created_at || null
            };
        });
        setRoster(mergedRoster);
    }
    setLoading(false);
  }

  // Voto Utente (Optimistic Update)
  const handleVote = async (newStatus: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE') => {
    if (!currentUser || !myProfileId) {
        toast.error("Devi essere loggato per votare");
        return;
    }

    const prevRoster = [...roster];
    const prevUserStatus = userStatus;

    const now = new Date().toISOString();
    setUserStatus(newStatus);
    setRoster(prev => prev.map(p => p.id === myProfileId ? { ...p, status: newStatus, vote_time: now } : p));
    toast.success(newStatus === 'ASSENTE' ? "Segnato come assente" : "Presenza confermata!");

    const { error } = await supabase.from('attendance').upsert({
        event_id: id,
        profile_id: myProfileId,
        status: newStatus
      }, { onConflict: 'event_id, profile_id' });

    if (error) {
        console.error(error);
        setUserStatus(prevUserStatus);
        setRoster(prevRoster);
        toast.error("Errore di connessione: voto non salvato.");
    }
  };

  const handleResetVote = async () => {
      if (!currentUser || !myProfileId) return;

      const prevRoster = [...roster];
      const prevUserStatus = userStatus;

      setUserStatus(null);
      setRoster(prev => prev.map(p => p.id === myProfileId ? { ...p, status: null, vote_time: null } : p));
      toast.info("Disponibilità rimossa");

      const { error } = await supabase.from('attendance').delete().match({ event_id: id, profile_id: myProfileId });

      if (error) {
          setUserStatus(prevUserStatus);
          setRoster(prevRoster);
          toast.error("Errore rimozione voto.");
      }
  }

  const handleManagerOverride = async (profileId: string, newStatus: string) => {
      const prevRoster = [...roster];
      
      const now = new Date().toISOString();
      setRoster(prev => prev.map(p => p.id === profileId ? { ...p, status: newStatus === 'RESET' ? null : newStatus, vote_time: newStatus === 'RESET' ? null : now } : p));
      toast.info("Stato aggiornato");

      let error = null;
      if (newStatus === "RESET") {
          const res = await supabase.from('attendance').delete().match({ event_id: id, profile_id: profileId });
          error = res.error;
      } else {
          const res = await supabase.from('attendance').upsert({ event_id: id, profile_id: profileId, status: newStatus }, { onConflict: 'event_id, profile_id' });
          error = res.error;
      }

      if (error) {
          setRoster(prevRoster);
          toast.error("Errore aggiornamento manager.");
      }
  };

  const handleEventUpdate = async (updatedData: any) => {
      const prevEvent = { ...event };
      setEvent({ ...event, ...updatedData });
      setEditDialogOpen(false);
      toast.success("Evento aggiornato.");

      const { data, error } = await supabase
        .from('events')
        .update(updatedData)
        .eq('id', id)
        .select(); 
      
      if (error || !data) {
          setEvent(prevEvent);
          toast.error("Errore salvataggio evento.");
      }
  };

  const handleDeleteEvent = async () => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) {
          toast.error("Errore eliminazione: " + error.message);
      } else {
          toast.success("Evento eliminato.");
          router.push('/torneo'); 
      }
  }

  const countPresenti = roster.filter(p => p.status === 'PRESENTE').length;
  const countInfortunati = roster.filter(p => p.status === 'INFORTUNATO_PRESENTE').length;
  const countAssenti = roster.filter(p => p.status === 'ASSENTE').length;

  const u35Presenti = roster.filter(p => 
    p.status === 'PRESENTE' && 
    isU35Func(p.data_nascita) && 
    p.ruolo !== 'PORTIERE'
  ).length;

  const sortedRoster = [...roster].sort((a, b) => {
      if (a.is_staff && !b.is_staff) return 1;
      if (!a.is_staff && b.is_staff) return -1;

      // Status
      const score = (s: string) => {
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

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>;
  if (!event) return <div className="text-center p-10">Evento non trovato.</div>;

  const isCancelled = event.cancellato;
  const isMatch = event.tipo === 'PARTITA';

  let scoreBlock = null;
  if (isMatch && event.giocata) {
      const isChigiCasa = event.squadra_casa?.toLowerCase().includes('chigi');
      const golNoi = isChigiCasa ? (event.gol_casa ?? 0) : (event.gol_ospite ?? 0);
      const golLoro = isChigiCasa ? (event.gol_ospite ?? 0) : (event.gol_casa ?? 0);
      
      let resultColor = "text-slate-500 bg-slate-100";
      let resultText = "PAREGGIO";

      if (golNoi > golLoro) {
          resultColor = "text-emerald-700 bg-emerald-100";
          resultText = "VITTORIA";
      } else if (golNoi < golLoro) {
          resultColor = "text-red-700 bg-red-100";
          resultText = "SCONFITTA";
      }

      scoreBlock = (
          <div className="flex flex-col items-center mt-2 animate-in zoom-in duration-300">
              <div className={`px-6 py-2 rounded-2xl font-mono text-4xl font-black tracking-tighter ${resultColor}`}>
                  {event.gol_casa} - {event.gol_ospite}
              </div>
              <Badge variant="outline" className="mt-1 text-[10px] font-bold border-0 opacity-70">
                  {resultText}
              </Badge>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">

      <div className={`p-4 sticky top-14 z-40 shadow-md flex items-center justify-between transition-colors ${isCancelled ? 'bg-red-900 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white hover:bg-white/20">
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="font-bold text-lg leading-none">
                            {isCancelled ? 'ANNULLATO' : (isMatch ? 'Match Day' : 'Allenamento')}
                        </h1>
                        {!isCancelled && !event.giocata && (
                             <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            {isManager && (
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditDialogOpen(true)} className="gap-2 text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white border-none">
                        <Pencil className="h-3 w-3" /> Modifica
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8 bg-red-600 hover:bg-red-700">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare definitivamente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Questa azione rimuoverà l&apos;evento dal database. Non è un annullamento, ma una cancellazione totale.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700">Elimina per sempre</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        
        <div className="text-center space-y-3 mt-2">
            {isMatch && opponentLogo && (
                <div className="flex justify-center mb-2">
                    <Avatar className="h-20 w-20 border-4 border-slate-100 shadow-lg bg-white">
                        <AvatarImage src={opponentLogo} className="object-contain p-1" />
                        <AvatarFallback><Shield className="h-10 w-10 text-muted-foreground"/></AvatarFallback>
                    </Avatar>
                </div>
            )}

            <h2 className={`text-3xl font-black uppercase leading-none tracking-tight ${isCancelled ? 'line-through text-muted-foreground' : 'text-amber-600 dark:text-blue-400'}`}>
                {event.avversario || "Allenamento"}
            </h2>

            {scoreBlock}
            
            <div className="flex flex-col gap-1 justify-center items-center text-sm text-muted-foreground pt-2">
                <span className="flex items-center gap-1 font-medium"><Calendar className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'd MMM yyyy', {locale: it})}</span>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'HH:mm')}</span>
                </div>
            </div>
            
            <div className="flex justify-center items-center gap-1 text-sm text-muted-foreground font-semibold">
                <MapPin className="h-4 w-4"/> {event.luogo}
            </div>

            {event.note && (
                <div className="mt-4 bg-muted/30 p-3 rounded-lg border border-border text-sm text-muted-foreground flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider text-muted-foreground/70">
                        <Info className="h-3 w-3" /> Note Mister
                    </div>
                    <p className="italic text-center">{event.note}</p>
                </div>
            )}

            {isCancelled && <p className="text-red-500 font-bold text-sm bg-red-100 dark:bg-red-900/20 p-2 rounded">EVENTO ANNULLATO</p>}
        </div>

        {!isCancelled && (
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-3xl font-black text-green-600">{countPresenti}</span>
                    <span className="text-[10px] uppercase font-bold text-green-800 tracking-wider">Presenti</span>
                </div>
                <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-3xl font-black text-orange-500">{countInfortunati}</span> 
                    <span className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">Infortunati</span>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-3xl font-black text-red-600">{countAssenti}</span>
                    <span className="text-[10px] uppercase font-bold text-red-800 tracking-wider">Assenti</span>
                </div>
            </div>
        )}

        <Separator />

        {!event.giocata && !isCancelled && (
            <Card className="bg-muted/10 border-dashed border-2 shadow-sm border-slate-300 dark:border-slate-700">
                <CardContent className="p-4 space-y-3">
                    <h3 className="text-center font-bold text-muted-foreground text-xs uppercase tracking-wide">La tua disponibilità</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <Button 
                            variant={userStatus === 'PRESENTE' ? 'default' : 'outline'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-all ${userStatus === 'PRESENTE' ? 'bg-green-600 hover:bg-green-700 border-transparent text-white' : 'hover:bg-green-500/10 hover:text-green-600 border-muted'}`}
                            onClick={() => handleVote('PRESENTE')}
                        >
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-[10px] font-bold">CI SONO</span>
                        </Button>

                        <Button 
                            variant={userStatus === 'INFORTUNATO_PRESENTE' ? 'default' : 'outline'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-all ${userStatus === 'INFORTUNATO_PRESENTE' ? 'bg-yellow-500 hover:bg-yellow-600 border-transparent text-white' : 'hover:bg-yellow-500/10 hover:text-yellow-600 border-muted'}`}
                            onClick={() => handleVote('INFORTUNATO_PRESENTE')}
                        >
                            <AlertCircle className="h-5 w-5" />
                            <span className="text-[9px] font-bold leading-none text-center">PRESENTE (KO)</span>
                        </Button>

                        <Button 
                            variant={userStatus === 'ASSENTE' ? 'default' : 'outline'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-all ${userStatus === 'ASSENTE' ? 'bg-red-600 hover:bg-red-700 border-transparent text-white' : 'hover:bg-red-500/10 hover:text-red-600 border-muted'}`}
                            onClick={() => handleVote('ASSENTE')}
                        >
                            <XCircle className="h-5 w-5" />
                            <span className="text-[10px] font-bold">ASSENTE</span>
                        </Button>
                    </div>
                    
                    {userStatus && (
                        <Button variant="ghost" size="sm" onClick={handleResetVote} className="w-full text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 h-8">
                            <Trash2 className="h-3 w-3 mr-1" /> Rimuovi la mia scelta
                        </Button>
                    )}
                </CardContent>
            </Card>
        )}

        <div>
            <div className="flex flex-col mb-4 border-b pb-2 gap-2">
            <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">Presenze ({countPresenti})</h3>
                    {isMatch && (
                        <span className={`text-xs font-bold px-2 py-1 rounded flex items-center gap-1 ${u35Presenti > 4 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            U35: {u35Presenti} 
                            {u35Presenti > 4 && <AlertCircle className="h-3 w-3" />}
                        </span>
                    )}
                </div>
                {countInfortunati > 0 && (
                    <span className="text-xs text-yellow-600 font-bold bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded">
                        {countInfortunati} Infortunati
                    </span>
                )}
            </div>
        </div>

            <div className="space-y-2">
                {sortedRoster.map((p) => {
                    const status = p.status;
                    let borderClass = "border-l-4 border-l-slate-300 dark:border-l-slate-600"; 
                    let bgClass = "bg-card";
                    let statusText = "Non ha votato";
                    let statusColor = "text-muted-foreground";

                    if (status === 'PRESENTE') {
                        borderClass = "border-l-4 border-l-green-500";
                        statusText = "PRESENTE";
                        statusColor = "text-green-600 dark:text-green-400";
                    } else if (status === 'ASSENTE') {
                        borderClass = "border-l-4 border-l-red-500 opacity-60";
                        statusText = "ASSENTE";
                        statusColor = "text-red-600 dark:text-red-400";
                    } else if (status === 'INFORTUNATO_PRESENTE') {
                        borderClass = "border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10";
                        statusText = "PRESENTE (KO)";
                        statusColor = "text-yellow-600 dark:text-yellow-400";
                    }

                    const isU35Player = isU35Func(p.data_nascita);
                    const voteTime = p.vote_time ? format(new Date(p.vote_time), 'HH:mm dd/MM') : '';

                    return (
                        <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${borderClass} ${bgClass} transition-all duration-300`}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                                    <AvatarImage src={p.avatar_url} />
                                    <AvatarFallback>{p.nome[0]}{p.cognome[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm leading-none flex items-center gap-1">
                                            {p.cognome} {p.nome}
                                            {p.is_staff && <ShieldCheck className="h-3 w-3 text-purple-600" />}
                                        </p>
                                        {isU35Player && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">U35</Badge>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 px-1 rounded">{p.ruolo?.substring(0,3)}</p>
                                        <p className={`text-[10px] font-bold ${statusColor}`}>{statusText}</p>
                                        {voteTime && <span className="text-[8px] text-muted-foreground ml-1">• {voteTime}</span>}
                                    </div>
                                </div>
                            </div>

                            {isManager ? (
                                <Select 
                                    value={status || "RESET"} 
                                    onValueChange={(val) => handleManagerOverride(p.id, val)}
                                >
                                    <SelectTrigger className="h-7 w-[100px] text-[10px] font-bold bg-background border-purple-200 focus:ring-purple-500">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="RESET">-- Reset --</SelectItem>
                                        <SelectItem value="PRESENTE">Presente</SelectItem>
                                        <SelectItem value="ASSENTE">Assente</SelectItem>
                                        <SelectItem value="INFORTUNATO_PRESENTE">Infortunato</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                status === 'PRESENTE' && <CheckCircle2 className="h-5 w-5 text-green-500" />
                            )}
                        </div>
                    );
                })}
                {sortedRoster.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Nessuno ha ancora risposto.</p>}
            </div>
        </div>

      </div>

      <EventDialog 
        open={editDialogOpen} 
        onOpenChange={setEditDialogOpen}
        eventToEdit={event}
        onSave={handleEventUpdate}
      />
    </div>
  );
}