"use client"

import { useEffect, useState } from "react"
import { CreditCard } from "lucide-react"
import { toast } from "sonner"

import {
  PaymentReceipt,
  type MembershipDocumentsState,
} from "@/components/documents/MembershipDocuments"
import {
  PaymentEntriesList,
  PaymentProgress,
} from "@/components/payments/PaymentEntriesList"
import { PaymentEntryDialog } from "@/components/payments/PaymentEntryDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { ManagementPerson } from "@/lib/management"
import {
  fetchCashRecipients,
  formatEuro,
  remainingAmount,
  type CashRecipient,
} from "@/lib/payments"
import { paymentStatusLabel } from "@/lib/profile-operations"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

// Pagamenti della scheda persona. La sezione sta nel form della scheda, i
// dialog fuori: un submit nel portal risalirebbe al form e salverebbe la scheda.

/** Stato condiviso tra la sezione e i dialog: versamento da registrare o da rifiutare. */
export function usePaymentReview(
  person: ManagementPerson | null,
  onSaved: () => Promise<void>,
) {
  const [recipients, setRecipients] = useState<CashRecipient[]>([])
  const [entryPaymentId, setEntryPaymentId] = useState<string | null>(null)
  const [rejectEntryId, setRejectEntryId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [entryBusy, setEntryBusy] = useState(false)

  const hasPayments = Boolean(person?.payments.length)
  useEffect(() => {
    if (!hasPayments || recipients.length) return
    fetchCashRecipients(supabaseBrowser)
      .then(setRecipients)
      .catch(() => setRecipients([]))
  }, [hasPayments, recipients.length])

  async function reviewEntry(entryId: string, approved: boolean, reason = "") {
    setEntryBusy(true)
    const { error } = await supabaseBrowser.rpc("manager_review_payment_entry", {
      p_entry_id: entryId,
      p_status: approved ? "VERIFIED" : "REJECTED",
      p_rejection_reason: reason.trim() || null,
    })
    setEntryBusy(false)
    if (error) {
      toast.error("Versamento non aggiornato", { description: error.message })
      return
    }
    toast.success(approved ? "Versamento confermato" : "Versamento rifiutato")
    setRejectEntryId(null)
    setRejectReason("")
    await onSaved()
  }

  return {
    recipients,
    entryPaymentId,
    setEntryPaymentId,
    rejectEntryId,
    setRejectEntryId,
    rejectReason,
    setRejectReason,
    entryBusy,
    reviewEntry,
  }
}

type PaymentReview = ReturnType<typeof usePaymentReview>

export function PersonPaymentsSection({
  person,
  documents,
  review,
}: {
  person: ManagementPerson
  documents: MembershipDocumentsState
  review: PaymentReview
}) {
  return (
    <section className="grid content-start gap-3 md:col-span-2">
      <h3 className="text-sm font-semibold">
        Pagamenti
      </h3>
      {person.payments.length ? (
        <div className="divide-y rounded-lg border">
          {person.payments.map((payment) => (
            <div className="grid gap-2 px-3 py-2" key={payment.id}>
            <div className="flex min-h-12 items-center gap-3">
              <CreditCard
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">
                  {payment.description ?? "Quota"}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {payment.dueOn
                    ? `Scadenza ${payment.dueOn}`
                    : "Nessuna scadenza"}
                </span>
              </span>
              <span className="text-right">
                <strong className="block text-sm tabular-nums">
                  {formatEuro(payment.amountDue)}
                </strong>
                <Badge variant={payment.status === "PAID" ? "default" : "outline"}>
                  {paymentStatusLabel(payment.status)}
                </Badge>
              </span>
              {payment.id && (
                <PaymentReceipt
                  canDelete={() => true}
                  label={`ricevuta ${payment.description ?? "quota"}`}
                  paymentId={payment.id}
                  state={documents}
                />
              )}
            </div>
            <PaymentProgress
              due={payment.amountDue}
              paid={payment.amountPaid ?? 0}
            />
            <PaymentEntriesList
              busy={review.entryBusy}
              entries={payment.entries ?? []}
              onReview={(entryId, approved) =>
                approved
                  ? void review.reviewEntry(entryId, true)
                  : review.setRejectEntryId(entryId)
              }
              recipients={review.recipients}
            />
            {payment.id &&
              payment.status !== "PAID" &&
              remainingAmount(payment.amountDue, payment.entries ?? []) > 0 && (
                <Button
                  onClick={() => review.setEntryPaymentId(payment.id!)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Registra versamento
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nessuna quota assegnata.
        </p>
      )}
    </section>
  )
}

export function PersonPaymentDialogs({
  person,
  review,
  currentProfileId,
  onSaved,
}: {
  person: ManagementPerson
  review: PaymentReview
  currentProfileId: string | null
  onSaved: () => Promise<void>
}) {
  const entryPayment =
    person.payments.find(({ id }) => id && id === review.entryPaymentId) ?? null

  return (
    <>
      {entryPayment && (
        <PaymentEntryDialog
          currentProfileId={currentProfileId}
          description={entryPayment.description ?? "Quota"}
          mode="manager"
          onOpenChange={(open) => !open && review.setEntryPaymentId(null)}
          onSaved={onSaved}
          open
          ownerName={`${person.nome} ${person.cognome}`}
          ownerProfileId={person.profileId}
          paymentId={entryPayment.id!}
          recipients={review.recipients}
          remaining={remainingAmount(entryPayment.amountDue, entryPayment.entries ?? [])}
          settings={null}
        />
      )}

      <Dialog
        onOpenChange={(open) => !open && review.setRejectEntryId(null)}
        open={Boolean(review.rejectEntryId)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rifiuta versamento</DialogTitle>
            <DialogDescription>
              Il motivo, se lo scrivi, arriva alla persona con la notifica.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Motivo"
            onChange={(event) => review.setRejectReason(event.target.value)}
            placeholder="Es. bonifico non arrivato"
            value={review.rejectReason}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button
              disabled={review.entryBusy}
              onClick={() => review.rejectEntryId && void review.reviewEntry(review.rejectEntryId, false, review.rejectReason)}
              type="button"
              variant="destructive"
            >
              Rifiuta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
