"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BellPlus,
  CalendarClock,
  CircleDollarSign,
  FilterX,
  Plus,
  Search,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { AddPersonDialog } from "@/components/management/AddPersonDialog"
import { BulkPaymentDialog } from "@/components/management/BulkPaymentDialog"
import { KpiStrip } from "@/components/management/KpiStrip"
import {
  ManagementTable,
  type ManagementView,
} from "@/components/management/ManagementTable"
import { NotificationComposer } from "@/components/management/NotificationComposer"
import { PersonDrawer } from "@/components/management/PersonDrawer"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  filterManagementRows,
  type ManagementFilters,
  type ManagementPerson,
} from "@/lib/management"
import { fetchManagementPeople } from "@/lib/management-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

const selectClass =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const views: { id: ManagementView; label: string }[] = [
  { id: "ROSTER", label: "Rosa" },
  { id: "REGISTRATIONS", label: "Tesseramenti" },
  { id: "PAYMENTS", label: "Quote" },
  { id: "CERTIFICATES", label: "Certificati" },
  { id: "ACCOUNTS", label: "Account" },
]

const emptyFilters: ManagementFilters = {
  query: "",
  category: "ALL",
  status: "ALL",
  tag: "ALL",
}

type QuickDialog =
  | { kind: "DEADLINE" }
  | { kind: "PAYMENT"; paymentId: string }
  | { kind: "CERTIFICATE"; certificateId: string }

export function ManagementDashboard() {
  const {
    associationStatus,
    isManager,
    loading: sessionLoading,
    profile,
    targetSeason,
    user,
  } = useAppSession()
  const [seasonSlug, setSeasonSlug] = useState(
    targetSeason?.slug ?? "2026-2027",
  )
  const [people, setPeople] = useState<ManagementPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ManagementView>("ROSTER")
  const [filters, setFilters] = useState(emptyFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPerson, setOpenPerson] = useState<ManagementPerson | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [quickDialog, setQuickDialog] = useState<QuickDialog | null>(null)
  const [quickValue, setQuickValue] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER"
  >("BANK_TRANSFER")
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    if (targetSeason?.slug) setSeasonSlug(targetSeason.slug)
  }, [targetSeason?.slug])

  const load = useCallback(async () => {
    if (!isManager) return
    setLoading(true)
    try {
      setPeople(await fetchManagementPeople(supabaseBrowser, seasonSlug))
    } catch (error) {
      toast.error("Dashboard non caricata", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [isManager, seasonSlug])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () => filterManagementRows(people, filters),
    [filters, people],
  )
  const selectedPeople = useMemo(
    () => people.filter(({ id }) => selected.has(id)),
    [people, selected],
  )
  const selectedUserIds = selectedPeople
    .map(({ userId }) => userId)
    .filter((id): id is string => Boolean(id))

  if (sessionLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-3 p-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <AccessState
        action={{ href: "/login", label: "Accedi" }}
        description="La gestione è riservata agli account manager."
        title="Accesso richiesto"
      />
    )
  }

  if (associationStatus !== "ACTIVE") {
    return (
      <AccessState
        description="L’account deve essere associato a un profilo e approvato da un manager."
        title="Account non ancora approvato"
      />
    )
  }

  if (!isManager) {
    return (
      <AccessState
        action={{ href: "/", label: "Torna al calendario" }}
        description="Il ruolo giocatore o staff non dà accesso alla dashboard."
        title="Permesso manager richiesto"
      />
    )
  }

  function toggleSelection(membershipId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(membershipId)) next.delete(membershipId)
      else next.add(membershipId)
      return next
    })
  }

  function applyDeadline() {
    if (!selected.size) {
      toast.error("Seleziona almeno una persona")
      return
    }
    setQuickValue("")
    setQuickDialog({ kind: "DEADLINE" })
  }

  async function saveDeadline() {
    if (!quickValue) return
    setActionBusy(true)
    const { error } = await supabaseBrowser
      .from("season_memberships")
      .update({ next_contact_on: quickValue, updated_by: profile?.id })
      .in("id", [...selected])
    setActionBusy(false)
    if (error) {
      toast.error("Scadenza non aggiornata", { description: error.message })
      return
    }
    toast.success("Scadenza aggiornata")
    setQuickDialog(null)
    await load()
  }

  async function accountAction(
    requestId: string,
    action: "APPROVE" | "REJECT",
  ) {
    if (action === "REJECT") {
      setRejectRequestId(requestId)
      return
    }
    await submitAccountAction(requestId, action)
  }

  async function submitAccountAction(
    requestId: string,
    action: "APPROVE" | "REJECT",
  ) {
    setActionBusy(true)
    const { error } = await supabaseBrowser.functions.invoke(
      "account-association",
      { body: { requestId, action } },
    )
    setActionBusy(false)
    if (error) {
      toast.error("Richiesta non aggiornata", { description: error.message })
      return
    }
    toast.success(action === "APPROVE" ? "Account approvato" : "Account eliminato")
    setRejectRequestId(null)
    await load()
  }

  function verifyPayment(paymentId: string) {
    setPaymentMethod("BANK_TRANSFER")
    setQuickDialog({ kind: "PAYMENT", paymentId })
  }

  async function submitPayment(paymentId: string) {
    setActionBusy(true)
    const { error } = await supabaseBrowser.rpc("manager_verify_payment", {
      p_payment_id: paymentId,
      p_method: paymentMethod,
    })
    setActionBusy(false)
    if (error) {
      toast.error("Pagamento non verificato", { description: error.message })
      return
    }
    toast.success("Pagamento verificato")
    setQuickDialog(null)
    await load()
  }

  async function reviewCertificate(
    certificateId: string,
    approved: boolean,
  ) {
    if (!approved) {
      setQuickValue("")
      setQuickDialog({ kind: "CERTIFICATE", certificateId })
      return
    }
    await submitCertificateReview(certificateId, true)
  }

  async function submitCertificateReview(
    certificateId: string,
    approved: boolean,
  ) {
    if (!approved && !quickValue.trim()) return
    setActionBusy(true)
    const { error } = await supabaseBrowser.rpc(
      "manager_review_certificate",
      {
        p_certificate_id: certificateId,
        p_status: approved ? "VALID" : "REJECTED",
        p_rejection_reason: approved ? null : quickValue.trim(),
      },
    )
    setActionBusy(false)
    if (error) {
      toast.error("Certificato non aggiornato", {
        description: error.message,
      })
      return
    }
    toast.success(approved ? "Certificato approvato" : "Certificato respinto")
    setQuickDialog(null)
    await load()
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-3 px-3 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Sala operativa
          </p>
          <h1 className="text-2xl font-black tracking-tight">
            Gestione squadra
          </h1>
        </div>
        <div
          aria-label="Azioni rapide"
          className="flex flex-wrap items-center gap-1.5"
        >
          <select
            aria-label="Stagione"
            className={selectClass}
            onChange={(event) => {
              setSeasonSlug(event.target.value)
              setSelected(new Set())
            }}
            value={seasonSlug}
          >
            <option value="2026-2027">2026–2027</option>
            <option value="2025-2026">2025–2026</option>
          </select>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus aria-hidden="true" />
            Persona
          </Button>
          <Button
            onClick={() =>
              selected.size
                ? setPaymentOpen(true)
                : toast.error("Seleziona almeno una persona")
            }
            size="sm"
            variant="outline"
          >
            <CircleDollarSign aria-hidden="true" />
            Quota
          </Button>
          <Button onClick={applyDeadline} size="sm" variant="outline">
            <CalendarClock aria-hidden="true" />
            Scadenza
          </Button>
          <Button
            onClick={() =>
              selectedUserIds.length
                ? setNotificationOpen(true)
                : toast.error("Seleziona persone con un account attivo")
            }
            size="sm"
            variant="outline"
          >
            <BellPlus aria-hidden="true" />
            Notifica
          </Button>
        </div>
      </div>

      <KpiStrip
        activeView={view}
        onViewChange={setView}
        people={people}
      />

      <div className="sticky top-16 z-20 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div
            aria-label="Viste dashboard"
            className="flex gap-1 overflow-x-auto"
            role="tablist"
          >
            {views.map((item) => (
              <button
                aria-selected={view === item.id}
                className={cn(
                  "min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === item.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
                key={item.id}
                onClick={() => setView(item.id)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative min-w-48 flex-1 xl:w-64 xl:flex-none">
              <span className="sr-only">Cerca persone</span>
              <Search
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-9 pl-8"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="Cerca persona, telefono…"
                value={filters.query}
              />
            </label>
            <select
              aria-label="Filtra categoria"
              className={selectClass}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  category: event.target.value as ManagementFilters["category"],
                }))
              }
              value={filters.category}
            >
              <option value="ALL">Tutte le categorie</option>
              <option value="PLAYER">Giocatori</option>
              <option value="STAFF">Staff</option>
            </select>
            <select
              aria-label="Filtra conferma"
              className={selectClass}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as ManagementFilters["status"],
                }))
              }
              value={filters.status}
            >
              <option value="ALL">Tutte le conferme</option>
              <option value="INTERESTED">Interessati</option>
              <option value="PENDING">Da confermare</option>
              <option value="YES">Sì</option>
              <option value="MAYBE">Forse</option>
              <option value="NO">No</option>
            </select>
            <select
              aria-label="Filtra tag"
              className={selectClass}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  tag: event.target.value as ManagementFilters["tag"],
                }))
              }
              value={filters.tag}
            >
              <option value="ALL">Tutti i tag</option>
              <option value="EXT">EXT</option>
              <option value="AGG">AGG</option>
              <option value="TRAINING">Solo allenamenti</option>
            </select>
            <Button
              aria-label="Azzera filtri"
              onClick={() => setFilters(emptyFilters)}
              size="icon"
              variant="ghost"
            >
              <FilterX aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex min-h-7 items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} risultati · {selected.size} selezionati
          </span>
          <div className="flex items-center gap-2">
            <button
              className="min-h-7 underline-offset-4 hover:underline"
              onClick={() => setSelected(new Set(filtered.map(({ id }) => id)))}
              type="button"
            >
              Seleziona visibili
            </button>
            {selected.size > 0 && (
              <button
                className="min-h-7 underline-offset-4 hover:underline"
                onClick={() => setSelected(new Set())}
                type="button"
              >
                Deseleziona
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton className="h-11 w-full" key={index} />
          ))}
        </div>
      ) : (
        <ManagementTable
          onAccountAction={accountAction}
          onOpen={setOpenPerson}
          onReviewCertificate={reviewCertificate}
          onSelect={toggleSelection}
          onVerifyPayment={verifyPayment}
          people={filtered}
          selected={selected}
          view={view}
        />
      )}

      <AddPersonDialog
        onOpenChange={setAddOpen}
        onSaved={load}
        open={addOpen}
        seasonSlug={seasonSlug}
      />
      <BulkPaymentDialog
        managerProfileId={profile?.id ?? ""}
        membershipIds={[...selected]}
        onOpenChange={setPaymentOpen}
        onSaved={load}
        open={paymentOpen}
      />
      <NotificationComposer
        onOpenChange={setNotificationOpen}
        open={notificationOpen}
        targetUserIds={selectedUserIds}
      />
      <PersonDrawer
        onOpenChange={(open) => !open && setOpenPerson(null)}
        onSaved={load}
        person={openPerson}
      />

      <Dialog
        open={Boolean(quickDialog)}
        onOpenChange={(open) => !open && setQuickDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          {quickDialog?.kind === "DEADLINE" && (
            <>
              <DialogHeader>
                <DialogTitle>Scadenza prossimo contatto</DialogTitle>
                <DialogDescription>
                  Applica la data alle {selected.size} persone selezionate.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="next-contact-date">Data</Label>
                <Input
                  autoFocus
                  id="next-contact-date"
                  onChange={(event) => setQuickValue(event.target.value)}
                  type="date"
                  value={quickValue}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={actionBusy}
                  onClick={() => setQuickDialog(null)}
                  variant="outline"
                >
                  Annulla
                </Button>
                <Button
                  disabled={actionBusy || !quickValue}
                  onClick={saveDeadline}
                >
                  Salva scadenza
                </Button>
              </DialogFooter>
            </>
          )}

          {quickDialog?.kind === "PAYMENT" && (
            <>
              <DialogHeader>
                <DialogTitle>Verifica pagamento</DialogTitle>
                <DialogDescription>
                  Registra il metodo effettivamente ricevuto.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="verified-payment-method">Metodo</Label>
                <select
                  className={`${selectClass} w-full`}
                  id="verified-payment-method"
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value as "CASH" | "BANK_TRANSFER",
                    )
                  }
                  value={paymentMethod}
                >
                  <option value="BANK_TRANSFER">Bonifico</option>
                  <option value="CASH">Contanti</option>
                </select>
              </div>
              <DialogFooter>
                <Button
                  disabled={actionBusy}
                  onClick={() => setQuickDialog(null)}
                  variant="outline"
                >
                  Annulla
                </Button>
                <Button
                  disabled={actionBusy}
                  onClick={() => submitPayment(quickDialog.paymentId)}
                >
                  Verifica pagamento
                </Button>
              </DialogFooter>
            </>
          )}

          {quickDialog?.kind === "CERTIFICATE" && (
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
                  onChange={(event) => setQuickValue(event.target.value)}
                  placeholder="Es. documento illeggibile o non agonistico"
                  value={quickValue}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={actionBusy}
                  onClick={() => setQuickDialog(null)}
                  variant="outline"
                >
                  Annulla
                </Button>
                <Button
                  disabled={actionBusy || !quickValue.trim()}
                  onClick={() =>
                    submitCertificateReview(
                      quickDialog.certificateId,
                      false,
                    )
                  }
                  variant="destructive"
                >
                  Respingi certificato
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(rejectRequestId)}
        onOpenChange={(open) => !open && setRejectRequestId(null)}
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
            <AlertDialogCancel disabled={actionBusy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={actionBusy}
              onClick={(event) => {
                event.preventDefault()
                if (rejectRequestId) {
                  void submitAccountAction(rejectRequestId, "REJECT")
                }
              }}
            >
              Elimina account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AccessState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md items-center px-4 text-center">
      <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
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
