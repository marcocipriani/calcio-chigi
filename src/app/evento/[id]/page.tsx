"use client"

import { useEffect, useState, use, useMemo, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr'; 
import { useRouter } from 'next/navigation';
import { format, differenceInYears } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info, Trash2, Shield, Loader2, ShieldCheck, Eye, UserCheck, UserX, Hand, Users, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EventDialog } from '@/components/EventDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { toast } from "sonner";
import { genMsgWhatsApp } from '@/lib/whatsappTemplate';
import { Event } from '@/lib/types';

interface RosterPlayer {
  id: string;
  nome: string;
  cognome: string;
  ruolo?: string | null;
  avatar_url?: string | null;
  data_nascita?: string | null;
  is_staff?: boolean;
  status: string | null;
  vote_time: string | null;
  modified_by: string | null;
}

const getAge = (dob: string) => dob ? differenceInYears(new Date(), new Date(dob)) : null;
const isU35Func = (dob: string) => { const age = getAge(dob); return age !== null && age < 35; };

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); 
  const router = useRouter();
  
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  ), []);

  const [event, setEvent] = useState<Event | null>(null);
  const [opponentLogo, setOpponentLogo] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [allProfilesMap, setAllProfilesMap] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
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
  }, [id, supabase]);

  const handleRealtimeUpdate = (payload: { new: Record<string, string | null>; old: Record<string, string | null>; eventType: string }) => {
      const { new: newRecord, old: oldRecord, eventType } = payload;
      const currentProfileId = myProfileIdRef.current;
      if (newRecord?.profile_id === currentProfileId && newRecord?.modified_by === currentProfileId) return;

      if (eventType === 'DELETE' && oldRecord) {
          setRoster(prev => prev.map(p => 
              p.id === oldRecord.profile_id ? { ...p, status: null, vote_time: null, modified_by: null } : p
          ));
          if (oldRecord.profile_id === myProfileId) setUserStatus(null);
      }

      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
          setRoster(prev => prev.map(p => 
              p.id === newRecord.profile_id ? { 
                  ...p, 
                  status: newRecord.status, 
                  vote_time: newRecord.created_at,
                  modified_by: newRecord.modified_by
              } : p
          ));
          if (newRecord.profile_id === myProfileId) setUserStatus(newRecord.status);
      }
  };

  async function loadAllData() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) console.error("Errore Auth:", authError);

    setCurrentUser(user);
    
    let currentPid = null;

    if (user) {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('id, is_manager').eq('user_id', user.id).maybeSingle();
        
        if (profileError) console.error("Errore profilo:", profileError);

        if (profile) {
            currentPid = profile.id;
            setIsManager(profile.is_manager);
            setMyProfileId(profile.id);
        } else {
            toast.warning("Utente non associato a un profilo giocatore.");
        }
    }

    const { data: eventData } = await supabase.from('events').select('*').eq('id', id).single();
    if (eventData) {
        
        let opponentName = eventData.avversario;
        if (eventData.tipo === 'PARTITA' && eventData.squadra_ospite && eventData.squadra_casa) {
            opponentName = eventData.squadra_casa.toLowerCase().includes('chigi') ? eventData.squadra_ospite : eventData.squadra_casa;
        }
        
        const processedEvent = { ...eventData, avversario: opponentName };
        setEvent(processedEvent);

        if (processedEvent.tipo === 'PARTITA' && opponentName) {
            const { data: teamData } = await supabase.from('teams').select('logo_url').ilike('nome', `%${opponentName}%`).maybeSingle();
            if (teamData) setOpponentLogo(teamData.logo_url);
        }
    }

    const { data: allProfiles } = await supabase.from('profiles').select('id, nome, cognome, ruolo, avatar_url, data_nascita, is_staff').order('cognome');
    const { data: attendanceData } = await supabase.from('attendance').select('profile_id, status, created_at, updated_at, modified_by').eq('event_id', id);

    if (allProfiles) {
        const pMap: Record<string, string> = {};
        allProfiles.forEach(p => { pMap[p.id] = `${p.cognome} ${p.nome}` });
        setAllProfilesMap(pMap);

        const mergedRoster = allProfiles.map(p => {
            const vote = attendanceData?.find(a => a.profile_id === p.id);
            if (p.id === currentPid) setUserStatus(vote?.status || null);
            return { 
                ...p, 
                status: vote?.status || null,
                vote_time: vote?.updated_at || vote?.created_at || null,
                modified_by: vote?.modified_by || null
            };
        });
        setRoster(mergedRoster);
    }
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
    
    toast.success("Disponibilità aggiornata!");

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
    }
  };

  const handleResetVote = async () => {
      if (!currentUser || !myProfileId) return;
      const prevRoster = [...roster];
      const prevUserStatus = userStatus;

      setUserStatus(null);
      setRoster(prev => prev.map(p => p.id === myProfileId ? { ...p, status: null, vote_time: null, modified_by: null } : p));
      toast.info("Scelta rimossa");

      const { error } = await supabase.from('attendance').delete().match({ event_id: id, profile_id: myProfileId });

      if (error) {
          setUserStatus(prevUserStatus);
          setRoster(prevRoster);
          toast.error("Errore rimozione voto.");
      }
  }

  const handleManagerOverride = async (targetProfileId: string, newStatus: string) => {
      if (!myProfileId) return;

      const prevRoster = [...roster];
      const now = new Date().toISOString();
      
      setRoster(prev => prev.map(p => p.id === targetProfileId ? { 
          ...p, 
          status: newStatus === 'RESET' ? null : newStatus, 
          vote_time: newStatus === 'RESET' ? null : now,
          modified_by: newStatus === 'RESET' ? null : myProfileId 
      } : p));
      
      toast.info("Stato aggiornato dal manager");

      let error = null;
      if (newStatus === "RESET") {
          const res = await supabase.from('attendance').delete().match({ event_id: id, profile_id: targetProfileId });
          error = res.error;
      } else {
          const res = await supabase.from('attendance').upsert({ 
              event_id: id, 
              profile_id: targetProfileId, 
              status: newStatus,
              modified_by: myProfileId
          }, { onConflict: 'event_id, profile_id' });
          error = res.error;
      }

      if (error) {
          setRoster(prevRoster);
          toast.error("Errore aggiornamento manager: " + error.message);
      }
  };

  const handleEventUpdate = async (updatedData: Partial<Event>) => {
      const prevEvent = event;
      setEvent(event ? { ...event, ...updatedData } : null);
      setEditDialogOpen(false);
      toast.success("Evento aggiornato.");
      const { data, error } = await supabase.from('events').update(updatedData).eq('id', id).select();
      if (error || !data) { setEvent(prevEvent); toast.error("Errore salvataggio."); }
  };

  const handleDeleteEvent = async () => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) toast.error(error.message); else { toast.success("Eliminato."); router.push('/torneo'); }
  }

  const handleCopyWhatsApp = () => {
    if (!event) return;
    const formattedPresenze = roster.map(p => ({
        status: p.status === 'PRESENTE' ? 'PRESENT' : p.status,
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

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>;
  if (!event) return <div className="text-center p-10">Evento non trovato.</div>;

  const isMatch = event.tipo === 'PARTITA';
  const isCancelled = event.cancellato;

  const presentPlayers = roster.filter(p => p.status === 'PRESENTE');
  const spectatorPlayers = roster.filter(p => p.status === 'INFORTUNATO_PRESENTE');
  const absentPlayers = roster.filter(p => p.status === 'ASSENTE');

  const countOver35 = presentPlayers.filter(p => !isU35Func(p.data_nascita ?? '') && p.ruolo !== 'PORTIERE').length;
  const countU35 = presentPlayers.filter(p => isU35Func(p.data_nascita ?? '') && p.ruolo !== 'PORTIERE').length;
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
      let resultColor = "text-slate-500 bg-slate-100";
      let resultText = "PAREGGIO";
      if (golNoi > golLoro) { resultColor = "text-emerald-700 bg-emerald-100"; resultText = "VITTORIA"; } 
      else if (golNoi < golLoro) { resultColor = "text-red-700 bg-red-100"; resultText = "SCONFITTA"; }

      scoreBlock = (
          <div className="flex flex-col items-center mt-2 animate-in zoom-in">
              <div className={`px-6 py-2 rounded-2xl font-mono text-4xl font-black tracking-tighter ${resultColor}`}>{event.gol_casa} - {event.gol_ospite}</div>
              <Badge variant="outline" className="mt-1 text-[10px] font-bold border-0 opacity-70">{resultText}</Badge>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className={`p-4 sticky top-14 z-40 shadow-md flex items-center justify-between transition-colors ${isCancelled ? 'bg-red-900 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white hover:bg-white/20"><ArrowLeft className="h-6 w-6" /></Button>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="font-bold text-lg leading-none">{isCancelled ? 'ANNULLATO' : (isMatch ? 'Match Day' : 'Allenamento')}</h1>
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
                    <Button 
                        onClick={handleCopyWhatsApp}
                        size="icon"
                        className="h-8 w-8 bg-green-600 hover:bg-green-700 text-white shadow-md rounded-md"
                        title="Copia per WhatsApp"
                    >
                        <Share2 className="h-4 w-4" /> 
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditDialogOpen(true)} className="gap-2 text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white border-none"><Pencil className="h-3 w-3" /> Modifica</Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="destructive" size="icon" className="h-8 w-8 bg-red-600 hover:bg-red-700"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Eliminare definitivamente?</AlertDialogTitle><AlertDialogDescription>Azione irreversibile.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-3 mt-2">
            {isMatch && opponentLogo && (
                <div className="flex justify-center mb-2">
                    <Avatar className="h-20 w-20 border-4 border-slate-100 shadow-lg bg-white"><AvatarImage src={opponentLogo} className="object-contain p-1" /><AvatarFallback><Shield className="h-10 w-10 text-muted-foreground"/></AvatarFallback></Avatar>
                </div>
            )}
            <h2 className={`text-3xl font-black uppercase leading-none tracking-tight ${isCancelled ? 'line-through text-muted-foreground' : 'text-amber-600 dark:text-blue-400'}`}>{event.avversario || "Allenamento"}</h2>
            {scoreBlock}
            <div className="flex flex-col gap-1 justify-center items-center text-sm text-muted-foreground pt-2">
                <span className="flex items-center gap-1 font-medium"><Calendar className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'd MMM yyyy', {locale: it})}</span>
                <div className="flex items-center gap-3"><span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'HH:mm')}</span></div>
            </div>
            <div className="flex justify-center items-center gap-1 text-sm text-muted-foreground font-semibold"><MapPin className="h-4 w-4"/> {event.luogo}</div>
            {event.note && (
                <div className="mt-4 bg-muted/30 p-3 rounded-lg border border-border text-sm text-muted-foreground flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider text-muted-foreground/70"><Info className="h-3 w-3" /> Note Mister</div>
                    <p className="italic text-center">{event.note}</p>
                </div>
            )}
            {isCancelled && <p className="text-red-500 font-bold text-sm bg-red-100 dark:bg-red-900/20 p-2 rounded">EVENTO ANNULLATO</p>}
        </div>

        {!isCancelled && (
            isMatch ? (
                <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-2 bg-blue-50 border-blue-100 border p-2 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-2xl font-black text-blue-700">{countOver35}</span>
                        <div className="flex items-center gap-1"><Users className="h-3 w-3 text-blue-600" /><span className="text-[9px] uppercase font-bold text-blue-900">Over 35</span></div>
                    </div>
                    <div className="col-span-2 bg-sky-50 border-sky-100 border p-2 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-2xl font-black text-sky-700">{countU35}</span>
                        <div className="flex items-center gap-1"><Users className="h-3 w-3 text-sky-600" /><span className="text-[9px] uppercase font-bold text-sky-900">Under 35</span></div>
                    </div>
                    <div className="col-span-2 bg-cyan-50 border-cyan-100 border p-2 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-2xl font-black text-cyan-700">{countGoalies}</span>
                        <div className="flex items-center gap-1">
                            <Hand className="h-3 w-3 text-cyan-600" />
                            <span className="text-[9px] uppercase font-bold text-cyan-900">Portieri</span>
                        </div>
                    </div>
                    <div className="col-span-3 bg-slate-100 border-slate-200 border p-2 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xl font-black text-slate-600">{countSpectators}</span>
                        <div className="flex items-center gap-1"><Eye className="h-3 w-3 text-slate-500" /><span className="text-[9px] uppercase font-bold text-slate-700">Spettatori</span></div>
                    </div>
                    <div className="col-span-3 bg-red-50 border-red-100 border p-2 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xl font-black text-red-600">{countAbsents}</span>
                        <div className="flex items-center gap-1"><UserX className="h-3 w-3 text-red-500" /><span className="text-[9px] uppercase font-bold text-red-800">Assenti</span></div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 border border-green-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-3xl font-black text-green-600">{countTrainingPresent}</span>
                        <div className="flex items-center gap-1"><UserCheck className="h-4 w-4 text-green-600" /><span className="text-[10px] uppercase font-bold text-green-800">Presenti</span></div>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-3xl font-black text-orange-500">{countTrainingKO}</span> 
                        <div className="flex items-center gap-1"><AlertCircle className="h-4 w-4 text-orange-600" /><span className="text-[10px] uppercase font-bold text-orange-800">KO</span></div>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex flex-col items-center justify-center shadow-sm">
                        <span className="text-3xl font-black text-red-600">{countAbsents}</span>
                        <div className="flex items-center gap-1"><UserX className="h-4 w-4 text-red-600" /><span className="text-[10px] uppercase font-bold text-red-800">Assenti</span></div>
                    </div>
                </div>
            )
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
                            disabled={loading}
                        >
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-[10px] font-bold">CI SONO</span>
                        </Button>

                        <Button 
                            variant={userStatus === 'INFORTUNATO_PRESENTE' ? 'default' : 'outline'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-all ${userStatus === 'INFORTUNATO_PRESENTE' 
                                ? (isMatch ? 'bg-slate-600 hover:bg-slate-700 border-transparent text-white' : 'bg-yellow-500 hover:bg-yellow-600 border-transparent text-white') 
                                : 'hover:bg-slate-200 border-muted'}`}
                            onClick={() => handleVote('INFORTUNATO_PRESENTE')}
                            disabled={loading}
                        >
                            {isMatch ? <Eye className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                            <span className="text-[9px] font-bold leading-none text-center">
                                {isMatch ? "SPETTATORE" : <>PRESENTE<br/>(KO)</>}
                            </span>
                        </Button>

                        <Button 
                            variant={userStatus === 'ASSENTE' ? 'default' : 'outline'}
                            className={`flex flex-col h-16 gap-1 border-2 transition-all ${userStatus === 'ASSENTE' ? 'bg-red-600 hover:bg-red-700 border-transparent text-white' : 'hover:bg-red-500/10 hover:text-red-600 border-muted'}`}
                            onClick={() => handleVote('ASSENTE')}
                            disabled={loading}
                        >
                            <XCircle className="h-5 w-5" />
                            <span className="text-[10px] font-bold">ASSENTE</span>
                        </Button>
                    </div>
                    
                    {userStatus && (
                        <Button variant="ghost" size="sm" onClick={handleResetVote} className="w-full text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 h-8" disabled={loading}>
                            <Trash2 className="h-3 w-3 mr-1" /> Rimuovi la mia scelta
                        </Button>
                    )}
                </CardContent>
            </Card>
        )}

        <div>
            <div className="flex flex-col mb-4 border-b pb-2 gap-2">
                <h3 className="font-bold text-lg">Risposte</h3>
            </div>

            <div className="space-y-2">
                {sortedRoster.map((p) => {
                    const status = p.status;
                    let borderClass = "border-l-4 border-l-slate-300 dark:border-l-slate-600"; 
                    const bgClass = "bg-card";
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
                        if (isMatch) {
                            borderClass = "border-l-4 border-l-slate-500 bg-slate-50 dark:bg-slate-900/50";
                            statusText = "SPETTATORE";
                            statusColor = "text-slate-600 dark:text-slate-400";
                        } else {
                            borderClass = "border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10";
                            statusText = "PRESENTE (KO)";
                            statusColor = "text-yellow-600 dark:text-yellow-400";
                        }
                    }

                    const isU35Player = isU35Func(p.data_nascita ?? '');
                    const voteTime = p.vote_time ? format(new Date(p.vote_time), 'dd/MM HH:mm') : '';
                    
                    const isManagerEdit = p.modified_by && p.modified_by !== p.id;
                    const managerName = isManagerEdit ? allProfilesMap[p.modified_by ?? '']?.split(' ')[0] : null;

                    return (
                        <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${borderClass} ${bgClass} transition-all duration-300`}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                                    <AvatarImage src={p.avatar_url ?? undefined} />
                                    <AvatarFallback>{p.nome[0]}{p.cognome[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm leading-none flex items-center gap-1">
                                            {p.cognome} {p.nome}
                                            {p.is_staff && <ShieldCheck className="h-3 w-3 text-purple-600" />}
                                        </p>
                                        {isU35Player && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">U35</Badge>}
                                        {p.ruolo === 'PORTIERE' && <Badge className="text-[8px] h-4 px-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-0">POR</Badge>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <p className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                            {p.ruolo?.substring(0,3)}
                                        </p>
                                        <p className={`text-[10px] font-bold ${statusColor}`}>
                                            {statusText}
                                        </p>
                                        {voteTime && (
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                                {isManagerEdit ? `(Modificato da ${managerName} ${voteTime})` : `(Votato ${voteTime})`}
                                            </span>
                                        )}
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
                                        <SelectItem value="INFORTUNATO_PRESENTE">{isMatch ? 'Spettatore' : 'Infortunato'}</SelectItem>
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