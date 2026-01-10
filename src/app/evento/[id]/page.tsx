"use client"

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { format, differenceInYears } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info, Trash2, Shield, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EventDialog } from '@/components/EventDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

// Helper per calcolo età
const getAge = (dob: string) => dob ? differenceInYears(new Date(), new Date(dob)) : null;
const isU35Func = (dob: string) => { const age = getAge(dob); return age !== null && age < 35; };

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); 
  const router = useRouter();
  
  // Dati
  const [event, setEvent] = useState<any>(null);
  const [opponentLogo, setOpponentLogo] = useState<string | null>(null);
  const [roster, setRoster] = useState<any[]>([]); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isManager, setIsManager] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  
  // UI
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [id]);

  async function loadAllData() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    
    let currentPid = null;

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, is_manager')
            .eq('user_id', user.id)
            .single();
        
        if (profile) {
            currentPid = profile.id;
            setIsManager(profile.is_manager);
            setMyProfileId(profile.id);
        }
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    
    if (eventData) {
        setEvent(eventData);
        
        // Cerca logo avversario se è una partita
        if (eventData.tipo === 'PARTITA' && eventData.squadra_ospite && eventData.squadra_casa) {
            const opponentName = eventData.squadra_casa.toLowerCase().includes('chigi') 
                ? eventData.squadra_ospite 
                : eventData.squadra_casa;
            
            const { data: teamData } = await supabase
                .from('teams')
                .select('logo_url')
                .ilike('nome', `%${opponentName}%`)
                .maybeSingle();
            
            if (teamData) setOpponentLogo(teamData.logo_url);
        }
    }

    const { data: allProfiles } = await supabase.from('profiles').select('id, nome, cognome, ruolo, avatar_url, data_nascita').order('cognome');
    const { data: attendanceData } = await supabase.from('attendance').select('profile_id, status').eq('event_id', id);

    if (allProfiles) {
        const mergedRoster = allProfiles.map(p => {
            const vote = attendanceData?.find((a: any) => a.profile_id === p.id);
            if (p.id === currentPid) setUserStatus(vote?.status || null);
            return { ...p, status: vote?.status || null };
        });
        
        mergedRoster.sort((a, b) => {
            const score = (s: string) => {
                if (s === 'PRESENTE') return 4;
                if (s === 'INFORTUNATO_PRESENTE') return 3;
                if (!s) return 2; 
                return 1;
            };
            return score(b.status) - score(a.status);
        });

        setRoster(mergedRoster);
    }

    setLoading(false);
  }

  const handleVote = async (status: 'PRESENTE' | 'ASSENTE' | 'INFORTUNATO_PRESENTE') => {
    if (!currentUser || !myProfileId) return alert("Devi essere loggato e collegato alla rosa.");

    setUserStatus(status);
    updateRosterLocal(myProfileId, status);

    const { error } = await supabase.from('attendance').upsert({
        event_id: id,
        profile_id: myProfileId,
        status: status
      }, { onConflict: 'event_id, profile_id' });

    if (error) {
        console.error(error);
        alert("Errore salvataggio");
        loadAllData();
    }
  };

  const handleManagerOverride = async (profileId: string, newStatus: string) => {
      updateRosterLocal(profileId, newStatus);
      if (newStatus === "RESET") {
          await supabase.from('attendance').delete().match({ event_id: id, profile_id: profileId });
      } else {
          await supabase.from('attendance').upsert({ event_id: id, profile_id: profileId, status: newStatus }, { onConflict: 'event_id, profile_id' });
      }
  };

  const updateRosterLocal = (pid: string, status: any) => {
      setRoster(prev => prev.map(p => p.id === pid ? { ...p, status: status === 'RESET' ? null : status } : p));
  };

  const handleEventUpdate = async (updatedData: any) => {
      const { data, error } = await supabase
        .from('events')
        .update(updatedData)
        .eq('id', id)
        .select(); 
      
      if (error) {
          alert("Errore DB: " + error.message);
      } else if (!data || data.length === 0) {
          alert("ATTENZIONE: Modifica non salvata! Sembra che tu non abbia i permessi di Manager nel database.");
      } else {
          setEvent({ ...event, ...updatedData });
          setEditDialogOpen(false);
          alert("Evento aggiornato con successo!");
      }
  };

  const handleDeleteEvent = async () => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) {
          alert("Errore eliminazione: " + error.message);
      } else {
          router.push('/torneo'); 
      }
  }

  if (loading) return <div className="flex justify-center items-center h-screen bg-background"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!event) return <div className="text-center p-10">Evento non trovato.</div>;

  const isCancelled = event.cancellato;
  const presenti = roster.filter(p => p.status === 'PRESENTE');
  const infortunati = roster.filter(p => p.status === 'INFORTUNATO_PRESENTE');
  
  const u35Presenti = presenti.filter(p => isU35Func(p.data_nascita)).length;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      
      <div className={`p-4 sticky top-14 z-40 shadow-md flex items-center justify-between transition-colors
          ${isCancelled ? 'bg-red-900 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white hover:bg-white/20">
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="font-bold text-lg leading-none">
                        {isCancelled ? 'ANNULLATO' : (event.tipo === 'PARTITA' ? 'Match Day' : 'Allenamento')}
                    </h1>
                    <p className="text-xs opacity-70">Gestione presenze</p>
                </div>
            </div>
            
            {isManager && (
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditDialogOpen(true)} className="gap-2 text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white border-none">
                        <Pencil className="h-3 w-3" /> Modifica
                    </Button>
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8 bg-purple-600 hover:bg-purple-700 text-white border-none">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare definitivamente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Questa azione rimuoverà l&apos;evento dal database. Non è un annullamento, ma una cancellazione.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteEvent} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        
        <div className="text-center space-y-3 mt-2">

            {event.tipo === 'PARTITA' && opponentLogo && (
                <div className="flex justify-center mb-2">
                    <Avatar className="h-20 w-20 border-4 border-slate-100 shadow-lg bg-white">
                        <AvatarImage src={opponentLogo} className="object-contain p-1" />
                        <AvatarFallback><Shield className="h-10 w-10 text-muted-foreground"/></AvatarFallback>
                    </Avatar>
                </div>
            )}

            <h2 className={`text-3xl font-black uppercase leading-none tracking-tight 
                ${isCancelled ? 'line-through text-muted-foreground' : 'text-amber-600 dark:text-blue-400'}`}>
                {event.avversario || "Allenamento"}
            </h2>
            
            <div className="flex flex-col gap-1 justify-center items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-1 font-medium"><Calendar className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'd MMM yyyy', {locale: it})}</span>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4 text-primary"/> Inizio: {format(new Date(event.data_ora), 'HH:mm')}</span>
                    {event.data_fine_ora && (
                        <span className="flex items-center gap-1 font-medium opacity-70">Fine: {format(new Date(event.data_fine_ora), 'HH:mm')}</span>
                    )}
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
                    <p className="italic">{event.note}</p>
                </div>
            )}

            {isCancelled && <p className="text-red-500 font-bold text-sm bg-red-100 dark:bg-red-900/20 p-2 rounded">EVENTO ANNULLATO</p>}
        </div>

        <Separator />

        {!event.giocata && !isCancelled && (
            <Card className="bg-muted/10 border-dashed border-2 shadow-sm border-slate-300 dark:border-slate-700">
                <CardContent className="p-4">
                    <h3 className="text-center font-bold text-muted-foreground mb-4 text-xs uppercase tracking-wide">La tua disponibilità</h3>
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
                            <span className="text-[9px] font-bold leading-none text-center">KO<br/>(PRESENTE)</span>
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
                </CardContent>
            </Card>
        )}

        <div>
            <div className="flex flex-col mb-4 border-b pb-2 gap-2">
                <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">Presenze ({presenti.length})</h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200">
                            di cui {u35Presenti} U35
                        </span>
                    </div>
                    {infortunati.length > 0 && <span className="text-xs text-yellow-600 font-bold bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded">{infortunati.length} Infortunati</span>}
                </div>
            </div>

            <div className="space-y-2">
                {roster.map((p) => {
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
                        statusText = "INFORTUNATO";
                        statusColor = "text-yellow-600 dark:text-yellow-400";
                    }

                    const isU35Player = isU35Func(p.data_nascita);

                    return (
                        <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${borderClass} ${bgClass}`}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                                    <AvatarImage src={p.avatar_url} />
                                    <AvatarFallback>{p.nome[0]}{p.cognome[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm leading-none">{p.cognome} {p.nome}</p>
                                        {isU35Player && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">U35</Badge>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 px-1 rounded">{p.ruolo?.substring(0,3)}</p>
                                        <p className={`text-[10px] font-bold ${statusColor}`}>{statusText}</p>
                                    </div>
                                </div>
                            </div>

                            {isManager ? (
                                <Select 
                                    value={status || "RESET"} 
                                    onValueChange={(val) => handleManagerOverride(p.id, val)}
                                >
                                    <SelectTrigger className="h-7 w-[110px] text-[10px] font-bold bg-background border-purple-200 focus:ring-purple-500">
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