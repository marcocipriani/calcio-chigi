"use client"

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Pencil, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EventDialog } from '@/components/EventDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); 
  const router = useRouter();
  
  // Dati
  const [event, setEvent] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isManager, setIsManager] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  
  // UI
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 1. Caricamento dati
  useEffect(() => {
    loadAllData();
  }, [id]);

  async function loadAllData() {
    // A. Utente e profilo
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

    // B. Evento
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    setEvent(eventData);

    // C. Presenze
    const { data: allProfiles } = await supabase.from('profiles').select('id, nome, cognome, ruolo, avatar_url').order('cognome');
    const { data: attendanceData } = await supabase.from('attendance').select('profile_id, status').eq('event_id', id);

    if (allProfiles) {
        const mergedRoster = allProfiles.map(p => {
            const vote = attendanceData?.find((a: any) => a.profile_id === p.id);
            if (p.id === currentPid) setUserStatus(vote?.status || null);
            return { ...p, status: vote?.status || null };
        });
        
        // Ordine: Presenti > Infortunati > Null > Assenti
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

  // 2. Voto Utente
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

  // 3. Voto Manager
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

  // 4. Modifica Evento (Manager)
  const handleEventUpdate = async (updatedData: any) => {
      console.log("Tentativo aggiornamento ID:", id);
      console.log("Dati:", updatedData);

      const { data, error } = await supabase
        .from('events')
        .update(updatedData)
        .eq('id', id)
        .select(); // <--- FONDAMENTALE: Ci restituisce i dati modificati
      
      if (error) {
          alert("Errore DB: " + error.message);
      } else if (!data || data.length === 0) {
          // ECCO IL COLPEVOLE: Nessuna riga aggiornata = Permessi RLS bloccati
          alert("ATTENZIONE: Modifica non salvata! Sembra che tu non abbia i permessi di Manager nel database.");
      } else {
          setEvent({ ...event, ...updatedData });
          setEditDialogOpen(false);
          alert("Evento aggiornato con successo!");
      }
  };

  if (loading) return (
    <div className="flex justify-center items-center h-screen bg-background">
        <div className="animate-pulse text-muted-foreground font-bold">Caricamento...</div>
    </div>
  );

  if (!event) return <div className="text-center p-10">Evento non trovato.</div>;

  const isCancelled = event.cancellato;
  const presenti = roster.filter(p => p.status === 'PRESENTE');
  const infortunati = roster.filter(p => p.status === 'INFORTUNATO_PRESENTE');

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      
      {/* Header */}
      <div className={`p-4 sticky top-0 z-10 shadow-md flex items-center justify-between transition-colors
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
                <Button variant="secondary" size="sm" onClick={() => setEditDialogOpen(true)} className="gap-2 text-xs h-8">
                    <Pencil className="h-3 w-3" /> Modifica
                </Button>
            )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        
        {/* Info Evento */}
        <div className="text-center space-y-3 mt-2">
            
            <h2 className={`text-3xl font-black uppercase leading-none tracking-tight 
                ${isCancelled ? 'line-through text-muted-foreground' : 'text-amber-600 dark:text-blue-400'}`}>
                {event.avversario || "Allenamento"}
            </h2>
            
            <div className="flex justify-center items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 font-medium"><Calendar className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'd MMM yyyy', {locale: it})}</span>
                <span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4 text-primary"/> {format(new Date(event.data_ora), 'HH:mm')}</span>
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

            {isCancelled && <p className="text-red-500 font-bold text-sm bg-red-100 dark:bg-red-900/20 p-2 rounded">QUESTO EVENTO È STATO ANNULLATO</p>}
        </div>

        <Separator />

        {/* SEZIONE VOTO */}
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

        {/* LISTA CONVOCAZIONI */}
        <div>
            <div className="flex justify-between items-end mb-4 border-b pb-2">
                <h3 className="font-bold text-lg">Presenze ({presenti.length})</h3>
                {infortunati.length > 0 && <span className="text-xs text-yellow-600 font-bold bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded">{infortunati.length} Infortunati</span>}
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

                    return (
                        <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${borderClass} ${bgClass}`}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                                    <AvatarImage src={p.avatar_url} />
                                    <AvatarFallback>{p.nome[0]}{p.cognome[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-bold text-sm leading-none">{p.cognome} {p.nome}</p>
                                    <p className={`text-[10px] font-bold mt-1 ${statusColor}`}>{statusText}</p>
                                </div>
                            </div>

                            {/* SELECTOR GESTORE */}
                            {isManager ? (
                                <Select 
                                    value={status || "RESET"} 
                                    onValueChange={(val) => handleManagerOverride(p.id, val)}
                                >
                                    <SelectTrigger className="h-7 w-[110px] text-[10px] font-bold bg-background">
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