"use client"

import { useEffect, useState, type FormEvent } from "react"
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
import { fetchPaymentSettings, type PaymentSettings } from "@/lib/payments"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

/** IBAN e intestatario che i giocatori copiano per il bonifico. */
export function PaymentSettingsDialog({
  open,
  onOpenChange,
  managerProfileId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  managerProfileId: string | null
}) {
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    fetchPaymentSettings(supabaseBrowser)
      .then(setSettings)
      .catch((error: Error) =>
        toast.error("Coordinate non caricate", { description: error.message }),
      )
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await supabaseBrowser
      .from("payment_settings")
      .update({
        iban: String(form.get("iban") ?? "").replace(/\s+/g, "").toUpperCase(),
        holder: String(form.get("holder") ?? "").trim(),
        updated_at: new Date().toISOString(),
        updated_by: managerProfileId,
      })
      .eq("id", true)
    setBusy(false)
    if (error) {
      toast.error("Coordinate non salvate", { description: error.message })
      return
    }
    toast.success("Coordinate bancarie salvate")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Coordinate bancarie</DialogTitle>
          <DialogDescription>
            I giocatori le vedono e le copiano quando pagano con bonifico.
          </DialogDescription>
        </DialogHeader>
        {settings && (
          <form className="grid gap-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="settings-iban">IBAN</Label>
              <Input
                autoComplete="off"
                className="font-mono"
                defaultValue={settings.iban}
                id="settings-iban"
                name="iban"
                pattern="[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{11,32}"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-holder">Intestatario</Label>
              <Input
                defaultValue={settings.holder}
                id="settings-holder"
                name="holder"
                required
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Annulla
              </Button>
              <Button disabled={busy} type="submit">
                {busy ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
