"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BellPlus,
  CalendarClock,
  CircleDollarSign,
  Plus,
  Search,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { AddPersonDialog } from "@/components/management/AddPersonDialog"
import { BulkPaymentDialog } from "@/components/management/BulkPaymentDialog"
import { ColumnCustomizer } from "@/components/management/ColumnCustomizer"
import {
  getAvailableManagementColumns,
  ManagementTable,
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
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  filterManagementRows,
  managementKpis,
  type ManagementFilters,
  type ManagementPerson,
} from "@/lib/management"
import {
  fetchManagementAttendance,
  fetchManagementColumnPreferences,
  fetchManagementPeople,
  saveManagementColumnPreferences,
} from "@/lib/management-api"
import type { AttendanceSummary } from "@/lib/management-attendance"
import {
  DEFAULT_COLUMNS,
  normalizeColumnPreferences,
  type ManagementView,
} from "@/lib/management-columns"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

const selectClass =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const views = [
  { id: "PEOPLE", label: "Persone" },
  { id: "ATTENDANCE", label: "Presenze" },
  { id: "PAYMENTS", label: "Quote" },
  { id: "REGISTRATIONS", label: "Tesseramenti" },
  { id: "CERTIFICATES", label: "Certificati" },
  { id: "ACCOUNTS", label: "Account" },
] satisfies Array<{ id: ManagementView; label: string }>

const emptyFilters: ManagementFilters = {
  query: "",
}

type QuickDialog =
  | { kind: "DEADLINE" }
  | { kind: "PAYMENT"; paymentId: string }
  | { kind: "CERTIFICATE"; certificateId: string }

type AttendanceLoadState =
  | { status: "loading" }
  | { status: "loaded"; summaries: Map<string, AttendanceSummary> }
  | { status: "error"; message?: string }

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
  const [view, setView] = useState<ManagementView>("PEOPLE")
  const [filters, setFilters] = useState(emptyFilters)
  const [columnPreferences, setColumnPreferences] = useState(() =>
    normalizeColumnPreferences(null),
  )
  const [attendanceBySeason, setAttendanceBySeason] = useState<
    Record<string, AttendanceLoadState>
  >({})
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

  useEffect(() => {
    if (!profile?.id) return
    let active = true

    void (async () => {
      try {
        const next = normalizeColumnPreferences(
          await fetchManagementColumnPreferences(
            supabaseBrowser,
            profile.id,
          ),
        )
        if (active) setColumnPreferences(next)
      } catch {
        if (active) {
          setColumnPreferences(normalizeColumnPreferences(null))
        }
      }
    })()

    return () => {
      active = false
    }
  }, [profile?.id])

  const attendanceState = attendanceBySeason[seasonSlug]

  useEffect(() => {
    if (
      view !== "ATTENDANCE" ||
      loading ||
      attendanceBySeason[seasonSlug]
    ) {
      return
    }

    setAttendanceBySeason((current) => ({
      ...current,
      [seasonSlug]: { status: "loading" },
    }))

    void fetchManagementAttendance(supabaseBrowser, seasonSlug, people)
      .then((summaries) => {
        setAttendanceBySeason((current) => ({
          ...current,
          [seasonSlug]: { status: "loaded", summaries },
        }))
      })
      .catch((error) => {
        setAttendanceBySeason((current) => ({
          ...current,
          [seasonSlug]: {
            status: "error",
            message: error instanceof Error ? error.message : undefined,
          },
        }))
      })
  }, [attendanceBySeason, loading, people, seasonSlug, view])

  const peopleWithAttendance = useMemo(() => {
    if (attendanceState?.status !== "loaded") return people
    return people.map((person) => ({
      ...person,
      attendance: attendanceState.summaries.get(person.profileId),
    }))
  }, [attendanceState, people])

  const tablePeople = useMemo(
    () =>
      view === "ATTENDANCE"
        ? peopleWithAttendance.filter(({ category }) => category === "PLAYER")
        : peopleWithAttendance,
    [peopleWithAttendance, view],
  )
  const filtered = useMemo(
    () => filterManagementRows(tablePeople, filters),
    [filters, tablePeople],
  )
  const selectedPeople = useMemo(
    () => people.filter(({ id }) => selected.has(id)),
    [people, selected],
  )
  const selectedUserIds = selectedPeople
    .map(({ userId }) => userId)
    .filter((id): id is string => Boolean(id))
  const kpis = managementKpis(people)
  const viewCounts: Record<ManagementView, number> = {
    PEOPLE: kpis.total,
    ATTENDANCE: people.filter(({ category }) => category === "PLAYER").length,
    PAYMENTS: kpis.paymentsOpen,
    REGISTRATIONS: kpis.registrationsOpen,
    CERTIFICATES: kpis.certificatesOpen,
    ACCOUNTS: kpis.accountsOpen,
  }
  const availableColumns = getAvailableManagementColumns(view)

  async function updateColumns(nextColumns: string[]) {
    const next = {
      ...columnPreferences,
      [view]: nextColumns,
    }
    setColumnPreferences(next)
    if (!profile?.id) return
    try {
      await saveManagementColumnPreferences(
        supabaseBrowser,
        profile.id,
        next,
      )
    } catch {
      toast.error("Preferenze colonne non salvate")
    }
  }

  if (sessionLoading) {
    return (
      <div className="grid gap-3">
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
    <div className="min-h-screen space-y-3">
      <PageTitleBar
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Aggiungi persona"
                  className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                  onClick={() => setAddOpen(true)}
                  size="sm"
                >
                  <Plus aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Persona</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Aggiungi persona</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Registra quota"
                  className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                  onClick={() =>
                    selected.size
                      ? setPaymentOpen(true)
                      : toast.error("Seleziona almeno una persona")
                  }
                  size="sm"
                  variant="outline"
                >
                  <CircleDollarSign aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Quota</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Registra quota</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Imposta scadenza"
                  className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                  onClick={applyDeadline}
                  size="sm"
                  variant="outline"
                >
                  <CalendarClock aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Scadenza</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Imposta scadenza</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Invia notifica"
                  className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                  onClick={() =>
                    selectedUserIds.length
                      ? setNotificationOpen(true)
                      : toast.error("Seleziona persone con un account attivo")
                  }
                  size="sm"
                  variant="outline"
                >
                  <BellPlus aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Notifica</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Invia notifica</TooltipContent>
            </Tooltip>
          </>
        }
        context={
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
        }
        subtitle="Sala operativa"
        title="Gestione"
      />

      <div className="sticky top-16 z-20 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
        <div
          aria-label="Viste dashboard"
          className="flex gap-1 overflow-x-auto"
          role="tablist"
        >
          {views.map((item) => (
            <button
              aria-selected={view === item.id}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              <span
                className={cn(
                  "rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground",
                  view === item.id &&
                    "bg-primary-foreground/15 text-primary-foreground",
                )}
              >
                {viewCounts[item.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
          <label className="relative min-w-48 flex-1 xl:max-w-80">
            <span className="sr-only">Cerca persone</span>
            <Search
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-9 pl-8"
              onChange={(event) =>
                setFilters({ query: event.target.value })
              }
              placeholder="Cerca persona, telefono…"
              value={filters.query}
            />
          </label>
          <ColumnCustomizer
            availableColumns={availableColumns}
            columns={columnPreferences[view]}
            onChange={(columns) => void updateColumns(columns)}
            onReset={() =>
              void updateColumns([...DEFAULT_COLUMNS[view]])
            }
          />
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

      {loading ||
      (view === "ATTENDANCE" &&
        attendanceState?.status === "loading") ? (
        <div className="grid gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton className="h-11 w-full" key={index} />
          ))}
        </div>
      ) : view === "ATTENDANCE" &&
        attendanceState?.status === "error" ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold">Presenze non disponibili</p>
          {attendanceState.message && (
            <p className="mt-1 text-xs text-muted-foreground">
              {attendanceState.message}
            </p>
          )}
          <Button
            className="mt-3"
            onClick={() =>
              setAttendanceBySeason((current) => {
                const next = { ...current }
                delete next[seasonSlug]
                return next
              })
            }
            size="sm"
            variant="outline"
          >
            Riprova
          </Button>
        </div>
      ) : (
        <ManagementTable
          columns={columnPreferences[view]}
          key={view}
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
