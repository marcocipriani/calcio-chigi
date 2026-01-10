"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from '@/lib/supabase'
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
import { differenceInYears, format } from "date-fns"
import { it } from 'date-fns/locale'

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Loader2, Search, Download, X, Ambulance, UserPlus, Shirt, Info, Trash2, CreditCard, Ruler, Calendar, Mail, Briefcase, Quote, AlertCircle } from "lucide-react"

// --- MODULI ---
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

const BENCH_SLOTS = Array.from({ length: 9 }, (_, i) => ({ id: `P${i + 1}` }));

// --- UTILS ---
const getAge = (dob: string) => dob ? differenceInYears(new Date(), new Date(dob)) : null;
const isU35Func = (dob: string) => { const age = getAge(dob); return age !== null && age < 35; };

// --- COMPONENTI ---

// 1. CARD LISTA ROSA
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

  const isU35 = isU35Func(player.data_nascita);
  const isInjured = player.note_mediche && player.note_mediche !== 'OK';
  const formattedDob = player.data_nascita ? format(new Date(player.data_nascita), 'dd/MM/yy', {locale: it}) : 'N.D.';

  if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

  return (
    <div ref={setNodeRef} style={style} className={`h-full relative group ${isSelected ? 'opacity-40 grayscale' : ''}`}>
      
      <Dialog>
          <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-1 right-1 h-6 w-6 z-20 text-slate-300 hover:text-primary hover:bg-slate-100/50 rounded-full"
                onClick={(e) => e.stopPropagation()} 
              >
                  <Info className="h-4 w-4" />
              </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm rounded-xl">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                    <Avatar className="h-18 w-18 border-2 border-primary/20"><AvatarImage src={player.avatar_url} className="object-cover"/><AvatarFallback>{player.cognome[0]}</AvatarFallback></Avatar>
                    <div className="flex flex-col">
                        <span className="text-xl font-black">{player.cognome}</span>
                        <span className="text-sm text-muted-foreground font-medium">{player.nome}</span>
                    </div>
                </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm mt-2">
                <div className="col-span-2 flex items-center gap-2 text-muted-foreground border-b pb-2">
                    <Mail className="h-4 w-4" /> <span className="text-foreground select-all">{player.email}</span>
                </div>
                
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Data di Nascita</span>
                    <span className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" /> {formattedDob} ({getAge(player.data_nascita)} anni)</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Ruolo</span>
                    <span className="font-bold">{player.ruolo}</span>
                </div>

                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Dipartimento</span>
                    <span className="font-medium flex items-center gap-1"><Briefcase className="h-3 w-3" /> {player.dipartimento || '-'}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Maglia</span>
                    <span className="font-black flex items-center gap-1"><Shirt className="h-3 w-3" /> {player.numero_maglia || '-'}</span>
                </div>

                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Taglia</span>
                    <span className="font-medium flex items-center gap-1"><Ruler className="h-3 w-3" /> {player.taglia_divisa || '-'}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Tessera ASI</span>
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded w-fit flex items-center gap-1"><CreditCard className="h-3 w-3" /> {player.tessera_asi || 'N/A'}</span>
                </div>

                {player.motto && (
                    <div className="col-span-2 bg-muted/30 p-2 rounded-lg italic text-xs text-center mt-2 flex items-center justify-center gap-1">
                        <Quote className="h-3 w-3 text-muted-foreground/50" /> {player.motto}
                    </div>
                )}

                {player.note_mediche && player.note_mediche !== 'OK' && (
                    <div className="col-span-2 bg-red-50 text-red-700 p-2 rounded-lg text-xs border border-red-200 mt-1 flex items-start gap-2">
                        <Ambulance className="h-4 w-4 shrink-0 mt-0.5" /> 
                        <div>
                            <span className="font-bold block">Infermeria:</span>
                            {player.note_mediche}
                        </div>
                    </div>
                )}
            </div>
          </DialogContent>
      </Dialog>

      <Card 
        {...listeners} 
        {...attributes} 
        className={`touch-none flex flex-col items-center justify-center p-3 gap-2 cursor-grab active:cursor-grabbing transition-all h-full hover:shadow-md border select-none
        ${isInjured 
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'
        }
        ${isU35 && !isInjured ? 'border-l-4 border-l-blue-500' : ''}
      `}>
        
        {/* Avatar */}
        <div className="relative shrink-0">
            <Avatar className="h-14 w-14 border-2 border-slate-100 shadow-sm">
                <AvatarImage src={player.avatar_url} className="object-cover" />
                <AvatarFallback className="font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
            </Avatar>
            {isInjured && (
                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-red-100 z-10">
                    <Ambulance className="h-3.5 w-3.5 text-red-600 animate-pulse" />
                </div>
            )}
            {player.is_captain && (
                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[10px]">
                    C
                </div>
            )}
        </div>
        
        {/* Info */}
        <div className="flex-1 w-full min-w-0 flex flex-col items-center justify-center gap-1">
            <div className="text-sm leading-tight text-slate-900 dark:text-slate-100 w-full text-center truncate px-1">
                <span className="font-black">{player.cognome}</span> <span className="font-normal text-slate-600 dark:text-slate-400">{player.nome}</span>
            </div>
            
            <div className="flex items-center justify-center gap-2 w-full">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                    {player.ruolo?.substring(0, 3)}
                </span>

                {isU35 && (
                    <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 shadow-none font-bold">
                        U35
                    </Badge>
                )}

                <div className="relative flex items-center justify-center h-5 w-5 text-slate-800 dark:text-slate-300">
                    <Shirt className="h-4 w-4 fill-current opacity-20" /> 
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

// 2. TOKEN FIELD
function DraggableFieldToken({ player, slotId, isBench = false }: { player: any, slotId: string, isBench?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `field-token-${slotId}`,
      data: { player, source: 'field', fromSlotId: slotId, isBench }
    });
  
    const style = transform ? {
      transform: CSS.Translate.toString(transform),
      zIndex: 9999,
    } : undefined;

    const isU35 = isU35Func(player.data_nascita);
  
    if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none relative group z-20">
            <div className="flex flex-col items-center">
                <div className="relative transition-transform hover:scale-110">
                    <Avatar className={`${isBench ? 'h-11 w-11' : 'h-16 w-16'} border-[3px] border-white shadow-xl bg-white ring-1 ring-black/20`}>
                        <AvatarImage src={player.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-slate-900 text-white font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    
                    {isU35 && (
                        <div className="absolute -top-1 -left-1 bg-blue-600 text-white text-[9px] font-black px-1.5 py-[1px] rounded-[4px] shadow-sm border border-white z-10">
                            U35
                        </div>
                    )}
                    {player.is_captain && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[10px]">
                            C
                        </div>
                    )}
                </div>
                <div className={`mt-1 bg-slate-900/90 backdrop-blur-md text-white font-bold px-2 py-0.5 rounded-full shadow-lg truncate border border-white/20 leading-tight ${isBench ? 'text-[8px] max-w-[55px]' : 'text-[10px] max-w-[90px]'}`}>
                    {player.cognome}
                </div>
            </div>
        </div>
    )
}

// 3. SLOT GENERATOR
function FormationSlot({ slot, playerInSlot, onRemove, isBench = false }: { slot: any, playerInSlot: any, onRemove: () => void, isBench?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slot.id}`,
    data: { slotId: slot.id }
  });

  const baseStyle = isBench 
    ? "relative w-12 h-16 rounded-lg bg-black/5 border border-dashed border-slate-300 flex flex-col items-center justify-center shrink-0" // h-16 per contenere avatar+nome
    : "absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all duration-200 z-10";

  const displayRole = slot.id.replace(/[0-9]/g, '');

  return (
    <div 
        ref={setNodeRef}
        className={`${baseStyle} ${isOver ? 'scale-110 border-blue-500 bg-blue-500/20' : ''}`}
        style={!isBench ? { top: slot.top, left: slot.left } : {}}
    >
        {playerInSlot ? (
            <div className="relative">
                <DraggableFieldToken player={playerInSlot} slotId={slot.id} isBench={isBench} />
                <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-[2px] h-5 w-5 flex items-center justify-center shadow-md z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rimuovi"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        ) : (
            <div className={`${isBench ? 'h-10 w-10 rounded-lg' : 'h-14 w-14 rounded-full'} border-2 border-dashed flex items-center justify-center transition-colors ${isOver ? 'border-amber-400 bg-amber-400/30' : 'border-white/30 bg-white/5'}`}>
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
      const { data } = await supabase.from('profiles').select('*').order('cognome', { ascending: true })
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

  const u35Count = Object.keys(lineup)
    .filter(slotId => !slotId.startsWith('P') && slotId !== 'POR') 
    .reduce((acc, slotId) => {
        const player = lineup[slotId];
        return acc + (isU35Func(player.data_nascita) ? 1 : 0);
    }, 0);

  const isTooManyU35 = u35Count > 2;

  const handleModuleChange = (newModule: string) => {
      const oldLineup = { ...lineup };
      const newFormSlots = FORMATIONS[newModule];
      const newLineup: Record<string, any> = {};

      if (oldLineup['POR']) {
          newLineup['POR'] = oldLineup['POR'];
          delete oldLineup['POR'];
      }

      Object.keys(oldLineup).forEach(key => {
          if (key.startsWith('P')) {
              newLineup[key] = oldLineup[key];
              delete oldLineup[key];
          }
      });

      const remainingPlayers = Object.values(oldLineup);
      const remainingSlots = newFormSlots.filter((s:any) => s.id !== 'POR');

      remainingPlayers.forEach((player, index) => {
          if (index < remainingSlots.length) {
              newLineup[remainingSlots[index].id] = player;
          }
      });

      setModule(newModule);
      setLineup(newLineup);
  }

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

        const playerInTarget = lineup[targetSlotId];

        if (source === 'list') {
            setLineup(prev => ({ ...prev, [targetSlotId]: player }));
        } else if (source === 'field') {
            const sourceSlotId = active.data.current?.fromSlotId;
            setLineup(prev => {
                const newState = { ...prev };
                if (playerInTarget) {
                    newState[targetSlotId] = player;
                    newState[sourceSlotId] = playerInTarget;
                } else {
                    delete newState[sourceSlotId];
                    newState[targetSlotId] = player;
                }
                return newState;
            });
        }
    }
  }

  const removePlayerFromSlot = (slotId: string) => {
      setLineup(prev => { const n = {...prev}; delete n[slotId]; return n; })
  }

  const isPlayerSelected = (playerId: string) => Object.values(lineup).some((p: any) => p.id === playerId);

  const downloadImage = async () => {
      if (fieldRef.current) {
          try {
            const timestamp = format(new Date(), 'yyyy-MM-dd-HH-mm');
            const dataUrl = await toPng(fieldRef.current, { cacheBust: true, pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = `circolo-chigi-formazione-${timestamp}.png`;
            link.href = dataUrl;
            link.click();
          } catch (err) { console.error("Errore salvataggio", err); }
      }
  }

  if(loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="container max-w-7xl mx-auto p-2 pb-24 lg:flex lg:gap-6 lg:items-start">
            
            <div className="flex-none lg:w-[55%] lg:sticky lg:top-20 space-y-3 z-10 bg-background pb-2 lg:pb-0">
                
                <div className="bg-card border rounded-lg p-2 flex items-center justify-between gap-2 shadow-sm relative">
                    
                    <Select value={module} onValueChange={handleModuleChange}>
                        <SelectTrigger className="w-[110px] h-9 text-xs font-bold border-border bg-background">
                            <SelectValue placeholder="Modulo" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(FORMATIONS).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    
                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black border transition-colors ${isTooManyU35 ? 'bg-red-100 text-red-600 border-red-300 animate-pulse' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                           {isTooManyU35 ? <AlertCircle className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-blue-500"></span>}
                           U35: {u35Count}/2
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button 
                            variant="destructive" 
                            size="icon" 
                            onClick={() => setLineup({})} 
                            className="h-9 w-9 rounded-md shadow-sm"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button 
                            onClick={downloadImage} 
                            size="icon" 
                            className="h-9 w-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* FIELD */}
                <div ref={fieldRef} className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="relative flex-1 max-w-[450px] mx-auto aspect-[3/4] bg-gradient-to-b from-green-600 via-green-600 to-green-700 rounded-lg overflow-hidden shadow-2xl border-[3px] border-white/20 ring-1 ring-black/10">
                        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, #000 39px, #000 40px)'}}></div>
                        <div className="absolute inset-4 border-2 border-white/60 rounded-sm pointer-events-none"></div>
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/60 pointer-events-none"></div>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/60 rounded-full bg-green-600/0 pointer-events-none"></div>
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-t-0 border-white/60 bg-white/5 pointer-events-none"></div>
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-b-0 border-white/60 bg-white/5 pointer-events-none"></div>
                        
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
                            <img src="https://cdn.enjore.com/source/img/team/badge/q/1068461sZGTQo021pdfMG4.png" className="w-32 h-32 grayscale brightness-200" />
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

                    <div className="flex flex-col gap-1.5 p-1 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner w-14 items-center overflow-x-hidden overflow-y-auto scrollbar-hide">
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

            {/* PLAYERS LIST */}
            <div className="flex-1 flex flex-col gap-3 min-h-0">
                
                {/* Filtri */}
                <div className="bg-card border rounded-lg p-2 shadow-sm space-y-2 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Cerca giocatore..." 
                            className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus:bg-background"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-muted p-0.5 rounded-md">
                        {['ALL', 'OK', 'KO'].map(status => (
                            <button 
                                key={status}
                                onClick={() => setFilterStatus(status as any)} 
                                className={`flex-1 py-1 rounded-sm text-[9px] font-bold transition-all ${filterStatus === status ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                            >
                                {status === 'ALL' ? 'Tutti' : status === 'OK' ? 'Disponibili' : 'Infortunati'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                    {filteredPlayers.map(player => (
                        <div key={player.id} className="h-[140px]"> 
                            <DraggableListCard 
                                player={player} 
                                isSelected={isPlayerSelected(player.id)}
                            />
                        </div>
                    ))}
                    {filteredPlayers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-xs col-span-full">
                            Nessun giocatore trovato.
                        </div>
                    )}
                </div>
            </div>

            <DragOverlay>
               {activePlayer ? (
                   <div className="h-16 w-16 rounded-full bg-primary border-[3px] border-white shadow-2xl flex items-center justify-center opacity-90 cursor-grabbing overflow-hidden">
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