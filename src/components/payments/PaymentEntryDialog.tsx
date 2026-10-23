"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Copy } from "lucide-react"
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
import {
  formatEuro,
  recipientGroupLabel,
  type CashRecipient,
  type CashRecipientGroup,
  type PaymentMethod,
  type PaymentSettings,
} from "@/lib/payments"
import { romeDateKey } from "@/lib/season"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const GROUPS: CashRecipientGroup[] = ["STAFF", "MANAGER", "PLAYER"]

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-all font-mono text-sm font-semibold">{value}</p>
      </div>
      <Button
        aria-label={`Copia ${label.toLowerCase()}`}
        onClick={() =>
          navigator.clipboard
            .writeText(value)
            .then(() => toast.success(`${label} copiato`))
            .catch(() => toast.error("Copia non riuscita"))
        }
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <Copy aria-hidden="true" />
      </Button>
    </div>
  )
}

/**
 * Dichiarazione di un versamento su una rata. Il giocatore dichiara (resta da
 * verificare), il manager registra un versamento già confermato.
 */
export function PaymentEntryDialog({
  open,
  onOpenChange,
  mode,
  paymentId,
  description,
  remaining,
  ownerProfileId,
  ownerName,
  currentProfileId,
  recipients,
  settings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "player" | "manager"
  paymentId: string
  description: string
  remaining: number
  ownerProfileId: string
  ownerName: string
  currentProfileId: string | null
  recipients: CashRecipient[]
  settings: PaymentSettings | null
  onSaved: () => void | Promise<void>
}) {
  const today = romeDateKey(new Date())
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setMethod("BANK_TRANSFER")
  }, [open])

  const choices = recipients.filter(({ id }) => id !== ownerProfileId)
  const causale = `${description} – ${ownerName}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Il dialog vive in un portale ma l'evento risale l'albero React: senza
    // stop arriverebbe al form della scheda persona.
    event.stopPropagation()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await supabaseBrowser.rpc(
      mode === "player" ? "declare_payment_entry" : "manager_record_payment_entry",
      {
        p_payment_id: paymentId,
        p_amount: Number(form.get("amount")),
        p_paid_on: String(form.get("paidOn")),
        p_method: method,
        p_cash_recipient_id:
          method === "CASH" ? String(form.get("recipient") ?? "") || null : null,
      },
    )
    setBusy(false)
    if (error) {
      toast.error("Pagamento non registrato", { description: error.message })
      return
    }
    toast.success(
      mode === "player"
        ? "Pagamento dichiarato: il manager lo verificherà"
        : "Versamento registrato",
    )
    onOpenChange(false)
    await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>
            {mode === "player" ? "Registra pagamento" : "Registra versamento"}
          </DialogTitle>
          <DialogDescription>
            {description} · residuo {formatEuro(remaining)}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry-amount">Importo (€)</Label>
              <Input
                defaultValue={remaining}
                id="entry-amount"
                key={`${paymentId}-${remaining}`}
                max={remaining}
                min="0.01"
                name="amount"
                required
                step="0.01"
                type="number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Data pagamento</Label>
              <Input
                defaultValue={today}
                id="entry-date"
                max={today}
                name="paidOn"
                required
                type="date"
              />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Metodo</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["BANK_TRANSFER", "CASH"] as const).map((value) => (
                <Button
                  aria-pressed={method === value}
                  key={value}
                  onClick={() => setMethod(value)}
                  type="button"
                  variant={method === value ? "default" : "outline"}
                >
                  {value === "CASH" ? "Contanti" : "Bonifico"}
                </Button>
              ))}
            </div>
          </fieldset>

          {method === "CASH" && (
            <div className="space-y-1.5">
              <Label htmlFor="entry-recipient">
                {mode === "player" ? "A chi li hai dati" : "Chi li ha ricevuti"}
              </Label>
              <select
                className={selectClass}
                defaultValue={
                  mode === "manager" && currentProfileId ? currentProfileId : ""
                }
                id="entry-recipient"
                key={`${paymentId}-recipient`}
                name="recipient"
                required
              >
                <option disabled value="">
                  Scegli una persona
                </option>
                {GROUPS.map((group) => {
                  const people = choices.filter((person) => person.group === group)
                  return people.length ? (
                    <optgroup key={group} label={recipientGroupLabel[group]}>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.cognome} {person.nome}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </select>
            </div>
          )}

          {method === "BANK_TRANSFER" && mode === "player" && (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
              {settings ? (
                <>
                  <CopyRow label="IBAN" value={settings.iban} />
                  <CopyRow label="Intestatario" value={settings.holder} />
                  <CopyRow label="Causale" value={causale} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  IBAN non ancora impostato: chiedilo al manager.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Annulla
            </Button>
            <Button disabled={busy || remaining <= 0} type="submit">
              {busy ? "Invio…" : mode === "player" ? "Dichiara" : "Registra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
