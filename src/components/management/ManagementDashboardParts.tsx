"use client"

import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
  BellPlus,
  CalendarClock,
  CircleDollarSign,
  Landmark,
  Plus,
  Shirt,
  Trash2,
  UsersRound,
  X,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PERSON_GROUPS, type PersonGroup } from "@/lib/management"
import type { CustomView, ManagementView } from "@/lib/management-columns"
import { cn } from "@/lib/utils"

// Pezzi di ManagementDashboard senza stato proprio: lo stato resta nella
// dashboard, qui arrivano valori e callback.

/** Azioni dell'intestazione. IBAN solo nella vista Quote (onBank assente altrove). */
export function DashboardActions({
  onAdd,
  onBank,
  onTrash,
}: {
  onAdd: () => void
  onBank?: () => void
  onTrash: () => void
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Numeri di maglia"
            asChild
            className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
            size="sm"
            variant="outline"
          >
            <Link href="/gestione/maglie">
              <Shirt aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Maglie</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">Numeri di maglia</TooltipContent>
      </Tooltip>
      {onBank && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Coordinate bancarie"
              className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
              onClick={onBank}
              size="sm"
              variant="outline"
            >
              <Landmark aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">IBAN</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">Coordinate bancarie</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Cestino"
            className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
            onClick={onTrash}
            size="sm"
            variant="outline"
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Cestino</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">Cestino</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Aggiungi persona"
            className="size-11 rounded-full bg-operative px-0 text-operative-foreground hover:bg-operative/90 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
            onClick={onAdd}
            size="sm"
          >
            <Plus aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Persona</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">
          Aggiungi persona
        </TooltipContent>
      </Tooltip>
    </>
  )
}

export function ViewTabs({
  views,
  customViews,
  view,
  counts,
  onSelect,
}: {
  views: Array<{ id: ManagementView; label: string }>
  customViews: CustomView[]
  view: string
  counts: Record<ManagementView, number>
  onSelect: (view: string) => void
}) {
  return (
    <div
      aria-label="Viste dashboard"
      className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 sm:flex sm:overflow-x-auto"
      role="tablist"
    >
      {views.map((item) => (
        <button
          aria-selected={view === item.id}
          className={cn(
            "inline-flex min-h-8 min-w-0 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold sm:justify-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            view === item.id
              ? "bg-operative text-operative-foreground hover:bg-operative/90"
              : "text-muted-foreground hover:bg-operative/10 hover:text-operative",
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="tab"
          type="button"
        >
          <span className="truncate">{item.label}</span>
          <span
            className={cn(
              "shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground",
              view === item.id &&
                "bg-operative-foreground/15 text-operative-foreground",
            )}
          >
            {counts[item.id]}
          </span>
        </button>
      ))}
      {customViews.map((item) => (
        <button
          aria-selected={view === item.id}
          className={cn(
            "inline-flex min-h-8 min-w-0 shrink-0 items-center justify-center rounded-md border border-dashed px-2 text-xs font-semibold sm:justify-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            view === item.id
              ? "border-transparent bg-operative text-operative-foreground hover:bg-operative/90"
              : "text-muted-foreground hover:bg-operative/10 hover:text-operative",
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="tab"
          type="button"
        >
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

export function GroupChips({
  groups,
  selected,
  countFor,
  onSelect,
}: {
  groups: PersonGroup[]
  selected: PersonGroup | undefined
  countFor: (group: PersonGroup | undefined) => number
  onSelect: (group: PersonGroup | undefined) => void
}) {
  return (
    <div
      aria-label="Gruppo"
      className="mt-1.5 flex min-w-0 gap-1 overflow-x-auto border-t pt-1.5"
      role="group"
    >
      {[{ id: undefined, label: "Tutti" }, ...PERSON_GROUPS]
        .filter(({ id }) => !id || groups.includes(id))
        .map((item) => (
          <button
            aria-pressed={selected === item.id}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected === item.id ? "border-transparent bg-operative text-operative-foreground"
                : "text-muted-foreground hover:bg-operative/10 hover:text-operative",
            )}
            key={item.id ?? "ALL"}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            {item.label}
            <span className="tabular-nums opacity-70">
              {countFor(item.id)}
            </span>
          </button>
        ))}
    </div>
  )
}

/** Barra fissa delle azioni di massa sui selezionati. */
export function SelectionBar({
  count,
  busy,
  archived,
  onClear,
  onPayment,
  onDeadline,
  onArchive,
  onNotify,
}: {
  count: number
  busy: boolean
  archived: boolean
  onClear: () => void
  onPayment: () => void
  onDeadline: () => void
  onArchive: () => void
  onNotify: () => void
}) {
  return (
    <>
      {/* Spazio per non coprire le ultime righe con la barra fissa. */}
      <div aria-hidden="true" className="h-16" />
      <div
        aria-label="Azioni sui selezionati"
        className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-2xl items-center gap-1 rounded-xl border bg-background p-1.5 shadow-lg md:bottom-20"
        role="group"
      >
        <Button
          aria-label="Deseleziona tutti"
          className="shrink-0"
          onClick={onClear}
          size="icon-sm"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {count}
          <span className="sr-only sm:not-sr-only"> selezionati</span>
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Button
            aria-label="Registra quota"
            disabled={busy}
            onClick={onPayment}
            size="sm"
            variant="outline"
          >
            <CircleDollarSign aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Quota</span>
          </Button>
          <Button
            aria-label="Imposta scadenza"
            disabled={busy}
            onClick={onDeadline}
            size="sm"
            variant="outline"
          >
            <CalendarClock aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Scadenza</span>
          </Button>
          <Button
            aria-label={
              archived
                ? "Rimetti in rosa i selezionati"
                : "Archivia i selezionati"
            }
            disabled={busy}
            onClick={onArchive}
            size="sm"
            variant="outline"
          >
            {archived ? (
              <ArchiveRestore aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            <span className="sr-only sm:not-sr-only">
              {archived ? "In rosa" : "Archivia"}
            </span>
          </Button>
          <Button
            aria-label="Invia notifica"
            disabled={busy}
            onClick={onNotify}
            size="sm"
            variant="outline"
          >
            <BellPlus aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Notifica</span>
          </Button>
        </div>
      </div>
    </>
  )
}

export type QuickDialog =
  | { kind: "DEADLINE" }
  | { kind: "CERTIFICATE"; certificateId: string }

/** Un valore solo da chiedere: data di scadenza o motivo del rifiuto certificato. */
export function QuickActionDialog({
  dialog,
  value,
  onValueChange,
  busy,
  selectedCount,
  onClose,
  onSaveDeadline,
  onRejectCertificate,
}: {
  dialog: QuickDialog | null
  value: string
  onValueChange: (value: string) => void
  busy: boolean
  selectedCount: number
  onClose: () => void
  onSaveDeadline: () => void
  onRejectCertificate: (certificateId: string) => void
}) {
  return (
    <Dialog
      open={Boolean(dialog)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        {dialog?.kind === "DEADLINE" && (
          <>
            <DialogHeader>
              <DialogTitle>Scadenza prossimo contatto</DialogTitle>
              <DialogDescription>
                Applica la data alle {selectedCount} persone
                selezionate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="next-contact-date">Data</Label>
              <Input
                autoFocus
                id="next-contact-date"
                onChange={(event) => onValueChange(event.target.value)}
                type="date"
                value={value}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={onClose}
                variant="outline"
              >
                Annulla
              </Button>
              <Button
                disabled={busy || !value}
                onClick={onSaveDeadline}
              >
                Salva scadenza
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog?.kind === "CERTIFICATE" && (
          <>
            <DialogHeader>
              <DialogTitle>Respingi certificato</DialogTitle>
              <DialogDescription>
                Il motivo sarà visibile alla persona per correggere il
                documento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="certificate-rejection-reason">Motivo</Label>
              <Textarea
                autoFocus
                id="certificate-rejection-reason"
                onChange={(event) => onValueChange(event.target.value)}
                placeholder="Es. documento illeggibile o non agonistico"
                value={value}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={onClose}
                variant="outline"
              >
                Annulla
              </Button>
              <Button
                disabled={busy || !value.trim()}
                onClick={() => onRejectCertificate(dialog.certificateId)}
                variant="destructive"
              >
                Respingi certificato
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RejectAccountDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare account e richiesta?</AlertDialogTitle>
          <AlertDialogDescription>
            Il rifiuto è definitivo: elimina l’utente di autenticazione e la
            richiesta di associazione. Il profilo rosa rimane disponibile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            Elimina account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AccessState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center text-center">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
          <UsersRound aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button asChild className="mt-4">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

