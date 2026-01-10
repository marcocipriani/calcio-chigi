import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Clock, Trophy, Dumbbell, Pencil, Ban, LayoutTemplate } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Event } from "@/lib/types";

interface EventProps {
  event: Event;
  opponentLogo?: string | null;
  isManager?: boolean;
  onEdit?: (event: Event) => void;
}

export function EventCard({ event, opponentLogo, isManager, onEdit }: EventProps) {
  const date = new Date(event.data_ora);
  const isMatch = event.tipo === 'PARTITA';
  const isPlayed = event.giocata === true;
  const isCancelled = event.cancellato === true;

  const activePlayers = event.attendance?.filter((a: any) => a.status === 'PRESENTE') || [];
  const activeCount = activePlayers.length;

  let resultBadgeClass = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  let resultLabel = "PAREGGIO";
  
  const isChigiCasa = event.squadra_casa?.toLowerCase().includes('chigi');
  
  const golNoi = isChigiCasa ? (event.gol_casa ?? 0) : (event.gol_ospite ?? 0);
  const golLoro = isChigiCasa ? (event.gol_ospite ?? 0) : (event.gol_casa ?? 0);

  const scoreDisplay = isPlayed ? `${event.gol_casa ?? 0}-${event.gol_ospite ?? 0}` : "";

  if (isPlayed && isMatch) {
    if (golNoi > golLoro) {
        resultBadgeClass = "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
        resultLabel = "VITTORIA";
    } else if (golNoi < golLoro) {
        resultBadgeClass = "bg-red-50 text-red-600 border border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900";
        resultLabel = "SCONFITTA";
    } else {
        resultBadgeClass = "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
        resultLabel = "PAREGGIO";
    }
  }

  return (
    <Card className={`mb-3 border shadow-sm relative overflow-hidden transition-all group dark:border-slate-800 
        ${isCancelled ? 'opacity-60 grayscale' : ''} 
        ${!isCancelled && (isMatch ? 'hover:border-blue-500/50' : 'hover:border-amber-500/50')}
    `}>
      <CardContent className="p-0">
        
        <div className={`px-4 py-3 flex justify-between items-center border-b dark:border-slate-800 
            ${isCancelled ? 'bg-slate-100 dark:bg-slate-900 border-l-4 border-l-slate-400' : (isMatch ? 'border-l-4 border-l-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10')}
        `}>
            <div className="flex items-center gap-2">
                {isCancelled ? (
                    <Ban className="h-5 w-5 text-red-500" />
                ) : (
                    isMatch ? <Trophy className="h-5 w-5 text-blue-600" /> : <Dumbbell className="h-5 w-5 text-amber-600" />
                )}
                <span className={`text-sm font-bold capitalize ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {format(date, 'EEEE d MMMM', { locale: it })}
                </span>
                {isCancelled && <Badge variant="destructive" className="text-[9px] h-5">ANNULLATO</Badge>}
            </div>
            
            <div className="flex items-center gap-2">
                {!isPlayed && !isCancelled && (
                    <div className="flex items-center text-foreground font-mono font-bold text-sm bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border dark:border-slate-700">
                        <Clock className="h-4 w-4 mr-1.5 text-muted-foreground" />
                        {format(date, 'HH:mm')}
                    </div>
                )}
                
                {isManager && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-full bg-white/50 hover:bg-white dark:bg-black/20 dark:hover:bg-black/40"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit && onEdit(event); }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>

        <div className="p-4 dark:bg-card">
            <div className="flex items-center justify-between gap-4">
                
                <div className="flex-1">
                    {isMatch ? (
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 shrink-0 rounded-full bg-background border-2 border-border flex items-center justify-center p-1 group-hover:border-primary transition-colors overflow-hidden">
                                {opponentLogo ? (
                                    <img src={opponentLogo} alt="Logo" className="h-full w-full object-contain" />
                                ) : (
                                    <span className="text-sm font-bold text-muted-foreground">{event.avversario?.substring(0,2)}</span>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Avversario</p>
                                <h3 className={`font-black text-foreground leading-tight text-xl ${isCancelled ? 'line-through opacity-50' : ''}`}>
                                    {event.avversario}
                                </h3>
                                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mt-1.5">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span className="truncate">{event.luogo}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                             <h3 className={`font-black text-foreground text-xl mb-1 ${isCancelled ? 'line-through opacity-50' : ''}`}>
                                Allenamento
                             </h3>
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5 text-amber-600" />
                                    <span>{event.luogo}</span>
                                </div>
                                
                                {event.tipo_campo && (
                                    <Badge variant="outline" className="h-5 px-1.5 gap-1 bg-background border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                                        <LayoutTemplate className="h-3 w-3 text-muted-foreground" />
                                        <span>{event.tipo_campo === 'a11' ? '11' : '8'}</span>
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {isPlayed && isMatch && !isCancelled && (
                    <div className={`flex flex-col items-center justify-center rounded-xl px-4 py-3 transition-colors ${resultBadgeClass}`}>
                        <div className="text-3xl font-black font-mono leading-none tracking-tighter text-current">
                            {scoreDisplay}
                        </div>
                        <span className="text-[10px] font-bold uppercase opacity-80 mt-1 tracking-wide">{resultLabel}</span>
                    </div>
                )}
            </div>

            {!isPlayed && !isCancelled && (
                <div className="mt-4 pt-3 border-t dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center -space-x-2 overflow-hidden pl-1">
                        {activePlayers.slice(0, 5).map((att: any, i: number) => (
                            <Avatar key={i} className="inline-block h-7 w-7 rounded-full ring-2 ring-background dark:ring-slate-800">
                                <AvatarImage src={att.profiles?.avatar_url || ""} />
                                <AvatarFallback className="bg-muted text-[9px] text-muted-foreground font-bold">
                                    {att.profiles?.nome?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                        {activeCount > 5 && (
                             <span className="h-7 w-7 rounded-full bg-muted ring-2 ring-background dark:ring-slate-800 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                +{activeCount - 5}
                             </span>
                        )}
                    </div>
                    
                    {activeCount > 0 && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 gap-1.5 ml-2 pr-2.5 py-1 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            <span className="font-bold">{activeCount} Presenti</span>
                        </Badge>
                    )}
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}