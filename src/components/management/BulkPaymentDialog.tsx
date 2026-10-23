"use client"

import { useState, type FormEvent } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

export function BulkPaymentDialog({
  open,
  membershipIds,
  managerProfileId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  membershipIds: string[]
  managerProfileId: string
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  // Una riga = una rata con importo e scadenza propri.
  const [rates, setRates] = useState([{ amount: "", dueOn: "" }])
  const total = rates.reduce((sum, rate) => sum + (Number(rate.amount) || 0), 0)

  function updateRate(index: number, field: "amount" | "dueOn", value: string) {
    setRates((current) =>
      current.map((rate, i) => (i === index ? { ...rate, [field]: value } : rate)),
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!membershipIds.length) return
    const form = new FormData(event.currentTarget)
    const description = String(form.get("description") ?? "").trim()
    const notes = String(form.get("notes") ?? "").trim() || null
    setBusy(true)

    const { error } = await supabaseBrowser.from("payments").insert(
      membershipIds.flatMap((membershipId) =>
        rates.map((rate, index) => ({
          membership_id: membershipId,
          description:
            rates.length > 1
              ? `${description} – rata ${index + 1}/${rates.length}`
              : description,
          amount_due: Number(rate.amount),
          due_on: rate.dueOn || null,
          notes,
          created_by: managerProfileId,
          updated_by: managerProfileId,
        })),
      ),
    )

    setBusy(false)
    if (error) {
      toast.error("Quote non create", { description: error.message })
      return
    }
    toast.success(
      membershipIds.length === 1
        ? "Quota creata"
        : `${membershipIds.length} quote create`,
    )
    setRates([{ amount: "", dueOn: "" }])
    onOpenChange(false)
    await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Crea quote</DialogTitle>
          <DialogDescription>
            Importi e scadenze saranno applicati a {membershipIds.length}{" "}
            {membershipIds.length === 1 ? "persona" : "persone"} selezionate.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="payment-description">Descrizione</Label>
            <Input
              id="payment-description"
              name="description"
              placeholder="Quota stagione, divisa…"
              required
            />
          </div>
          <div className="grid gap-2">
            {rates.map((rate, index) => (
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" key={index}>
                <div className="space-y-1.5">
                  <Label htmlFor={`payment-amount-${index}`}>
                    {rates.length > 1 ? `Rata ${index + 1}` : "Importo"}
                  </Label>
                  <Input
                    id={`payment-amount-${index}`}
                    min="0.01"
                    onChange={(event) => updateRate(index, "amount", event.target.value)}
                    required
                    step="0.01"
                    type="number"
                    value={rate.amount}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`payment-due-${index}`}>Scadenza</Label>
                  <Input
                    id={`payment-due-${index}`}
                    onChange={(event) => updateRate(index, "dueOn", event.target.value)}
                    type="date"
                    value={rate.dueOn}
                  />
                </div>
                <Button
                  aria-label={`Rimuovi rata ${index + 1}`}
                  disabled={rates.length === 1}
                  onClick={() => setRates((current) => current.filter((_, i) => i !== index))}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <Button
                onClick={() => setRates((current) => [...current, { amount: "", dueOn: "" }])}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                {rates.length > 1 ? "Aggiungi rata" : "Dividi in rate"}
              </Button>
              {rates.length > 1 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Totale {total.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Note</Label>
            <Input id="payment-notes" name="notes" />
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Annulla
            </Button>
            <Button disabled={busy || !membershipIds.length} type="submit">
              {busy ? "Creazione…" : "Crea quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
