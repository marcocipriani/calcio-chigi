"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { toPng } from 'html-to-image'
import { 
    DndContext, 
    useDraggable, 
    useDroppable, 
    DragOverlay, 
    TouchSensor, 
    MouseSensor, 
    useSensor, 
    useSensors,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { differenceInYears } from "date-fns"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Search, Download, X, Ambulance, CheckCircle2, AlertCircle, UserPlus, Shirt } from "lucide-react"

const FORMATIONS: any = {
  "4-4-2": [
    { id: 'POR', role: 'PT', top: '88%', left: '50%' },
    { id: 'TS', role: 'DIF', top: '70%', left: '15%' }, { id: 'DC1', role: 'DIF', top: '70%', left: '38%' }, { id: 'DC2', role: 'DIF', top: '70%', left: '62%' }, { id: 'TD', role: 'DIF', top: '70%', left: '85%' },
    { id: 'ES', role: 'CEN', top: '45%', left: '15%' }, { id: 'CC1', role: 'CEN', top: '45%', left: '38%' }, { id: 'CC2', role: 'CEN', top: '45%', left: '62%' }, { id: 'ED', role: 'CEN', top: '45%', left: '85%' },
    { id: 'ATT1', role: 'ATT', top: '15%', left: '35%' }, { id: 'ATT2', role: 'ATT', top: '15%', left: '65%' }
  ],
  "4-3-3": [
    { id: 'POR', role: 'PT', top: '88%', left: '50%' },
    { id: 'TS', role: 'DIF', top: '70%', left: '15%' }, { id: 'DC1', role: 'DIF', top: '70%', left: '38%' }, { id: 'DC2', role: 'DIF', top: '70%', left: '62%' }, { id: 'TD', role: 'DIF', top: '70%', left: '85%' },
    { id: 'CC', role: 'CEN', top: '50%', left: '50%' }, { id: 'MZ1', role: 'CEN', top: '40%', left: '30%' }, { id: 'MZ2', role: 'CEN', top: '40%', left: '70%' },
    { id: 'AS', role: 'ATT', top: '20%', left: '20%' }, { id: 'ATT', role: 'ATT', top: '15%', left: '50%' }, { id: 'AD', role: 'ATT', top: '20%', left: '80%' }
  ],
  "3-5-2": [
    { id: 'POR', role: 'PT', top: '88%', left: '50%' },
    { id: 'DC1', role: 'DIF', top: '75%', left: '30%' }, { id: 'DC2', role: 'DIF', top: '75%', left: '50%' }, { id: 'DC3', role: 'DIF', top: '75%', left: '70%' },
    { id: 'MED', role: 'CEN', top: '55%', left: '50%' }, { id: 'ES', role: 'CEN', top: '45%', left: '15%' }, { id: 'CC1', role: 'CEN', top: '45%', left: '35%' }, { id: 'CC2', role: 'CEN', top: '45%', left: '65%' }, { id: 'ED', role: 'CEN', top: '45%', left: '85%' },
    { id: 'ATT1', role: 'ATT', top: '15%', left: '40%' }, { id: 'ATT2', role: 'ATT', top: '15%', left: '60%' }
  ],
  "4-2-3-1": [
    { id: 'POR', role: 'PT', top: '90%', left: '50%' },
    { id: 'TS', role: 'DIF', top: '75%', left: '15%' }, { id: 'DC1', role: 'DIF', top: '75%', left: '38%' }, { id: 'DC2', role: 'DIF', top: '75%', left: '62%' }, { id: 'TD', role: 'DIF', top: '75%', left: '85%' },
    { id: 'MED1', role: 'CEN', top: '55%', left: '35%' }, { id: 'MED2', role: 'CEN', top: '55%', left: '65%' },
    { id: 'TRQ1', role: 'CEN', top: '35%', left: '20%' }, { id: 'TRQ2', role: 'CEN', top: '35%', left: '50%' }, { id: 'TRQ3', role: 'CEN', top: '35%', left: '80%' },
    { id: 'ATT', role: 'ATT', top: '15%', left: '50%' }
  ]
}

const BENCH_SLOTS = Array.from({ length: 7 }, (_, i) => ({ id: `P${i + 1}` }));

function DraggableListCard({ player, isSelected }: { player: any, isSelected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `list-${player.id}`,
    data: { player, source: 'list' },
    disabled: isSelected
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 9999,
  } : undefined;

  const age = player.data_nascita ? differenceInYears(new Date(), new Date(player.data_nascita)) : null;
  const isU35 = age !== null && age < 35;
  const isInjured = player.note_mediche && player.note_mediche !== 'OK';

  if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`touch-none h-full ${isSelected ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
      <Card className={`p-2 flex items-center gap-3 cursor-grab active:cursor-grabbing transition-all h-full hover:shadow-md border 
        ${isInjured 
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'
        }
        ${isU35 && !isInjured ? 'border-l-4 border-l-blue-500' : ''}
      `}>
        
        {/* Avatar */}
        <div className="relative shrink-0">
            <Avatar className="h-12 w-12 border-2 border-slate-100 shadow-sm">
                <AvatarImage src={player.avatar_url} className="object-cover" />
                <AvatarFallback className="font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
            </Avatar>
            {isInjured && (
                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-red-100 z-10">
                    <Ambulance className="h-3.5 w-3.5 text-red-600 animate-pulse" />
                </div>
            )}
            
            {/* Fascia Capitano "C" */}
            {player.is_captain && (
                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[10px]">
                    C
                </div>
            )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div className="text-sm truncate leading-none text-slate-900 dark:text-slate-100 w-full text-center">
                <span className="font-black">{player.cognome}</span> <span className="font-normal text-slate-600 dark:text-slate-400">{player.nome}</span>
            </div>
            
            <div className="flex items-center justify-center gap-2">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                    {player.ruolo?.substring(0, 3)}
                </span>

                {isU35 && (
                    <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 shadow-none font-bold">
                        U35
                    </Badge>
                )}

                <div className="relative flex items-center justify-center h-5 w-5 text-slate-800 dark:text-slate-300">
                    <Shirt className="h-5 w-5 fill-current opacity-20" /> 
                    <span className="absolute text-[9px] font-black leading-none text-foreground pb-[1px]">
                        {player.numero_maglia || '-'}
                    </span>
                </div>
            </div>
        </div>
      </Card>
    </div>
  );
}

// 2. TOKEN CAMPO
function DraggableFieldToken({ player, slotId, isBench = false }: { player: any, slotId: string, isBench?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `field-token-${slotId}`,
      data: { player, source: 'field', fromSlotId: slotId }
    });
  
    const style = transform ? {
      transform: CSS.Translate.toString(transform),
      zIndex: 9999,
    } : undefined;

    const age = player.data_nascita ? differenceInYears(new Date(), new Date(player.data_nascita)) : null;
    const isU35 = age !== null && age < 35;
  
    if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none relative group">
            <div className="flex flex-col items-center">
                <div className="relative">
                    <Avatar className={`${isBench ? 'h-10 w-10' : 'h-14 w-14'} border-[3px] border-white shadow-md bg-white ring-1 ring-black/10`}>
                        <AvatarImage src={player.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-slate-900 text-white font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    
                    {/* Badge U35 */}
                    {isU35 && (
                        <div className="absolute -top-1 -left-1 bg-blue-600 text-white text-[8px] font-black px-1.5 py-[1px] rounded-[3px] shadow-sm border border-white z-10">
                            U35
                        </div>
                    )}

                    {/* Badge Capitano "C" */}
                    {player.is_captain && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[10px]">
                            C
                        </div>
                    )}
                </div>
                <div className={`mt-0.5 bg-slate-900/90 backdrop-blur-md text-white text-[9px] font-bold px-2 py-[2px] rounded-full shadow-lg max-w-[85px] truncate border border-white/20 leading-tight ${isBench ? 'hidden' : ''}`}>
                    {player.cognome}
                </div>
            </div>
        </div>
    )
}

// 3. SLOT GENERATORE
function FormationSlot({ slot, playerInSlot, onRemove, isBench = false }: { slot: any, playerInSlot: any, onRemove: () => void, isBench?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slot.id}`,
    data: { slotId: slot.id }
  });

  const baseStyle = isBench 
    ? "relative w-11 h-11 rounded-lg bg-black/5 border border-dashed border-slate-300 flex items-center justify-center"
    : "absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all duration-200 z-10";

  const displayRole = slot.id.replace(/[0-9]/g, '');

  return (
    <div 
        ref={setNodeRef}
        className={`${baseStyle} ${isOver ? 'scale-110 border-blue-500 bg-blue-500/10' : ''}`}
        style={!isBench ? { top: slot.top, left: slot.left } : {}}
    >
        {playerInSlot ? (
            <div className="relative">
                <DraggableFieldToken player={playerInSlot} slotId={slot.id} isBench={isBench} />
                <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-[2px] shadow-md z-20"
                    title="Rimuovi"
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            </div>
        ) : (
            <div className={`${isBench ? 'h-full w-full' : 'h-12 w-12 rounded-full'} border-2 border-dashed flex items-center justify-center transition-colors ${isOver ? 'border-amber-chigi bg-amber-chigi/30' : 'border-white/30 bg-white/5'}`}>
                {isBench ? <UserPlus className="h-4 w-4 text-slate-300" /> : <span className="text-[10px] font-black text-white/40 tracking-wider">{displayRole}</span>}
            </div>
        )}
    </div>
  )
}


export default function SquadraPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [filteredPlayers, setFilteredPlayers] = useState<any[]>([])
  const [module, setModule] = useState("4-4-2")
  const [loading, setLoading] = useState(true)
  
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OK' | 'KO'>('ALL')
  const [lineup, setLineup] = useState<Record<string, any>>({})
  const [activePlayer, setActivePlayer] = useState<any>(null)
  
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function getPlayers() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('cognome', { ascending: true })
      
      setPlayers(data || [])
      setLoading(false)
    }
    getPlayers()
  }, [])

  useEffect(() => {
    let result = players;
    if (filterStatus === 'OK') result = result.filter(p => !p.note_mediche || p.note_mediche === 'OK');
    else if (filterStatus === 'KO') result = result.filter(p => p.note_mediche && p.note_mediche !== 'OK');

    const lowerTerm = searchTerm.toLowerCase();
    if (lowerTerm) {
        result = result.filter(p => 
            p.nome?.toLowerCase().includes(lowerTerm) || 
            p.cognome?.toLowerCase().includes(lowerTerm)
        );
    }
    setFilteredPlayers(result);
  }, [searchTerm, filterStatus, players]);

  // --- DRAG & DROP ---
  const handleDragStart = (event: DragStartEvent) => {
      const { active } = event;
      setActivePlayer(active.data.current?.player);
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePlayer(null);

    if (!over) return;

    if (over.id.toString().startsWith('slot-')) {
        const targetSlotId = over.data.current?.slotId;
        const player = active.data.current?.player;
        const source = active.data.current?.source;

        if (source === 'list') {
            setLineup(prev => ({ ...prev, [targetSlotId]: player }));
        } else if (source === 'field') {
            const oldSlotId = active.data.current?.fromSlotId;
            setLineup(prev => {
                const newState = { ...prev };
                delete newState[oldSlotId];
                newState[targetSlotId] = player;
                return newState;
            });
        }
    }
  }

  const removePlayerFromSlot = (slotId: string) => {
      setLineup(prev => {
          const newState = { ...prev };
          delete newState[slotId];
          return newState;
      })
  }

  const isPlayerSelected = (playerId: string) => {
      return Object.values(lineup).some((p: any) => p.id === playerId);
  }

  const downloadImage = async () => {
      if (fieldRef.current) {
          try {
            const dataUrl = await toPng(fieldRef.current, { cacheBust: true, pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = `formazione-${module}-${new Date().toISOString().slice(0,10)}.png`;
            link.href = dataUrl;
            link.click();
          } catch (err) { console.error("Errore salvataggio", err); }
      }
  }

  if(loading) return (
    <div className="flex flex-col justify-center items-center h-[50vh] gap-3">
        <Loader2 className="animate-spin text-primary h-8 w-8"/>
    </div>
  )

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="container max-w-7xl mx-auto p-2 pb-24 lg:flex lg:gap-4 lg:items-start">
            
            {/* COLONNA SINISTRA */}
            <div className="lg:w-[55%] lg:sticky lg:top-20 space-y-4">
                <div className="bg-card border rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Select value={module} onValueChange={(val) => { setModule(val); setLineup({}); }}>
                            <SelectTrigger className="w-[90px] h-8 text-xs font-bold border-border bg-background">
                                <SelectValue placeholder="Modulo" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(FORMATIONS).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => setLineup({})} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Button onClick={downloadImage} size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3">
                        <Download className="h-3.5 w-3.5" /> Salva
                    </Button>
                </div>

                <div ref={fieldRef} className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="relative flex-1 max-w-[450px] mx-auto aspect-[3/4] bg-gradient-to-b from-green-600 via-green-600 to-green-700 rounded-lg overflow-hidden shadow-2xl border-[4px] border-white/20 ring-1 ring-black/10">
                        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 30px, #000 30px, #000 60px)'}}></div>
                        <div className="absolute inset-4 border-2 border-white/60 rounded-sm"></div>
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/60"></div>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white/60 rounded-full bg-green-600/0"></div>
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-t-0 border-white/60 bg-white/5"></div>
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-b-0 border-white/60 bg-white/5"></div>
                        
                        {/* Logo Trasparenza */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
                            <img src="https://cdn.enjore.com/source/img/team/badge/q/1068461sZGTQo021pdfMG4.png" className="w-28 h-28 grayscale brightness-200" />
                        </div>

                        {FORMATIONS[module].map((slot: any) => (
                            <FormationSlot 
                                key={slot.id} 
                                slot={slot} 
                                playerInSlot={lineup[slot.id]} 
                                onRemove={() => removePlayerFromSlot(slot.id)}
                            />
                        ))}
                    </div>

                    <div className="flex flex-col gap-1.5 p-1.5 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner w-14 items-center">
                        <span className="text-[7px] font-black text-slate-300 uppercase vertical-text py-1 tracking-widest">Panchina</span>
                        {BENCH_SLOTS.map((slot) => (
                            <FormationSlot 
                                key={slot.id} 
                                slot={slot} 
                                playerInSlot={lineup[slot.id]} 
                                onRemove={() => removePlayerFromSlot(slot.id)}
                                isBench={true}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* COLONNA DESTRA */}
            <div className="mt-6 lg:mt-0 lg:w-[45%] flex flex-col gap-3 lg:h-[calc(100vh-100px)]">
                
                <div className="bg-card border rounded-lg p-3 shadow-sm space-y-2 sticky top-20 z-20">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-foreground">Rosa ({filteredPlayers.length})</h3>
                        <div className="flex gap-2">
                            <span className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                Under 35
                            </span>
                        </div>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Cerca nome..." 
                            className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus:bg-background"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex bg-muted p-0.5 rounded-md">
                        <button onClick={() => setFilterStatus('ALL')} className={`flex-1 py-1 rounded-sm text-[9px] font-bold transition-all ${filterStatus === 'ALL' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            Tutti
                        </button>
                        <button onClick={() => setFilterStatus('OK')} className={`flex-1 py-1 rounded-sm text-[9px] font-bold transition-all flex items-center justify-center gap-1 ${filterStatus === 'OK' ? 'bg-background shadow text-green-600' : 'text-muted-foreground hover:text-green-600'}`}>
                            Disponibili
                        </button>
                        <button onClick={() => setFilterStatus('KO')} className={`flex-1 py-1 rounded-sm text-[9px] font-bold transition-all flex items-center justify-center gap-1 ${filterStatus === 'KO' ? 'bg-background shadow text-red-600' : 'text-muted-foreground hover:text-red-600'}`}>
                            Infortunati
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 lg:overflow-y-auto lg:pr-1 pb-20 custom-scrollbar">
                    {filteredPlayers.map(player => (
                        <DraggableListCard 
                            key={player.id} 
                            player={player} 
                            isSelected={isPlayerSelected(player.id)}
                        />
                    ))}
                    {filteredPlayers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-xs col-span-3">
                            Nessun giocatore trovato.
                        </div>
                    )}
                </div>
            </div>

            <DragOverlay>
               {activePlayer ? (
                   <div className="h-14 w-14 rounded-full bg-primary border-[3px] border-white shadow-2xl flex items-center justify-center opacity-90 cursor-grabbing overflow-hidden">
                       <Avatar className="h-full w-full">
                           <AvatarImage src={activePlayer.avatar_url} className="object-cover" />
                           <AvatarFallback>{activePlayer.cognome[0]}</AvatarFallback>
                       </Avatar>
                   </div>
               ) : null}
            </DragOverlay>

        </div>
    </DndContext>
  )
}