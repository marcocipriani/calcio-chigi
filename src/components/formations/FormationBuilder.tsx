"use client"

import { useCallback, useState, useEffect, useId, useRef } from "react"
import { supabaseBrowser } from '@/lib/supabaseBrowser'
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
import { format } from "date-fns"
import { it } from 'date-fns/locale'
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Download, X, Ambulance, UserPlus, Shirt, Info, Trash2, CreditCard, Ruler, Calendar, Plus, Crown, Award, FileSpreadsheet, Users, Image as ImageIcon, Copy, Send } from "lucide-react"
import Image from "next/image"

import { FORMATIONS } from "@/lib/constants"
import { Event, FullProfile } from "@/lib/types"
import { fetchNextChigiMatch, fetchPublicFormationRoster, fetchRosterForEvent } from "@/lib/api"
import { useAppSession } from "@/components/auth/AppSessionProvider"
import { copyOfficialFormationMessage } from "@/lib/formationClipboard"
import { buildOfficialFormationMessage, buildPersonalFormationMessage, isFormationBenchSlot } from "@/lib/formations"
import { getAge, isU35 } from "@/lib/utils"

type Player = FullProfile & { training_only?: boolean }

type FormationSlotDef = { id: string; top?: string; left?: string };

const BENCH_SLOTS = Array.from({ length: 9 }, (_, i) => ({ id: `P${i + 1}` }));
const FORMATION_IMAGE_PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function DraggableListCard({ player, isSelected, isMobile, captainId, viceCaptainId, onSetRole, showOfficialControls }: {
    player: Player, isSelected: boolean, isMobile: boolean, captainId: string | null, viceCaptainId: string | null, onSetRole: (role: 'K' | 'VK' | null, id: string) => void, showOfficialControls: boolean
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

    const under35 = isU35(player.data_nascita ?? '');
    const isInjured = player.note_mediche && player.note_mediche !== 'OK';
    const formattedDob = player.data_nascita ? format(new Date(player.data_nascita), 'dd/MM/yy', { locale: it }) : 'N.D.';
    const isCaptain = captainId === player.id;
    const isVice = viceCaptainId === player.id;
    const playerTags = player.tags || [];

    if (isDragging) return <div ref={setNodeRef} style={style} className="opacity-0" />;

    return (
        <div ref={setNodeRef} style={style} className={`h-full relative group ${isSelected ? 'opacity-40 grayscale' : ''}`}>
            {showOfficialControls && <Dialog>
                <DialogTrigger asChild>
                    <Button aria-label={`Dettagli di ${player.nome} ${player.cognome}`} variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 z-20 text-slate-600 hover:text-primary hover:bg-slate-100/50 rounded-full dark:text-slate-300" onClick={(e) => e.stopPropagation()} >
                        <Info aria-hidden="true" className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden bg-card">
                    <DialogTitle className="sr-only">Dettagli di {player.cognome}</DialogTitle>
                    <div className="bg-slate-50 dark:bg-slate-900 p-6 pb-4 border-b relative">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                                <AvatarImage src={player.avatar_url ?? undefined} alt={`${player.nome} ${player.cognome}`} className="object-cover" />
                                <AvatarFallback className="text-xl font-bold">{player.cognome[0]}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                                <h2 className="text-2xl font-black leading-none">{player.cognome}</h2>
                                <p className="text-lg font-medium text-muted-foreground">{player.nome}</p>
                                <Badge variant="outline" className="bg-background text-xs font-bold mr-2">{player.ruolo}</Badge>
                            </div>
                        </div>
                    </div>
                    <div className="p-6 pt-4 space-y-5">
                        <div className="flex gap-2">
                            <Button size="sm" variant={isCaptain ? "default" : "outline"} className={`flex-1 gap-2 font-bold h-8 ${isCaptain ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-950 border-yellow-500' : ''}`} onClick={() => onSetRole(isCaptain ? null : 'K', player.id)}><Crown className="h-4 w-4" /> {isCaptain ? 'Capitano' : 'Capitano'}</Button>
                            <Button size="sm" variant={isVice ? "default" : "outline"} className={`flex-1 gap-2 font-bold h-8 ${isVice ? 'bg-slate-700 hover:bg-slate-800 text-white' : ''}`} onClick={() => onSetRole(isVice ? null : 'VK', player.id)}><Award className="h-4 w-4" /> {isVice ? 'Vice Capitano' : 'Vice Capitano'}</Button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                            <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Data di Nascita</Label><div className="flex items-center gap-2 font-bold"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {formattedDob}</div><span className="text-xs text-muted-foreground">({getAge(player.data_nascita ?? '')} anni)</span></div>
                            <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Tessera ASI</Label><div className="flex items-center gap-2 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded w-fit"><CreditCard className="h-3 w-3" /> {player.tessera_asi || 'N/A'}</div></div>
                            <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Maglia</Label><div className="flex items-center gap-2 font-black text-lg"><Shirt className="h-4 w-4 text-muted-foreground" /> {player.numero_maglia || '-'}</div></div>
                            <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Taglia</Label><div className="flex items-center gap-2 font-bold"><Ruler className="h-3.5 w-3.5 text-muted-foreground" /> {player.taglia_divisa || '-'}</div></div>
                        </div>
                        <div className={`p-3 rounded-lg border flex items-start gap-3 ${isInjured ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                            {isInjured ? <Ambulance className="h-5 w-5 mt-0.5" /> : <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center font-bold text-xs">OK</div>}
                            <div className="flex-1"><p className="text-xs font-bold uppercase tracking-wide mb-0.5">{isInjured ? 'Infermeria' : 'Stato fisico'}</p><p className="text-sm font-medium">{player.note_mediche && player.note_mediche !== 'OK' ? player.note_mediche : 'Giocatore disponibile'}</p></div>
                        </div>
                        <div className="pt-4 border-t space-y-5">
                            <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Dipartimento</Label><Input value={player.dipartimento || ''} readOnly className="bg-slate-50 border-0 h-8 font-medium" /></div>
                            <div className="space-y-2"><Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Caratteristiche</Label>{playerTags.length > 0 ? (<div className="flex flex-wrap gap-2">{playerTags.map((tag: string) => (<Badge key={tag} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">{tag}</Badge>))}</div>) : (<p className="text-xs text-muted-foreground italic">Nessuna caratteristica selezionata</p>)}</div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>}
            <Card
                {...listeners} {...attributes}
                className={`flex flex-col items-center justify-center p-3 gap-2 cursor-grab active:cursor-grabbing transition-[border-color,box-shadow,opacity,filter] h-full hover:shadow-md border select-none
        ${!isMobile ? 'touch-none' : ''} ${isInjured ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'}
        ${under35 && !isInjured ? 'border-l-4 border-l-blue-500' : ''}
      `}>
                <div className="relative shrink-0">
                    <Avatar className="h-12 w-12 border-2 border-slate-100 shadow-sm">
                        <AvatarImage src={player.avatar_url ?? undefined} alt={`${player.nome} ${player.cognome}`} className="object-cover" /><AvatarFallback className="font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    {isInjured && (<div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-red-100 z-10"><Ambulance className="h-3.5 w-3.5 text-red-600 animate-pulse" /></div>)}
                    {isCaptain && (<div className="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-950 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[9px]">C</div>)}
                    {isVice && (<div className="absolute -bottom-1 -right-1 bg-slate-300 text-slate-800 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 font-black text-[7px]">VC</div>)}
                </div>
                <div className="flex-1 w-full min-w-0 flex flex-col items-center justify-center gap-1">
                    <div className="text-sm leading-tight text-slate-900 dark:text-slate-100 w-full text-center truncate px-1"><span className="font-black">{player.cognome}</span> <span className="font-normal text-slate-600 dark:text-slate-400">{player.nome}</span></div>
                    <div className="flex items-center justify-center gap-2 w-full"><span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">{player.ruolo?.substring(0, 3)}</span>{under35 && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 shadow-none font-bold">U35</Badge>}<div className="relative flex items-center justify-center h-5 w-5 text-slate-800 dark:text-slate-300"><Shirt className={`h-4 w-4 fill-current opacity-20 ${player.ruolo === 'PORTIERE' ? 'text-black opacity-100' : ''}`} /> <span className={`absolute text-[9px] font-black leading-none pb-[1px] ${player.ruolo === 'PORTIERE' ? 'text-white' : 'text-foreground'}`}>{player.numero_maglia || '-'}</span></div></div>
                </div>
            </Card>
        </div>
    );
}

function DraggableFieldToken({ player, slotId, isBench = false, isMobile = false, captainId, viceCaptainId, jerseyColor }: { player: Player, slotId: string, isBench?: boolean, isMobile?: boolean, captainId: string | null, viceCaptainId: string | null, jerseyColor: string }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `field-token-${slotId}`, data: { player, source: 'field', fromSlotId: slotId, isBench }, disabled: isMobile });
    const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: 9999 } : undefined;
    const under35 = isU35(player.data_nascita ?? '');
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
                        <AvatarImage src={player.avatar_url ?? undefined} alt={`${player.nome} ${player.cognome}`} className="object-cover" />
                        <AvatarFallback className="bg-slate-900 text-white font-bold text-xs">{player.nome[0]}{player.cognome[0]}</AvatarFallback>
                    </Avatar>
                    {under35 && (<div className="absolute -top-1 -left-1 bg-blue-600 text-white text-[9px] font-black px-1.5 py-[1px] rounded-[4px] shadow-sm border border-white z-10">U35</div>)}
                    {isCaptain && (<div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-950 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-md z-10 font-black text-[10px]">C</div>)}
                    {isVice && (<div className="absolute -top-1 -right-1 bg-slate-300 text-slate-800 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-md z-10 font-black text-[9px]">VC</div>)}
                </div>
                <div className={`mt-1 bg-slate-900/90 backdrop-blur-md text-white font-bold px-2 py-0.5 rounded-full shadow-lg truncate border border-white/20 leading-tight ${isBench ? 'text-[8px] max-w-[55px]' : 'text-[10px] max-w-[90px]'}`}>{player.cognome}</div>
            </div>
        </div>
    )
}

function FormationSlot({ slot, playerInSlot, onRemove, onMobileClick, isBench = false, isMobile = false, captainId, viceCaptainId, jerseyColor, onSetRole, showOfficialControls }: { slot: FormationSlotDef, playerInSlot: Player | null, onRemove: () => void, onMobileClick: () => void, isBench?: boolean, isMobile?: boolean, captainId: string | null, viceCaptainId: string | null, jerseyColor: string, onSetRole: (role: 'K' | 'VK' | null, id: string) => void, showOfficialControls: boolean }) {
    const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot.id}`, data: { slotId: slot.id } });
    const baseStyle = isBench ? "relative w-12 h-16 rounded-lg bg-black/5 border border-dashed border-slate-300 flex flex-col items-center justify-center shrink-0" : "absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-[transform,border-color,background-color] duration-200 z-10";
    const displayRole = slot.id.replace(/[0-9]/g, '');
    const emptySlotClassName = `${isBench ? 'h-10 w-10 rounded-lg' : 'h-14 w-14 rounded-full'} border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer ${isOver && !isMobile ? 'border-amber-400 bg-amber-400/30' : 'border-white/30 bg-white/5 hover:bg-white/10'}`;
    return (
        <div ref={isMobile ? null : setNodeRef} className={`${baseStyle} ${isOver && !isMobile ? 'scale-110 border-blue-500 bg-blue-500/20' : ''}`} style={!isBench ? { top: slot.top, left: slot.left } : {}} onClick={isMobile && playerInSlot ? onMobileClick : undefined}>
            {playerInSlot ? (
                <div className="relative group">
                    <Popover>
                        <PopoverTrigger asChild>
                            <div className="cursor-pointer">
                                <DraggableFieldToken player={playerInSlot} slotId={slot.id} isBench={isBench} isMobile={isMobile} captainId={captainId} viceCaptainId={viceCaptainId} jerseyColor={jerseyColor} />
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-2">
                            <div className="grid gap-2">
                                <div className="font-bold text-xs border-b pb-1 text-center">{playerInSlot.cognome}</div>
                                {showOfficialControls && <>
                                    <Button size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => onSetRole('K', playerInSlot.id)}><Crown className="mr-2 h-3 w-3 text-yellow-500" /> Capitano</Button>
                                    <Button size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => onSetRole('VK', playerInSlot.id)}><Award className="mr-2 h-3 w-3 text-slate-500" /> Vice Cap.</Button>
                                    <Button size="sm" variant="ghost" className="h-8 justify-start text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onSetRole(null, playerInSlot.id)}><X className="mr-2 h-3 w-3" /> Rimuovi Ruoli</Button>
                                </>}
                                <Button size="sm" variant="destructive" className="h-8 justify-start text-xs mt-1" onClick={onRemove}><Trash2 className="mr-2 h-3 w-3" /> Togli dal campo</Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <button aria-label={`Rimuovi ${playerInSlot.nome} ${playerInSlot.cognome} dal campo`} onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute -top-2 -right-2 bg-red-700 hover:bg-red-800 text-white rounded-full p-1 h-5 w-5 flex items-center justify-center shadow-md z-50 transition-transform active:scale-95" type="button"><X aria-hidden="true" className="h-3 w-3 stroke-[3]" /></button>
                </div>
            ) : (
                isMobile ? (
                    <button
                        aria-label={`Seleziona giocatore per ${slot.id}`}
                        className={emptySlotClassName}
                        onClick={onMobileClick}
                        type="button"
                    >
                        {isBench ? <UserPlus aria-hidden="true" className="h-4 w-4 text-slate-300" /> : <span className="text-[10px] font-black text-white/40 tracking-wider">{displayRole}</span>}
                    </button>
                ) : (
                    <div className={emptySlotClassName}>
                        {isBench ? <UserPlus className="h-4 w-4 text-slate-300" /> : <span className="text-[10px] font-black text-white/40 tracking-wider">{displayRole}</span>}
                    </div>
                )
            )}
        </div>
    )
}

export type FormationBuilderMode = "PLAYGROUND" | "OFFICIAL"

export function FormationBuilder({
    mode,
    onPublished,
}: {
    mode: FormationBuilderMode
    onPublished?: () => void | Promise<void>
}): React.JSX.Element {
    const { isManager, profile } = useAppSession()
    const [players, setPlayers] = useState<Player[]>([])
    const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([])
    const [module, setModule] = useState("4-4-2")
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [lineup, setLineup] = useState<Record<string, Player>>({})
    const [activePlayer, setActivePlayer] = useState<Player | null>(null)
    const [captainId, setCaptainId] = useState<string | null>(null)
    const [viceCaptainId, setViceCaptainId] = useState<string | null>(null)
    const [jerseyColor, setJerseyColor] = useState<'BLU' | 'ROSSA'>('BLU')
    const [nextMatch, setNextMatch] = useState<Event | null>(null)
    const [isMobile, setIsMobile] = useState(false)
    const [mobileSlotToFill, setMobileSlotToFill] = useState<string | null>(null)


    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 10 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
    const fieldRef = useRef<HTMLDivElement>(null)
    const officialRoleRequirementId = useId()

    const loadFormationContext = useCallback(async function loadFormationContext() {
        setLoading(true)
        try {
            if (mode === "PLAYGROUND") {
                setNextMatch(null)
                setPlayers(await fetchPublicFormationRoster(supabaseBrowser))
            } else {
                const match = await fetchNextChigiMatch(supabaseBrowser)
                setNextMatch(match)
                setPlayers(match ? await fetchRosterForEvent(supabaseBrowser, match.id) : [])
            }
            setLoadError(null)
        } catch (error) {
            setPlayers([])
            setLoadError(error instanceof Error ? error.message : "Rosa non disponibile")
        } finally {
            setLoading(false)
        }
    }, [mode])

    useEffect(() => {
        void loadFormationContext()
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [loadFormationContext])

    useEffect(() => {
        const currentPlayerIds = Object.values(lineup).map((p) => p.id);
        if (captainId && !currentPlayerIds.includes(captainId)) setCaptainId(null);
        if (viceCaptainId && !currentPlayerIds.includes(viceCaptainId)) setViceCaptainId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineup])

    useEffect(() => {
        let result = players.filter((player) => !player.is_staff && !player.training_only);
        const lowerTerm = searchTerm.toLowerCase();
        if (lowerTerm) result = result.filter(p => p.nome?.toLowerCase().includes(lowerTerm) || p.cognome?.toLowerCase().includes(lowerTerm));
        setFilteredPlayers(result);
    }, [searchTerm, players]);

    const downloadExcelDistinta = async () => {
        try {
            const response = await fetch('/distinta_template.xlsx');
            if (!response.ok) throw new Error("Template non trovato in public/");
            const arrayBuffer = await response.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) return;

            const dateStr = nextMatch?.data_ora ? format(new Date(nextMatch.data_ora), 'dd/MM/yyyy', { locale: it }) : '';
            const timeStr = nextMatch?.data_ora ? format(new Date(nextMatch.data_ora), 'HH:mm') : '';
            if (nextMatch?.giornata) worksheet.getCell('C1').value = nextMatch.giornata;
            worksheet.getCell('E2').value = dateStr;
            worksheet.getCell('C2').value = timeStr;
            worksheet.getCell('H2').value = nextMatch?.luogo || '';

            const isHome = nextMatch?.squadra_casa?.toUpperCase().includes('CHIGI') ?? true;
            if (isHome) { worksheet.getCell('B6').value = "C. PAL. CHIGI"; worksheet.getCell('H6').value = nextMatch?.avversario || ""; }
            else { worksheet.getCell('B6').value = nextMatch?.avversario || ""; worksheet.getCell('H6').value = "C. PAL. CHIGI"; }

            const playersInLineup = Object.entries(lineup).map(([slotId, player]) => ({ ...player, isBench: isFormationBenchSlot(slotId), slotId }));
            const sortPlayers = (list: (Player & { isBench: boolean; slotId: string })[]) => list.sort((a, b) => {
                if (a.ruolo === 'PORTIERE' && b.ruolo !== 'PORTIERE') return -1;
                if (b.ruolo === 'PORTIERE' && a.ruolo !== 'PORTIERE') return 1;
                return (a.numero_maglia || 99) - (b.numero_maglia || 99);
            });
            const titolari = sortPlayers(playersInLineup.filter(p => !p.isBench));
            const riserve = sortPlayers(playersInLineup.filter(p => p.isBench));
            const allPlayers = [...titolari, ...riserve];

            const startRow = 9;
            for (let i = 0; i < 30; i++) {
                const r = worksheet.getRow(startRow + i);
                [1, 2, 3, 4, 5, 7, 8].forEach(c => r.getCell(c).value = null);
            }

            allPlayers.forEach((p, index) => {
                const row = worksheet.getRow(startRow + index);
                row.getCell(1).value = p.numero_maglia;
                row.getCell(2).value = p.cognome.toUpperCase();
                row.getCell(3).value = p.nome;
                if (p.id === captainId) row.getCell(4).value = 'K';
                if (p.id === viceCaptainId) row.getCell(4).value = 'VK';
                row.getCell(5).value = index < titolari.length ? 'T' : 'R';
                if (isU35(p.data_nascita ?? '')) row.getCell(7).value = 'X';
                const dob = p.data_nascita ? format(new Date(p.data_nascita), 'dd/MM/yyyy') : '';
                row.getCell(8).value = `${p.tessera_asi || ''} ${dob}`;
            });

            ['C29', 'I29', 'C30', 'I30', 'C31', 'I31'].forEach(cell => worksheet.getCell(cell).value = null);
            const staffMembers = players.filter(p => p.is_staff);
            if (staffMembers[0]) { worksheet.getCell('C29').value = `${staffMembers[0].cognome.toUpperCase()} ${staffMembers[0].nome}`; worksheet.getCell('I29').value = staffMembers[0].tessera_asi || '-'; }
            if (staffMembers[1]) { worksheet.getCell('C30').value = `${staffMembers[1].cognome.toUpperCase()} ${staffMembers[1].nome}`; worksheet.getCell('I30').value = staffMembers[1].tessera_asi || '-'; }
            if (staffMembers[2]) { worksheet.getCell('C31').value = `${staffMembers[2].cognome.toUpperCase()} ${staffMembers[2].nome}`; worksheet.getCell('I31').value = staffMembers[2].tessera_asi || '-'; }

            const colorCell = worksheet.getCell('E33');
            if (colorCell) colorCell.value = jerseyColor === 'ROSSA' ? 'ROSSA' : 'BLU/AZZURRA';

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            saveAs(blob, `DISTINTA_CHIGI_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } catch (e) { console.error(e); toast.error("Errore generazione Excel. Assicurati che 'distinta_template.xlsx' esista in public/."); }
    }

    const handleSetRole = (role: 'K' | 'VK' | null, playerId: string) => {
        if (role === 'K') { setCaptainId(playerId); if (viceCaptainId === playerId) setViceCaptainId(null); }
        else if (role === 'VK') { setViceCaptainId(playerId); if (captainId === playerId) setCaptainId(null); }
        else { if (captainId === playerId) setCaptainId(null); if (viceCaptainId === playerId) setViceCaptainId(null); }
    }

    const u35FieldCount = Object.keys(lineup).filter(slotId => !isFormationBenchSlot(slotId) && slotId !== 'POR').reduce((acc, slotId) => acc + (isU35(lineup[slotId].data_nascita ?? '') ? 1 : 0), 0);
    const u35TotalCount = Object.values(lineup).filter((p) => p.ruolo !== 'PORTIERE').reduce((acc, p) => acc + (isU35(p.data_nascita ?? '') ? 1 : 0), 0);
    const isFieldU35LimitExceeded = u35FieldCount > 2;
    const isTotalU35LimitExceeded = u35TotalCount > 4;
    const isU35Warning = isFieldU35LimitExceeded || isTotalU35LimitExceeded;

    const handleModuleChange = (newModule: string) => {
        const oldLineup = { ...lineup };
        const newFormSlots = FORMATIONS[newModule];
        const newLineup: Record<string, Player> = {};
        if (oldLineup['POR']) { newLineup['POR'] = oldLineup['POR']; delete oldLineup['POR']; }
        Object.keys(oldLineup).forEach(key => { if (isFormationBenchSlot(key)) { newLineup[key] = oldLineup[key]; delete oldLineup[key]; } });
        const remainingPlayers = Object.values(oldLineup);
        const remainingSlots = (newFormSlots as FormationSlotDef[]).filter((s) => s.id !== 'POR');
        remainingPlayers.forEach((player, index) => { if (index < remainingSlots.length) newLineup[remainingSlots[index].id] = player; });
        setModule(newModule);
        setLineup(newLineup);
    }

    const handleDragStart = (event: DragStartEvent) => { setActivePlayer(event.active.data.current?.player); }
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActivePlayer(null);
        if (!over) return;
        if (over.id.toString().startsWith('slot-')) {
            const targetSlotId = over.data.current?.slotId;
            const player = active.data.current?.player;
            const source = active.data.current?.source;
            const playerInTarget = lineup[targetSlotId];
            if (source === 'list') { setLineup(prev => ({ ...prev, [targetSlotId]: player })); }
            else if (source === 'field') {
                const sourceSlotId = active.data.current?.fromSlotId;
                setLineup(prev => {
                    const newState = { ...prev };
                    if (playerInTarget) { newState[targetSlotId] = player; newState[sourceSlotId] = playerInTarget; }
                    else { delete newState[sourceSlotId]; newState[targetSlotId] = player; }
                    return newState;
                });
            }
        }
    }

    const handleMobileSlotClick = (slotId: string) => { setMobileSlotToFill(slotId); }
    const handleMobilePlayerSelect = (player: Player) => {
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
        setLineup(prev => { const n = { ...prev }; delete n[slotId]; return n; })
        if (lineup[slotId]?.id === captainId) setCaptainId(null);
        if (lineup[slotId]?.id === viceCaptainId) setViceCaptainId(null);
    }

    const isPlayerSelected = (playerId: string) => Object.values(lineup).some((p) => p.id === playerId);

    const downloadImage = async () => {
        if (fieldRef.current) {
            try {
                const timestamp = format(new Date(), 'yyyy-MM-dd-HH-mm');
                const dataUrl = await toPng(fieldRef.current, {
                    cacheBust: true,
                    imagePlaceholder: FORMATION_IMAGE_PLACEHOLDER,
                    pixelRatio: 2,
                });
                const link = document.createElement('a');
                link.download = `circolo-chigi-formazione-${timestamp}.png`;
                link.href = dataUrl;
                link.click();
            } catch (err) {
                console.error("Errore salvataggio", err);
                toast.error("Impossibile scaricare la formazione");
            }
        }
    }

    const copyPersonalFormation = async () => {
        const message = buildPersonalFormationMessage(
            module,
            jerseyColor,
            Object.entries(lineup).map(([positionKey, player]) => ({
                positionKey,
                nome: player.nome,
                cognome: player.cognome,
            })),
        )
        try {
            await navigator.clipboard.writeText(message)
            toast.success("Formazione copiata")
        } catch {
            toast.error("Impossibile copiare la formazione")
        }
    }

    const officialPlayers = () =>
        Object.entries(lineup).map(([positionKey, player], index) => ({
            profile_id: player.id,
            player_snapshot: {
                nome: player.nome,
                cognome: player.cognome,
                avatar_url: player.avatar_url,
                role: player.ruolo,
                jersey_number: player.numero_maglia,
                birth_date: player.data_nascita,
            },
            is_starter: !isFormationBenchSlot(positionKey),
            position_key: positionKey,
            sort_order: index,
        }))

    const copyWhatsAppMessage = async () => {
        if (!nextMatch) {
            toast.error("Nessuna prossima partita disponibile.")
            return
        }
        const message = buildOfficialFormationMessage(
            nextMatch,
            officialPlayers().map((entry) => ({
                nome: String(entry.player_snapshot.nome ?? ''),
                cognome: String(entry.player_snapshot.cognome ?? ''),
                role: entry.player_snapshot.role as string | null,
                birthDate: entry.player_snapshot.birth_date as string | null,
                isStarter: entry.is_starter,
            })),
        )
        await copyOfficialFormationMessage(message)
    }

    const publishOfficialFormation = async () => {
        if (mode !== "OFFICIAL" || !isManager) {
            toast.error("Operazione riservata ai manager.")
            return
        }
        if (!nextMatch || !profile || Object.keys(lineup).length === 0) {
            toast.error("Servono una partita e almeno un convocato.")
            return
        }
        if (!captainId && !viceCaptainId) {
            toast.error("Seleziona almeno un capitano o un vice capitano")
            return
        }
        const { error } = await supabaseBrowser.rpc('publish_official_formation', {
            p_event_id: nextMatch.id,
            p_formation_module: module,
            p_shirt_color: jerseyColor,
            p_captain_profile_id: captainId,
            p_vice_captain_profile_id: viceCaptainId,
            p_snapshot: {
                module,
                jerseyColor,
                lineup: Object.fromEntries(
                    Object.entries(lineup).map(([slot, player]) => [slot, player.id]),
                ),
            },
            p_players: officialPlayers(),
        })
        if (error) {
            toast.error("Formazione non pubblicata", { description: error.message })
            return
        }
        toast.success("Formazione ufficiale pubblicata e notificata")
        await onPublished?.()
    }

    const sortedForMobile = [...filteredPlayers].sort((a, b) => { return a.cognome.localeCompare(b.cognome); });
    const showOfficialControls = mode === "OFFICIAL" && isManager
    const title = mode === "PLAYGROUND" ? "Crea la tua formazione" : "Formazione ufficiale"
    const subtitle = mode === "PLAYGROUND"
        ? "Playground locale: la formazione resta su questo dispositivo"
        : "Prepara distinta, messaggio e pubblicazione della prossima partita"

    if (loading) return (
        <div className="container max-w-7xl mx-auto p-4 pb-24 lg:flex lg:gap-6 lg:items-start" data-formation-builder-mode={mode}>
            <div className="flex-none lg:w-[55%] space-y-3">
                <div className="flex justify-between items-center mb-2">
                    <div className="space-y-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-40" /></div>
                    <Skeleton className="h-9 w-36 rounded-md" />
                </div>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="aspect-[3/4] max-w-[450px] mx-auto w-full rounded-lg" />
            </div>
            <div className="flex-1 space-y-3 mt-4 lg:mt-0">
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[140px] rounded-lg" />)}
                </div>
            </div>
        </div>
    )

    if (loadError) return (
        <div className="container max-w-7xl mx-auto p-4 pb-24" data-formation-builder-mode={mode}>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
                <h2 className="text-xl font-black">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
                <Button className="mt-4" onClick={() => void loadFormationContext()} type="button">
                    Riprova
                </Button>
            </div>
        </div>
    )

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="container max-w-7xl mx-auto p-4 pb-24 lg:flex lg:gap-6 lg:items-start" data-formation-builder-mode={mode}>

                <div className="flex-none lg:w-[55%] lg:sticky lg:top-20 space-y-3 z-10 bg-background pb-2 lg:pb-0">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-black text-foreground tracking-tight">{title}</h2>
                            <p className="text-xs text-muted-foreground font-bold">{subtitle}</p>
                        </div>

                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                            <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-0.5 border border-slate-200">
                                <button aria-label="Maglia blu" aria-pressed={jerseyColor === 'BLU'} onClick={() => setJerseyColor('BLU')} className={`p-1.5 rounded-sm transition-[opacity,box-shadow,background-color] ${jerseyColor === 'BLU' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-60 hover:opacity-100'}`} type="button">
                                    <Shirt aria-hidden="true" className="h-5 w-5 text-blue-700 fill-blue-700" />
                                </button>
                                <button aria-label="Maglia rossa" aria-pressed={jerseyColor === 'ROSSA'} onClick={() => setJerseyColor('ROSSA')} className={`p-1.5 rounded-sm transition-[opacity,box-shadow,background-color] ${jerseyColor === 'ROSSA' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-60 hover:opacity-100'}`} type="button">
                                    <Shirt aria-hidden="true" className="h-5 w-5 text-red-700 fill-red-700" />
                                </button>
                            </div>

                            <Select value={module} onValueChange={handleModuleChange}>
                                <SelectTrigger aria-label="Modulo formazione" className="w-[85px] h-9 text-xs font-bold border-border bg-background"><SelectValue placeholder="Modulo" /></SelectTrigger>
                                <SelectContent>{Object.keys(FORMATIONS).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                            </Select>

                            <div className="ml-auto flex items-center gap-2">
                                <Button
                                    aria-label="Svuota campo"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { setLineup({}); setCaptainId(null); setViceCaptainId(null); }}
                                    className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                </Button>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button aria-label="Esporta formazione" size="icon" variant="outline" className="h-9 w-9"><Download aria-hidden="true" className="h-4 w-4" /></Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-2 flex flex-col gap-1" role="menu">
                                        <Button onClick={downloadImage} role="menuitem" variant="ghost" className="justify-start text-xs h-8">
                                            <ImageIcon aria-hidden="true" className="mr-2 h-3 w-3" /> Scarica PNG
                                        </Button>
                                        {mode === "PLAYGROUND" && (
                                            <Button onClick={copyPersonalFormation} role="menuitem" variant="ghost" className="justify-start text-xs h-8">
                                                <Copy aria-hidden="true" className="mr-2 h-3 w-3" /> Copia messaggio
                                            </Button>
                                        )}
                                        {showOfficialControls && (
                                            <Button onClick={downloadExcelDistinta} role="menuitem" variant="ghost" className="justify-start text-xs h-8">
                                                <FileSpreadsheet aria-hidden="true" className="mr-2 h-3 w-3" /> Scarica distinta
                                            </Button>
                                        )}
                                    </PopoverContent>
                                </Popover>
                                {showOfficialControls && (
                                    <>
                                        <Button
                                            aria-label="Copia messaggio WhatsApp"
                                            className="h-9 w-9"
                                            onClick={copyWhatsAppMessage}
                                            size="icon"
                                            title="Copia messaggio WhatsApp"
                                            variant="outline"
                                        >
                                            <Copy aria-hidden="true" className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            aria-describedby={!captainId && !viceCaptainId ? officialRoleRequirementId : undefined}
                                            aria-label="Pubblica formazione ufficiale"
                                            className="h-9 w-9 bg-violet-600 hover:bg-violet-700"
                                            onClick={publishOfficialFormation}
                                            size="icon"
                                            title="Pubblica formazione ufficiale"
                                        >
                                            <Send aria-hidden="true" className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {showOfficialControls && !captainId && !viceCaptainId && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400" id={officialRoleRequirementId}>
                            Seleziona almeno un capitano o un vice capitano
                        </p>
                    )}

                    <div className={`w-full flex items-center justify-between px-4 py-2 rounded-lg border mb-3 transition-colors ${isU35Warning ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-card border-border'}`}>
                        <div className="flex items-center gap-2">
                            <Users className={`h-4 w-4 ${isU35Warning ? 'text-red-500' : 'text-primary'}`} />
                            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Quota Under 35</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium">
                            <div className={isFieldU35LimitExceeded ? "text-red-600 font-bold" : "text-muted-foreground"}>
                                Campo: <span className="text-foreground font-bold">{u35FieldCount}</span>/2
                            </div>
                            <div className="w-px h-3 bg-border" />
                            <div className={isTotalU35LimitExceeded ? "text-red-600 font-bold" : "text-muted-foreground"}>
                                Totale: <span className="text-foreground font-bold">{u35TotalCount}</span>/4
                            </div>
                        </div>
                    </div>

                    <div ref={fieldRef} className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="relative flex-1 max-w-[450px] mx-auto aspect-[3/4] bg-gradient-to-b from-green-600 via-green-600 to-green-700 rounded-lg overflow-hidden shadow-2xl border-[3px] border-white/20 ring-1 ring-black/10">
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, #000 39px, #000 40px)' }}></div>
                            <div className="absolute inset-4 border-2 border-white/60 rounded-sm pointer-events-none"></div>
                            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/60 pointer-events-none"></div>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/60 rounded-full bg-green-600/0 pointer-events-none"></div>
                            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-t-0 border-white/60 bg-white/5 pointer-events-none"></div>
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-b-0 border-white/60 bg-white/5 pointer-events-none"></div>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
                                <Image src="/logo-circolo-chigi-mark.webp" alt="Logo Circolo Chigi" width={128} height={128} className="h-32 w-32 object-contain" />
                            </div>

                            {(FORMATIONS[module] as FormationSlotDef[]).map((slot) => (
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
                                    showOfficialControls={showOfficialControls}
                                />
                            ))}
                        </div>

                        <div className="flex flex-col gap-1.5 p-1 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner w-14 items-center overflow-x-hidden overflow-y-auto scrollbar-hide">
                            <span className="py-1 text-[9px] font-black uppercase tracking-widest text-slate-600 vertical-text dark:text-slate-300">Panchina</span>
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
                                    showOfficialControls={showOfficialControls}
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
                                <Label className="sr-only" htmlFor="formation-player-search">Cerca giocatore</Label>
                                <Input id="formation-player-search" name="playerSearch" autoComplete="off" placeholder="Cerca giocatore…" className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus:bg-background" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>

                        </div>

                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                        {filteredPlayers.map(player => (
                            <div key={player.id} className="h-[140px]">
                                <DraggableListCard
                                    player={player}
                                    isSelected={isPlayerSelected(player.id)}
                                    isMobile={isMobile}
                                    captainId={captainId}
                                    viceCaptainId={viceCaptainId}
                                    onSetRole={handleSetRole}
                                    showOfficialControls={showOfficialControls}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Dialog open={!!mobileSlotToFill} onOpenChange={(open) => !open && setMobileSlotToFill(null)}>
                    <DialogContent className="max-w-sm rounded-xl max-h-[80vh] flex flex-col">
                        <DialogHeader><DialogTitle>Seleziona Giocatore</DialogTitle><DialogDescription>Tocca per inserire nel campo</DialogDescription></DialogHeader>
                        <div className="overflow-y-auto pr-2 custom-scrollbar space-y-2 flex-1">
                            {sortedForMobile.map(p => {
                                const isSelected = isPlayerSelected(p.id);
                                const under35 = isU35(p.data_nascita ?? '');
                                const isInjured = p.note_mediche && p.note_mediche !== 'OK';
                                return (
                                    <button disabled={isSelected} key={p.id} onClick={() => handleMobilePlayerSelect(p)} className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${isSelected ? 'cursor-not-allowed bg-muted opacity-50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'}`} type="button">
                                        <Avatar className="h-10 w-10"><AvatarImage src={p.avatar_url ?? undefined} alt={`${p.nome} ${p.cognome}`} /><AvatarFallback>{p.cognome[0]}</AvatarFallback></Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2"><p className={`text-sm ${isInjured ? 'text-red-600' : ''}`}><span className="font-bold">{p.cognome}</span>{" "}<span>{p.nome}</span></p>{under35 && <Badge className="text-[8px] h-4 px-1 bg-blue-100 text-blue-700 border-0">U35</Badge>}{isInjured && <Ambulance className="h-3 w-3 text-red-600" />}</div>
                                            <p className="text-[10px] text-muted-foreground">{p.ruolo}</p>
                                        </div>
                                        {isSelected ? <Badge variant="secondary" className="text-[9px]">IN CAMPO</Badge> : <Plus className="h-4 w-4 text-primary" />}
                                    </button>
                                )
                            })}
                        </div>
                    </DialogContent>
                </Dialog>

                <DragOverlay>
                    {activePlayer ? (
                        <div className="h-16 w-16 rounded-full bg-primary border-[3px] border-white shadow-2xl flex items-center justify-center opacity-90 cursor-grabbing overflow-hidden">
                            <Avatar className="h-full w-full"><AvatarImage src={activePlayer.avatar_url ?? undefined} alt={`${activePlayer.nome} ${activePlayer.cognome}`} className="object-cover" /><AvatarFallback>{activePlayer.cognome[0]}</AvatarFallback></Avatar>
                        </div>
                    ) : null}
                </DragOverlay>

            </div>
        </DndContext>
    )
}
