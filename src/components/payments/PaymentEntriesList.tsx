"use client"

import { Check, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  entryStatusLabel,
  formatEuro,
  methodLabel,
  type CashRecipient,
  type PaymentEntry,
} from "@/lib/payments"

const statusTone = {
  PENDING: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  VERIFIED: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  REJECTED: "border-destructive/40 text-destructive",
} as const

function displayDate(value: string) {
  return new Intl.DateTimeFormat("it").format(new Date(value))
}

/** Barra "Pagati X su Y" della rata. */
export function PaymentProgress({ paid, due }: { paid: number; due: number }) {
  const percent = due > 0 ? Math.min(100, (paid / due) * 100) : 100
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Pagati {formatEuro(paid)} su {formatEuro(due)}
      </p>
      <div
        aria-hidden="true"
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function PaymentEntriesList({
  entries,
  recipients,
  busy,
  onCancel,
  onReview,
}: {
  entries: PaymentEntry[]
  recipients: CashRecipient[]
  busy?: boolean
  onCancel?: (entryId: string) => void
  onReview?: (entryId: string, approved: boolean) => void
}) {
  if (!entries.length) return null
  const names = new Map(
    recipients.map((person) => [person.id, `${person.nome} ${person.cognome}`]),
  )

  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <li
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
          key={entry.id}
        >
          <div className="min-w-0">
            <p className="font-semibold">
              {formatEuro(entry.amount)} · {methodLabel[entry.method]} ·{" "}
              {displayDate(entry.paidOn)}
            </p>
            {entry.method === "CASH" && entry.cashRecipientId && (
              <p className="text-muted-foreground">
                Dati a {names.get(entry.cashRecipientId) ?? "persona non più in rosa"}
              </p>
            )}
            {entry.status === "REJECTED" && entry.rejectionReason && (
              <p className="text-destructive">{entry.rejectionReason}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge className={statusTone[entry.status]} variant="outline">
              {entryStatusLabel[entry.status]}
            </Badge>
            {entry.status === "PENDING" && onCancel && (
              <Button
                disabled={busy}
                onClick={() => onCancel(entry.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Annulla
              </Button>
            )}
            {entry.status === "PENDING" && onReview && (
              <>
                <Button
                  aria-label="Conferma versamento"
                  disabled={busy}
                  onClick={() => onReview(entry.id, true)}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <Check aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Rifiuta versamento"
                  disabled={busy}
                  onClick={() => onReview(entry.id, false)}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
