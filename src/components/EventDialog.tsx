"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventToEdit?: any
  onSave: (eventData: any) => Promise<void>
}

export function EventDialog({ open, onOpenChange, eventToEdit, onSave }: EventDialogProps) {
  const [loading, setLoading] = useState(false)
  
  const [tipo, setTipo] = useState('ALLENAMENTO')
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [endTimeStr, setEndTimeStr] = useState('')
  const [luogo, setLuogo] = useState('')
  const [avversario, setAvversario] = useState('')
  const [note, setNote] = useState('')
  const [giocata, setGiocata] = useState(false)
  const [golNostri, setGolNostri] = useState<string>('0')
  const [golAvversario, setGolAvversario] = useState<string>('0')
  const [cancellato, setCancellato] = useState(false)

  useEffect(() => {
    if (open) {
        if (eventToEdit) {
            try {
                const d = new Date(eventToEdit.data_ora)
                const localTime = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); 
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const localDate = `${year}-${month}-${day}`;

                let endLocalTime = '';
                if (eventToEdit.data_fine_ora) {
                    const de = new Date(eventToEdit.data_fine_ora);
                    endLocalTime = de.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                }

                setTipo(eventToEdit.tipo || 'ALLENAMENTO')
                setDateStr(localDate)
                setTimeStr(localTime)
                setEndTimeStr(endLocalTime)
                setLuogo(eventToEdit.luogo || '')
                setAvversario(eventToEdit.avversario || '')
                setNote(eventToEdit.note || '')
                setGiocata(eventToEdit.giocata || false)
                setGolNostri(String(eventToEdit.gol_casa ?? 0))
                setGolAvversario(String(eventToEdit.gol_ospite ?? 0))
                setCancellato(eventToEdit.cancellato || false)
            } catch (e) {
                console.error("Errore parsing data evento", e);
            }
        } else {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            
            setTipo('ALLENAMENTO')
            setDateStr(`${year}-${month}-${day}`)
            setTimeStr('21:00')
            setEndTimeStr('')
            setLuogo('C.S. CAVALIERI')
            setAvversario('')
            setNote('')
            setGiocata(false)
            setGolNostri('0')
            setGolAvversario('0')
            setCancellato(false)
        }
    }
  }, [eventToEdit, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
        if (!dateStr || !timeStr) throw new Error("Data e ora inizio sono obbligatorie");
        
        const startDateTime = new Date(`${dateStr}T${timeStr}`);
        
        let endDateTime = null;
        if (endTimeStr) {
            endDateTime = new Date(`${dateStr}T${endTimeStr}`);
        }
        
        if (isNaN(startDateTime.getTime())) throw new Error("Data non valida");

        const safeInt = (val: string) => {
            const parsed = parseInt(val, 10);
            return isNaN(parsed) ? 0 : parsed;
        }

        const payload: any = {
            tipo,
            data_ora: startDateTime.toISOString(),
            data_fine_ora: endDateTime ? endDateTime.toISOString() : null,
            luogo,
            note: note || null,
            giocata,
            cancellato
        }

        if (tipo === 'PARTITA') {
            payload.avversario = avversario || "Avversario";
            if (giocata) {
                payload.gol_casa = safeInt(golNostri);
                payload.gol_ospite = safeInt(golAvversario);
            } else {
                payload.gol_casa = null;
                payload.gol_ospite = null;
            }
        } else {
            payload.avversario = null;
            payload.gol_casa = null;
            payload.gol_ospite = null;
            payload.giocata = false;
        }

        await onSave(payload)
        onOpenChange(false)
    } catch (error: any) {
        console.error("❌ Errore Submit:", error)
        alert(`Errore: ${error.message}`)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle>{eventToEdit ? 'Modifica Evento' : 'Nuovo Evento'}</DialogTitle>
          <DialogDescription>Gestisci i dettagli dell'impegno.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="PARTITA">Partita</SelectItem>
                        <SelectItem value="ALLENAMENTO">Allenamento</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-2 justify-center items-end border p-2 rounded-md bg-muted/20 border-red-200">
                <Label className="text-xs text-red-600 cursor-pointer font-bold" htmlFor="canc-switch">Annullato</Label>
                <Switch id="canc-switch" checked={cancellato} onCheckedChange={setCancellato} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required className="block w-full" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>Inizio</Label>
                <Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} required className="block w-full" />
            </div>
            <div className="space-y-2">
                <Label>Fine (Opzionale)</Label>
                <Input type="time" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="block w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Luogo</Label>
            <Input value={luogo} onChange={(e) => setLuogo(e.target.value)} required />
          </div>

          {tipo === 'PARTITA' && (
             <div className="space-y-4 border rounded-lg p-3 bg-muted/30 mt-2">
                <div className="space-y-2">
                    <Label>Avversario / Titolo</Label>
                    <Input value={avversario} onChange={(e) => setAvversario(e.target.value)} placeholder="Es: vs Real Madrid" />
                </div>
                
                <div className="flex items-center justify-between">
                    <Label htmlFor="played-switch">Partita Giocata?</Label>
                    <Switch id="played-switch" checked={giocata} onCheckedChange={setGiocata} />
                </div>

                {giocata && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Gol Casa</Label>
                            <Input type="number" value={golNostri} onChange={(e) => setGolNostri(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Gol Ospite</Label>
                            <Input type="number" value={golAvversario} onChange={(e) => setGolAvversario(e.target.value)} />
                        </div>
                    </div>
                )}
             </div>
          )}

          <div className="space-y-2">
            <Label>Note (Visibili a tutti)</Label>
            <Textarea 
                value={note} 
                onChange={(e) => setNote(e.target.value)} 
                placeholder="Es: Portare maglia rossa..."
                className="min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salva Modifiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}