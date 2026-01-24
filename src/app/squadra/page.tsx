"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createBrowserClient } from '@supabase/ssr'
import { toPng } from 'html-to-image'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Loader2, Search, Download, X, Ambulance, UserPlus, Shirt, Info, Trash2, CreditCard, Ruler, Calendar, Mail, Briefcase, Plus, Pencil, AlertCircle, Crown, Award, FileSpreadsheet, Sparkles, Star, Trophy, Baby, ShieldCheck } from "lucide-react"

import { BOMBER_TAGS } from "@/lib/constants"

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

const getAge = (dob: string) => dob ? differenceInYears(new Date(), new Date(dob)) : null;
const isU35Func = (dob: string) => { const age = getAge(dob); return age !== null && age < 35; };

function DraggableListCard({ player, isSelected, isManager, currentUserId, onEditPlayer, isMobile, captainId, viceCaptainId, onSetRole, onDeletePlayer }: { 
    player: any, isSelected: boolean, isManager: boolean, currentUserId: string | null, onEditPlayer: (p: any) => void, isMobile: boolean, captainId: string | null, viceCaptainId: string | null, onSetRole: (role: 'K' | 'VK' | null, id: string) => void, onDeletePlayer: (p: any) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `list-${player.id}`,
    data: { player, source: 'list' },
    disabled: isSelected || isMobile
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 9999,
  } : undefined;

  const isU35 = isU35Func(player.data_nascita);
  const isInjured = player.note_mediche && player.note_mediche !== 'OK';
  const formattedDob = player.data_nascita ? format(new Date(player.data_nascita), 'dd/MM/yy', {locale: it}) : 'N.D.';
  const isCurrentUser = currentUserId === player.id;
  const canEdit = isManager || isCurrentUser;
  
  const isCaptain = captainId === player.id;
  const isVice = viceCaptainId === player.id;

  const playerTags = player.tags || [];

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
          <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden bg-card">
            
            <DialogTitle className="sr-only">Dettagli di {player.cognome}</DialogTitle>

            {/* Header Colorato */}
            <div className="bg-slate-50 dark:bg-slate-900 p-6 pb-4 border-b relative">
                <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                        <AvatarImage src={player.avatar_url} className="object-cover"/>
                        <AvatarFallback className="text-xl font-bold">{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black leading-none">{player.cognome}</h2>
                        <p className="text-lg font-medium text-muted-foreground">{player.nome}</p>
                        <Badge variant="outline" className="bg-background text-xs font-bold mr-2">{player.ruolo}</Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1"><Mail className="h-3 w-3" /> {player.email}</div>
                    </div>
                </div>

                <div className="absolute top-3 right-10 flex items-center gap-2">
                    {isManager && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md bg-purple-100 text-purple-700 hover:bg-red-100 hover:text-red-600 transition-colors shadow-sm">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Eliminare {player.cognome}?</AlertDialogTitle>
                                    <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeletePlayer(player)} className="bg-red-600">Elimina</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {canEdit && (
                        <Button 
                            size="icon"
                            className={`h-8 w-8 rounded-md shadow-sm ${isManager ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                            onClick={() => onEditPlayer(player)}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-6 pt-4 space-y-5">

                <div className="flex gap-2">
                    <Button 
                        size="sm" 
                        variant={isCaptain ? "default" : "outline"} 
                        className={`flex-1 gap-2 font-bold h-8 ${isCaptain ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-950 border-yellow-500' : ''}`}
                        onClick={() => onSetRole(isCaptain ? null : 'K', player.id)}
                    >
                        <Crown className="h-4 w-4" /> {isCaptain ? 'Capitano' : 'Capitano'}
                    </Button>
                    <Button 
                        size="sm" 
                        variant={isVice ? "default" : "outline"} 
                        className={`flex-1 gap-2 font-bold h-8 ${isVice ? 'bg-slate-700 hover:bg-slate-800 text-white' : ''}`}
                        onClick={() => onSetRole(isVice ? null : 'VK', player.id)}
                    >
                        <Award className="h-4 w-4" /> {isVice ? 'Vice Capitano' : 'Vice Capitano'}
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Data di Nascita</Label>
                        <div className="flex items-center gap-2 font-bold"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {formattedDob}</div>
                        <span className="text-xs text-muted-foreground">({getAge(player.data_nascita)} anni)</span>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Tessera ASI</Label>
                        <div className="flex items-center gap-2 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded w-fit"><CreditCard className="h-3 w-3" /> {player.tessera_asi || 'N/A'}</div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Maglia</Label>
                        <div className="flex items-center gap-2 font-black text-lg"><Shirt className="h-4 w-4 text-muted-foreground" /> {player.numero_maglia || '-'}</div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Taglia</Label>
                        <div className="flex items-center gap-2 font-bold"><Ruler className="h-3.5 w-3.5 text-muted-foreground" /> {player.taglia_divisa || '-'}</div>
                    </div>

                    {isManager && (
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Staff Tecnico</Label>
                            <div className="font-bold text-purple-600">{player.is_staff ? 'SI' : 'NO'}</div>
                        </div>
                    )}
                </div>

                <div className={`p-3 rounded-lg border flex items-start gap-3 ${isInjured ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                    {isInjured ? <Ambulance className="h-5 w-5 mt-0.5" /> : <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center font-bold text-xs">OK</div>}
                    <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide mb-0.5">{isInjured ? 'Infermeria' : 'Stato fisico'}</p>
                        <p className="text-sm font-medium">{player.note_mediche && player.note_mediche !== 'OK' ? player.note_mediche : 'Giocatore disponibile'}</p>
                    </div>
                </div>

                <div className="pt-4 border-t space-y-5">
                    
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Dipartimento</Label>
                        <Input value={player.dipartimento || ''} readOnly className="bg-slate-50 border-0 h-8 font-medium" />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Caratteristiche</Label>
                        {playerTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {playerTags.map((tag: string) => (
                                    <Badge key={tag} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">{tag}</Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground italic">Nessuna caratteristica selezionata</p>
                        )}
                    </div>
                </div>

            </div>
          </DialogContent>
      </Dialog>

      <Card 
        {...listeners} 
        {...attributes} 
        className={`flex flex-col items-center justify-center p-3 gap-2 cursor-grab active:cursor-grabbing transition-all h-full hover:shadow-md border select-none
        ${!isMobile ? 'touch-none' : ''} 
        ${isInjured 
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'
        }
        ${isU35 && !isInjured ? 'border-l-4 border-l-blue-500' : ''}
      `}>
        
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
            {isCaptain && (
                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[9px]">C</div>
            )}
            {isVice && (
                <div className="absolute -bottom-1 -right-1 bg-slate-300 text-slate-800 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[7px]">VC</div>
            )}
        </div>
        
        <div className="flex-1 w-full min-w-0 flex flex-col items-center justify-center gap-1">
            <div className="text-sm leading-tight text-slate-900 dark:text-slate-100 w-full text-center truncate px-1">
                <span className="font-black">{player.cognome}</span> <span className="font-normal text-slate-600 dark:text-slate-400">{player.nome}</span>
            </div>
            
            <div className="flex items-center justify-center gap-2 w-full">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">{player.ruolo?.substring(0, 3)}</span>
                {isU35 && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 shadow-none font-bold">U35</Badge>}
                <div className="relative flex items-center justify-center h-5 w-5 text-slate-800 dark:text-slate-300">
                    <Shirt className={`h-4 w-4 fill-current opacity-20 ${player.ruolo === 'PORTIERE' ? 'text-black opacity-100' : ''}`} /> 
                    <span className={`absolute text-[9px] font-black leading-none pb-[1px] ${player.ruolo === 'PORTIERE' ? 'text-white' : 'text-foreground'}`}>{player.numero_maglia || '-'}</span>
                </div>
            </div>
        </div>
      </Card>
    </div>
  );
}

function DraggableFieldToken({ player, slotId, isBench = false, isMobile = false, captainId, viceCaptainId, jerseyColor }: { 
    player: any, slotId: string, isBench?: boolean, isMobile?: boolean, captainId: string | null, viceCaptainId: string | null, jerseyColor: string 
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `field-token-${slotId}`,
      data: { player, source: 'field', fromSlotId: slotId, isBench },
      disabled: isMobile
    });
  
    const style = transform ? {
      transform: CSS.Translate.toString(transform),
      zIndex: 9999,
    } : undefined;

    const isU35 = isU35Func(player.data_nascita);
    const isCaptain = captainId === player.id;
    const isVice = viceCaptainId === player.id;
    
    const isGk = player.ruolo === 'PORTIERE';
    const avatarRingColor = isGk ? 'ring-black' : (jerseyColor === 'ROSSA' ? 'ring-red-600' : 'ring-blue-600');
  
    if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`relative group z-20 ${!isMobile ? 'touch-none cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}>
            <div className="flex flex-col items-center">
                <div className="relative transition-transform hover:scale-110">
                    <Avatar className={`${isBench ? 'h-11 w-11' : 'h-16 w-16'} border-0 shadow-xl bg-white ring-4 ${avatarRingColor}`}>
                        <AvatarImage src={player.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-slate-900 text-white font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    {isU35 && (
                        <div className="absolute -top-1 -left-1 bg-blue-600 text-white text-[9px] font-black px-1.5 py-[1px] rounded-[4px] shadow-sm border border-white z-10">U35</div>
                    )}
                    {isCaptain && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-950 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-md z-10 font-black text-[10px]">C</div>
                    )}
                    {isVice && (
                        <div className="absolute -top-1 -right-1 bg-slate-300 text-slate-800 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-md z-10 font-black text-[9px]">VC</div>
                    )}
                </div>
                <div className={`mt-1 bg-slate-900/90 backdrop-blur-md text-white font-bold px-2 py-0.5 rounded-full shadow-lg truncate border border-white/20 leading-tight ${isBench ? 'text-[8px] max-w-[55px]' : 'text-[10px] max-w-[90px]'}`}>
                    {player.cognome}
                </div>
            </div>
        </div>
    )
}

function FormationSlot({ slot, playerInSlot, onRemove, onMobileClick, isBench = false, isMobile = false, captainId, viceCaptainId, jerseyColor, onSetRole }: { 
    slot: any, playerInSlot: any, onRemove: () => void, onMobileClick: () => void, isBench?: boolean, isMobile?: boolean, captainId: string | null, viceCaptainId: string | null, jerseyColor: string, onSetRole: (role: 'K' | 'VK' | null, id: string) => void 
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slot.id}`,
    data: { slotId: slot.id }
  });

  const baseStyle = isBench 
    ? "relative w-12 h-16 rounded-lg bg-black/5 border border-dashed border-slate-300 flex flex-col items-center justify-center shrink-0" 
    : "absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all duration-200 z-10";

  const displayRole = slot.id.replace(/[0-9]/g, '');

  return (
    <div 
        ref={isMobile ? null : setNodeRef}
        className={`${baseStyle} ${isOver && !isMobile ? 'scale-110 border-blue-500 bg-blue-500/20' : ''}`}
        style={!isBench ? { top: slot.top, left: slot.left } : {}}
        onClick={onMobileClick}
    >
        {playerInSlot ? (
            <div className="relative group">
                <Popover>
                    <PopoverTrigger asChild>
                        <div className="cursor-pointer">
                            <DraggableFieldToken 
                                player={playerInSlot} 
                                slotId={slot.id} 
                                isBench={isBench} 
                                isMobile={isMobile} 
                                captainId={captainId} 
                                viceCaptainId={viceCaptainId} 
                                jerseyColor={jerseyColor}
                            />
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-2">
                        <div className="grid gap-2">
                            <div className="font-bold text-xs border-b pb-1 text-center">{playerInSlot.cognome}</div>
                            <Button size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => onSetRole('K', playerInSlot.id)}>
                                <Crown className="mr-2 h-3 w-3 text-yellow-500" /> Capitano
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => onSetRole('VK', playerInSlot.id)}>
                                <Award className="mr-2 h-3 w-3 text-slate-500" /> Vice Cap.
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 justify-start text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onSetRole(null, playerInSlot.id)}>
                                <X className="mr-2 h-3 w-3" /> Rimuovi Ruoli
                            </Button>
                            <Button size="sm" variant="destructive" className="h-8 justify-start text-xs mt-1" onClick={onRemove}>
                                <Trash2 className="mr-2 h-3 w-3" /> Togli dal campo
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 h-5 w-5 flex items-center justify-center shadow-md z-50 transition-transform active:scale-95"
                    title="Rimuovi dal campo"
                >
                    <X className="h-3 w-3 stroke-[3]" />
                </button>
            </div>
        ) : (
            <div className={`${isBench ? 'h-10 w-10 rounded-lg' : 'h-14 w-14 rounded-full'} border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer ${isOver && !isMobile ? 'border-amber-400 bg-amber-400/30' : 'border-white/30 bg-white/5 hover:bg-white/10'}`}>
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
  
  const [captainId, setCaptainId] = useState<string | null>(null)
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null)
  const [jerseyColor, setJerseyColor] = useState<'BLU' | 'ROSSA'>('BLU')
  const [nextMatch, setNextMatch] = useState<any>(null)

  const [isManager, setIsManager] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [isMobile, setIsMobile] = useState(false)
  const [mobileSlotToFill, setMobileSlotToFill] = useState<string | null>(null)
  
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<any>(null)
  const [newPlayer, setNewPlayer] = useState({ nome: '', cognome: '', email: '', ruolo: 'DIFENSORE', numero_maglia: '', data_nascita: '' })

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }) 
  );

  const fieldRef = useRef<HTMLDivElement>(null)

  const supabaseBrowser = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  ), [])

  useEffect(() => {
    checkUserAndPermissions()
    getPlayers()
    fetchNextMatch()
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [supabaseBrowser]) 

  useEffect(() => {
      const currentPlayerIds = Object.values(lineup).map((p: any) => p.id);
      if (captainId && !currentPlayerIds.includes(captainId)) setCaptainId(null);
      if (viceCaptainId && !currentPlayerIds.includes(viceCaptainId)) setViceCaptainId(null);
  }, [lineup])

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

  async function checkUserAndPermissions() {
    const { data: { user } } = await supabaseBrowser.auth.getUser()
    if (user) {
        const { data: profile } = await supabaseBrowser.from('profiles').select('id, is_manager').eq('user_id', user.id).single()
        if (profile) {
            console.log("Current User:", profile.id, "Is Manager:", profile.is_manager);
            setCurrentUserId(profile.id)
            if (profile.is_manager) setIsManager(true)
        }
    }
  }

  async function getPlayers() {
    const { data } = await supabaseBrowser.from('profiles').select('*').order('cognome', { ascending: true })
    setPlayers(data || [])
    setLoading(false)
  }

  async function fetchNextMatch() {
      const now = new Date().toISOString()
      const { data } = await supabaseBrowser
        .from('events')
        .select('*')
        .eq('tipo', 'PARTITA')
        .gte('data_ora', now) 
        .order('data_ora', { ascending: true })
        .limit(1)
        .single()
      
      if(data) setNextMatch(data)
  }

  const downloadExcelDistinta = async () => {
    try {
        const response = await fetch('/distinta_template.xlsx');
        if (!response.ok) throw new Error("Template non trovato in public/");
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) return;

        const dateStr = nextMatch ? format(new Date(nextMatch.data_ora), 'dd/MM/yyyy', { locale: it }) : '';
        const timeStr = nextMatch ? format(new Date(nextMatch.data_ora), 'HH:mm') : '';
        
        if(nextMatch?.giornata) worksheet.getCell('C1').value = nextMatch.giornata;
        worksheet.getCell('E2').value = dateStr;
        worksheet.getCell('C2').value = timeStr;
        worksheet.getCell('H2').value = nextMatch?.luogo || '';

        if (nextMatch?.is_home !== false) { 
             worksheet.getCell('B6').value = "C. PAL. CHIGI";
             worksheet.getCell('H6').value = nextMatch?.avversario || "";
        } else {
             worksheet.getCell('B6').value = nextMatch?.avversario || "";
             worksheet.getCell('H6').value = "C. PAL. CHIGI";
        }

        const playersInLineup = Object.entries(lineup).map(([slotId, player]: [string, any]) => ({
            ...player,
            isBench: slotId.startsWith('P'),
            slotId
        }));

        const sortPlayers = (list: any[]) => list.sort((a,b) => {
            if(a.ruolo === 'PORTIERE') return -1;
            if(b.ruolo === 'PORTIERE') return 1;
            return (a.numero_maglia || 99) - (b.numero_maglia || 99);
        });

        const titolari = sortPlayers(playersInLineup.filter(p => !p.isBench));
        const riserve = sortPlayers(playersInLineup.filter(p => p.isBench));
        const allPlayers = [...titolari, ...riserve];

        let startRow = 9; 
        allPlayers.forEach((p, index) => {
            const row = worksheet.getRow(startRow + index);
            row.getCell(1).value = p.numero_maglia; 
            row.getCell(2).value = p.cognome.toUpperCase();
            row.getCell(3).value = p.nome;
            
            if (p.id === captainId) row.getCell(4).value = 'K';
            if (p.id === viceCaptainId) row.getCell(4).value = 'VK';

            row.getCell(5).value = p.isBench ? 'R' : 'T';

            if (isU35Func(p.data_nascita)) row.getCell(7).value = 'X'; 

            const dob = p.data_nascita ? format(new Date(p.data_nascita), 'dd/MM/yyyy') : '';
            row.getCell(8).value = `${p.tessera_asi || ''} ${dob}`; 
        });

        const staffMembers = players.filter(p => p.is_staff);
        
        if(staffMembers[0]) {
            worksheet.getCell('C29').value = `${staffMembers[0].cognome.toUpperCase()} ${staffMembers[0].nome}`;
            worksheet.getCell('I29').value = staffMembers[0].tessera_asi || '-';
        }
        if(staffMembers[1]) {
            worksheet.getCell('C30').value = `${staffMembers[1].cognome.toUpperCase()} ${staffMembers[1].nome}`;
            worksheet.getCell('I30').value = staffMembers[1].tessera_asi || '-';
        }
        if(staffMembers[2]) {
            worksheet.getCell('C31').value = `${staffMembers[2].cognome.toUpperCase()} ${staffMembers[2].nome}`;
            worksheet.getCell('I31').value = staffMembers[2].tessera_asi || '-';
        }

        const colorCell = worksheet.getCell('E33');
        if (colorCell) colorCell.value = jerseyColor === 'ROSSA' ? 'ROSSA' : 'BLU/AZZURRA';

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        saveAs(blob, `DISTINTA_CHIGI_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    } catch (e) {
        console.error(e);
        alert("Errore generazione Excel. Assicurati che 'distinta_template.xlsx' esista.");
    }
  }

  const handleSetRole = (role: 'K' | 'VK' | null, playerId: string) => {
      if (role === 'K') {
          setCaptainId(playerId);
          if (viceCaptainId === playerId) setViceCaptainId(null);
      } else if (role === 'VK') {
          setViceCaptainId(playerId);
          if (captainId === playerId) setCaptainId(null);
      } else {
          if (captainId === playerId) setCaptainId(null);
          if (viceCaptainId === playerId) setViceCaptainId(null);
      }
  }

  const handleAddPlayer = async () => {
      const { error } = await supabaseBrowser.from('profiles').insert([{ ...newPlayer, note_mediche: 'OK' }]);
      if(error) alert("Errore: " + error.message);
      else {
          setIsAddPlayerOpen(false);
          setNewPlayer({ nome: '', cognome: '', email: '', ruolo: 'DIFENSORE', numero_maglia: '', data_nascita: '' });
          getPlayers();
      }
  }

  const handleUpdatePlayer = async () => {
      if(!editingPlayer) return;
      const { error } = await supabaseBrowser.from('profiles').update({
          nome: editingPlayer.nome,
          cognome: editingPlayer.cognome,
          ruolo: editingPlayer.ruolo,
          numero_maglia: editingPlayer.numero_maglia,
          data_nascita: editingPlayer.data_nascita || null,
          note_mediche: editingPlayer.note_mediche,
          dipartimento: editingPlayer.dipartimento,
          taglia_divisa: editingPlayer.taglia_divisa,
          tags: editingPlayer.tags || [],
          tessera_asi: editingPlayer.tessera_asi,
          is_staff: editingPlayer.is_staff,
          is_manager: editingPlayer.is_manager
      }).eq('id', editingPlayer.id);

      if(error) alert("Errore: " + error.message);
      else {
          setEditingPlayer(null);
          getPlayers();
      }
  }

  const handleDeletePlayer = async (player: any) => {
      if(!player) return;
      const { error } = await supabaseBrowser.from('profiles').delete().eq('id', player.id);
      if(error) alert("Errore eliminazione: " + error.message);
      else {
          const newLineup = { ...lineup };
          Object.keys(newLineup).forEach(key => {
              if(newLineup[key].id === player.id) delete newLineup[key];
          });
          setLineup(newLineup);
          setEditingPlayer(null);
          getPlayers();
      }
  }

  const handleToggleTag = (tag: string) => {
      if (!editingPlayer) return;
      const currentTags = editingPlayer.tags || [];
      if (currentTags.includes(tag)) {
          setEditingPlayer({...editingPlayer, tags: currentTags.filter((t: string) => t !== tag)});
      } else {
          setEditingPlayer({...editingPlayer, tags: [...currentTags, tag]});
      }
  }

  const u35FieldCount = Object.keys(lineup)
    .filter(slotId => !slotId.startsWith('P') && slotId !== 'POR') 
    .reduce((acc, slotId) => acc + (isU35Func(lineup[slotId].data_nascita) ? 1 : 0), 0);

  const u35TotalCount = Object.values(lineup)
    .filter((p:any) => p.ruolo !== 'PORTIERE')
    .reduce((acc: number, p: any) => acc + (isU35Func(p.data_nascita) ? 1 : 0), 0);

  const isFieldU35LimitExceeded = u35FieldCount > 2;
  const isTotalU35LimitExceeded = u35TotalCount > 4;
  const isU35Warning = isFieldU35LimitExceeded || isTotalU35LimitExceeded;

  const handleModuleChange = (newModule: string) => {
      const oldLineup = { ...lineup };
      const newFormSlots = FORMATIONS[newModule];
      const newLineup: Record<string, any> = {};

      if (oldLineup['POR']) { newLineup['POR'] = oldLineup['POR']; delete oldLineup['POR']; }

      Object.keys(oldLineup).forEach(key => {
          if (key.startsWith('P')) { newLineup[key] = oldLineup[key]; delete oldLineup[key]; }
      });

      const remainingPlayers = Object.values(oldLineup);
      const remainingSlots = newFormSlots.filter((s:any) => s.id !== 'POR');

      remainingPlayers.forEach((player, index) => {
          if (index < remainingSlots.length) newLineup[remainingSlots[index].id] = player;
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

  const handleMobileSlotClick = (slotId: string) => {
      setMobileSlotToFill(slotId);
  }

  const handleMobilePlayerSelect = (player: any) => {
      if (mobileSlotToFill) {
          const existingSlot = Object.keys(lineup).find(key => lineup[key].id === player.id);
          const newLineup = { ...lineup };
          if (existingSlot) delete newLineup[existingSlot];
          
          newLineup[mobileSlotToFill] = player;
          setLineup(newLineup);
          setMobileSlotToFill(null);
      }
  }

  const removePlayerFromSlot = (slotId: string) => {
      setLineup(prev => { const n = {...prev}; delete n[slotId]; return n; })
      if(lineup[slotId]?.id === captainId) setCaptainId(null);
      if(lineup[slotId]?.id === viceCaptainId) setViceCaptainId(null);
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

  const sortedForMobile = [...filteredPlayers].sort((a, b) => {
      return a.cognome.localeCompare(b.cognome);
  });

  if(loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin" /></div>

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="container max-w-7xl mx-auto p-2 pb-24 lg:flex lg:gap-6 lg:items-start">
            
            <div className="flex-none lg:w-[55%] lg:sticky lg:top-20 space-y-3 z-10 bg-background pb-2 lg:pb-0">
                
                <div className="bg-card border rounded-lg p-2 flex flex-wrap items-center gap-2 shadow-sm relative h-14 mb-2">
                    
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-0.5 border border-slate-200">
                            <button 
                                onClick={() => setJerseyColor('BLU')}
                                className={`p-1.5 rounded-sm transition-all ${jerseyColor === 'BLU' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100'}`}
                                title="Maglia Blu"
                            >
                                <Shirt className="h-5 w-5 text-blue-600 fill-blue-600" />
                            </button>
                            <button 
                                onClick={() => setJerseyColor('ROSSA')}
                                className={`p-1.5 rounded-sm transition-all ${jerseyColor === 'ROSSA' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100'}`}
                                title="Maglia Rossa"
                            >
                                <Shirt className="h-5 w-5 text-red-600 fill-red-600" />
                            </button>
                        </div>

                        <Select value={module} onValueChange={handleModuleChange}>
                            <SelectTrigger className="w-[90px] h-9 text-xs font-bold border-border bg-background"><SelectValue placeholder="Modulo" /></SelectTrigger>
                            <SelectContent>{Object.keys(FORMATIONS).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>

                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black border transition-colors whitespace-nowrap ${isU35Warning ? 'bg-red-100 text-red-600 border-red-300 animate-pulse' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                           {isU35Warning ? <AlertCircle className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-blue-500"></span>}
                           U35: Campo {u35FieldCount}/2, Tot {u35TotalCount}/4
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="destructive" size="icon" onClick={() => { setLineup({}); setCaptainId(null); setViceCaptainId(null); }} className="h-9 w-9 rounded-md shadow-sm"><Trash2 className="h-4 w-4" /></Button>
                        <Button onClick={downloadImage} size="icon" className="h-9 w-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm" title="Scarica immagine"><Download className="h-4 w-4" /></Button>
                        <Button onClick={downloadExcelDistinta} size="icon" className="h-9 w-9 rounded-md bg-green-600 hover:bg-green-700 text-white shadow-sm" title="Scarica distinta Excel"><FileSpreadsheet className="h-4 w-4" /></Button>
                    </div>
                </div>

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
                                onMobileClick={() => handleMobileSlotClick(slot.id)}
                                isMobile={isMobile}
                                captainId={captainId}
                                viceCaptainId={viceCaptainId}
                                jerseyColor={jerseyColor}
                                onSetRole={handleSetRole}
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
                                onMobileClick={() => handleMobileSlotClick(slot.id)}
                                isBench={true}
                                isMobile={isMobile}
                                captainId={captainId}
                                viceCaptainId={viceCaptainId}
                                jerseyColor={jerseyColor}
                                onSetRole={handleSetRole}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-0">
                
                <div className="bg-card border rounded-lg p-2 shadow-sm space-y-2 shrink-0">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input placeholder="Cerca giocatore..." className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus:bg-background" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        
                        {isManager && (
                            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
                                <DialogTrigger asChild>
                                    <Button size="icon" className="h-8 w-8 rounded-md bg-purple-600 hover:bg-purple-700 shadow"><Plus className="h-4 w-4 text-white" /></Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-sm rounded-xl">
                                    <DialogHeader><DialogTitle>Nuovo Giocatore</DialogTitle></DialogHeader>
                                    <div className="grid gap-3 py-2">
                                        <Input placeholder="Nome" value={newPlayer.nome} onChange={(e) => setNewPlayer({...newPlayer, nome: e.target.value})} />
                                        <Input placeholder="Cognome" value={newPlayer.cognome} onChange={(e) => setNewPlayer({...newPlayer, cognome: e.target.value})} />
                                        <Input placeholder="Email (per login)" value={newPlayer.email} onChange={(e) => setNewPlayer({...newPlayer, email: e.target.value})} />
                                        <Select value={newPlayer.ruolo} onValueChange={(val) => setNewPlayer({...newPlayer, ruolo: val})}>
                                            <SelectTrigger><SelectValue placeholder="Ruolo" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PORTIERE">Portiere</SelectItem>
                                                <SelectItem value="DIFENSORE">Difensore</SelectItem>
                                                <SelectItem value="CENTROCAMPISTA">Centrocampista</SelectItem>
                                                <SelectItem value="ATTACCANTE">Attaccante</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <DialogFooter><Button onClick={handleAddPlayer} className="w-full bg-purple-600">Salva</Button></DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                    
                    <div className="flex bg-muted p-0.5 rounded-md">
                        {['ALL', 'OK', 'KO'].map(status => (
                            <button key={status} onClick={() => setFilterStatus(status as any)} className={`flex-1 py-1 rounded-sm text-[9px] font-bold transition-all ${filterStatus === status ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}>
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
                                isManager={isManager}
                                currentUserId={currentUserId}
                                onEditPlayer={setEditingPlayer}
                                isMobile={isMobile}
                                captainId={captainId}
                                viceCaptainId={viceCaptainId}
                                onSetRole={handleSetRole}
                                onDeletePlayer={handleDeletePlayer}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <Dialog open={!!editingPlayer} onOpenChange={(open) => !open && setEditingPlayer(null)}>
                <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden bg-card">
                    <DialogTitle className="sr-only">Modifica {editingPlayer?.cognome}</DialogTitle>
                    {editingPlayer && (
                        <>
                            {/* Header Modifica */}
                            <div className="bg-slate-50 dark:bg-slate-900 p-6 pb-4 border-b relative">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                                        <AvatarImage src={editingPlayer.avatar_url} className="object-cover"/>
                                        <AvatarFallback className="text-xl font-bold">{editingPlayer.cognome[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-2 flex-1">
                                        <Input 
                                            value={editingPlayer.cognome} 
                                            onChange={(e) => setEditingPlayer({...editingPlayer, cognome: e.target.value})} 
                                            className="text-xl font-black h-9" placeholder="Cognome"
                                        />
                                        <Input 
                                            value={editingPlayer.nome} 
                                            onChange={(e) => setEditingPlayer({...editingPlayer, nome: e.target.value})} 
                                            className="font-medium h-8" placeholder="Nome"
                                        />
                                        <Select value={editingPlayer.ruolo} onValueChange={(val) => setEditingPlayer({...editingPlayer, ruolo: val})}>
                                            <SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PORTIERE">Portiere</SelectItem>
                                                <SelectItem value="DIFENSORE">Difensore</SelectItem>
                                                <SelectItem value="CENTROCAMPISTA">Centrocampista</SelectItem>
                                                <SelectItem value="ATTACCANTE">Attaccante</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input 
                                            value={editingPlayer.email} 
                                            onChange={(e) => setEditingPlayer({...editingPlayer, email: e.target.value})}
                                            disabled={!isManager && editingPlayer.id !== currentUserId}
                                            className="h-7 text-xs" placeholder="Email"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                                    
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Tessera ASI</Label>
                                        <Input value={editingPlayer.tessera_asi || ''} onChange={(e) => setEditingPlayer({...editingPlayer, tessera_asi: e.target.value})} />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Data di Nascita</Label>
                                        <Input type="date" value={editingPlayer.data_nascita || ''} onChange={(e) => setEditingPlayer({...editingPlayer, data_nascita: e.target.value})} />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Maglia</Label>
                                        <Input type="number" value={editingPlayer.numero_maglia || ''} onChange={(e) => setEditingPlayer({...editingPlayer, numero_maglia: e.target.value})} />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Taglia</Label>
                                        <Input value={editingPlayer.taglia_divisa || ''} onChange={(e) => setEditingPlayer({...editingPlayer, taglia_divisa: e.target.value})} />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Note Mediche / Infermeria</Label>
                                    <Input 
                                        placeholder="OK oppure descrivi infortunio..." 
                                        value={editingPlayer.note_mediche || ''} 
                                        onChange={(e) => setEditingPlayer({...editingPlayer, note_mediche: e.target.value})}
                                        className={editingPlayer.note_mediche && editingPlayer.note_mediche !== 'OK' ? 'border-red-300 bg-red-50 text-red-900' : 'border-green-300 bg-green-50 text-green-900'}
                                    />
                                </div>

                                <div className="pt-4 border-t space-y-5">
                                    
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Dipartimento</Label>
                                        <Input value={editingPlayer.dipartimento || ''} onChange={(e) => setEditingPlayer({...editingPlayer, dipartimento: e.target.value})} />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Caratteristiche Bomber</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {BOMBER_TAGS.map((tag) => {
                                                const isActive = (editingPlayer.tags || []).includes(tag);
                                                return (
                                                    <Badge 
                                                        key={tag} 
                                                        variant={isActive ? "default" : "outline"}
                                                        className={`cursor-pointer transition-all ${isActive ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-100'}`}
                                                        onClick={() => handleToggleTag(tag)}
                                                    >
                                                        {tag}
                                                    </Badge>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {isManager && (
                                        <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-100 space-y-3 mt-4">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="h-4 w-4 text-purple-700" />
                                                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Permessi avanzati</span>
                                            </div>
                                            
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="edit-is-staff" className="text-xs font-medium cursor-pointer">Staff</Label>
                                                <Switch 
                                                    id="edit-is-staff"
                                                    checked={editingPlayer.is_staff || false} 
                                                    onCheckedChange={(checked) => setEditingPlayer({...editingPlayer, is_staff: checked})}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="edit-is-manager" className="text-xs font-medium cursor-pointer">Gestore</Label>
                                                <Switch 
                                                    id="edit-is-manager"
                                                    checked={editingPlayer.is_manager || false} 
                                                    onCheckedChange={(checked) => setEditingPlayer({...editingPlayer, is_manager: checked})}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <DialogFooter className="p-4 border-t bg-slate-50 dark:bg-slate-900 flex gap-2">
                                <Button variant="outline" onClick={() => setEditingPlayer(null)} className="flex-1">Annulla</Button>
                                <Button onClick={handleUpdatePlayer} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">Salva</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!mobileSlotToFill} onOpenChange={(open) => !open && setMobileSlotToFill(null)}>
                <DialogContent className="max-w-sm rounded-xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Seleziona Giocatore</DialogTitle>
                        <DialogDescription>Tocca per inserire nel campo</DialogDescription>
                    </DialogHeader>
                    
                    <div className="overflow-y-auto pr-2 custom-scrollbar space-y-2 flex-1">
                        {sortedForMobile.map(p => {
                            const isSelected = isPlayerSelected(p.id);
                            const isU35 = isU35Func(p.data_nascita);
                            const isInjured = p.note_mediche && p.note_mediche !== 'OK';

                            return (
                                <div 
                                    key={p.id} 
                                    onClick={() => !isSelected && handleMobilePlayerSelect(p)}
                                    className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${isSelected ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={p.avatar_url} />
                                        <AvatarFallback>{p.cognome[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`font-bold text-sm ${isInjured ? 'text-red-600' : ''}`}>{p.cognome} {p.nome}</p>
                                            {isU35 && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 border-0">U35</Badge>}
                                            {isInjured && <Ambulance className="h-3 w-3 text-red-600" />}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">{p.ruolo}</p>
                                    </div>
                                    {isSelected ? <Badge variant="secondary" className="text-[9px]">IN CAMPO</Badge> : <Plus className="h-4 w-4 text-primary" />}
                                </div>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>

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