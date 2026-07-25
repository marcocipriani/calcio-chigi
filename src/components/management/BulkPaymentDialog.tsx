"use client"

import { useState, type FormEvent } from "react"
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!membershipIds.length) return
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get("amount"))
    setBusy(true)

    const { error } = await supabaseBrowser.from("payments").insert(
      membershipIds.map((membershipId) => ({
        membership_id: membershipId,
        description: String(form.get("description") ?? "").trim(),
        amount_due: amount,
        due_on: String(form.get("dueOn") ?? "") || null,
        notes: String(form.get("notes") ?? "").trim() || null,
        created_by: managerProfileId,
        updated_by: managerProfileId,
      })),
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
    onOpenChange(false)
    await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Crea quote</DialogTitle>
          <DialogDescription>
            L’importo e la scadenza saranno applicati a {membershipIds.length}{" "}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Importo</Label>
              <Input
                id="payment-amount"
                min="0"
                name="amount"
                required
                step="0.01"
                type="number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-due">Scadenza</Label>
              <Input id="payment-due" name="dueOn" type="date" />
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
