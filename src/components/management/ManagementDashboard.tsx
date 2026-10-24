"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Search } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { AddPersonDialog } from "@/components/management/AddPersonDialog"
import { BulkPaymentDialog } from "@/components/management/BulkPaymentDialog"
import { ColumnCustomizer } from "@/components/management/ColumnCustomizer"
import { ViewMenu } from "@/components/management/ViewMenu"
import {
  ColumnFilters,
  SortControl,
} from "@/components/management/ColumnFilters"
import {
  getAvailableManagementColumns,
  getManagementColumnAccessors,
} from "@/components/management/managementColumns"
import { ManagementTable } from "@/components/management/ManagementTable"
import { NotificationComposer } from "@/components/management/NotificationComposer"
import {
  AccessState,
  DashboardActions,
  GroupChips,
  QuickActionDialog,
  RejectAccountDialog,
  SelectionBar,
  ViewTabs,
  type QuickDialog,
} from "@/components/management/ManagementDashboardParts"
import {
  useManagementPreferences,
  usePassportPhotoStates,
  useSeasonAttendance,
} from "@/components/management/managementDashboardHooks"
import { PersonDrawer } from "@/components/management/PersonDrawer"
import { TrashDialog } from "@/components/management/TrashDialog"
import { PaymentSettingsDialog } from "@/components/payments/PaymentSettingsDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import {
  filterManagementRows,
  managementKpis,
  personGroup,
  viewGroups,
  type ManagementFilters,
  type ManagementPerson,
} from "@/lib/management"
import {
  fetchManagementPeople,
} from "@/lib/management-api"
import { isInjuredOn } from "@/lib/injuries"
import { romeDateKey } from "@/lib/season"
import {
  activeColumnFilters,
  applyTableState,
  DEFAULT_COLUMNS,
  nextSort,
  isBuiltInView,
  type CustomView,
  type DisplayPreferences,
  type ManagementColumnFilters,
  type ManagementLayout,
  type ManagementView,
  type TableSort,
} from "@/lib/management-columns"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

const selectClass =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const views = [
  { id: "PEOPLE", label: "Persone" },
  { id: "ATTENDANCE", label: "Presenze" },
  { id: "INJURIES", label: "Infermeria" },
  { id: "PAYMENTS", label: "Quote" },
  { id: "REGISTRATIONS", label: "Tesseramenti" },
  { id: "CERTIFICATES", label: "Certificati" },
  { id: "ACCOUNTS", label: "Account" },
] satisfies Array<{ id: ManagementView; label: string }>


const emptyFilters: ManagementFilters = {
  query: "",
  archived: false,
}

type RosterLoadError = {
  seasonSlug: string
}

function forgetViewSettings(
  display: DisplayPreferences,
  id: string,
): DisplayPreferences {
  const layouts = { ...display.layouts }
  const sorts = { ...display.sorts }
  const widths = { ...display.widths }
  delete layouts[id]
  delete sorts[id]
  delete widths[id]
  return { ...display, layouts, sorts, widths }
}

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
  const [loadedSeasonSlug, setLoadedSeasonSlug] = useState<string | null>(null)
  const [rosterLoadError, setRosterLoadError] =
    useState<RosterLoadError | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const {
    display,
    updateDisplay,
    columnPreferences,
    columnPreferencesReady,
    updateColumnPreferences,
  } = useManagementPreferences(profile?.id)
  // Filtri delle viste predefinite: temporanei. Le personalizzate li salvano.
  const [transientFilters, setTransientFilters] =
    useState<ManagementColumnFilters>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPerson, setOpenPerson] = useState<ManagementPerson | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const [quickDialog, setQuickDialog] = useState<QuickDialog | null>(null)
  const [quickValue, setQuickValue] = useState("")
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const rosterLoadGeneration = useRef(0)

  useEffect(() => {
    if (targetSeason?.slug) {
      rosterLoadGeneration.current += 1
      setLoading(true)
      setLoadedSeasonSlug(null)
      setRosterLoadError(null)
      setSelected(new Set())
      setSeasonSlug(targetSeason.slug)
    }
  }, [targetSeason?.slug])

  const load = useCallback(async () => {
    if (!isManager) return
    const generation = ++rosterLoadGeneration.current
    setLoading(true)
    setLoadedSeasonSlug(null)
    setRosterLoadError(null)
    setSelected(new Set())
    try {
      const nextPeople = await fetchManagementPeople(
        supabaseBrowser,
        seasonSlug,
      )
      if (generation !== rosterLoadGeneration.current) return
      setPeople(nextPeople)
      setLoadedSeasonSlug(seasonSlug)
    } catch {
      if (generation !== rosterLoadGeneration.current) return
      setRosterLoadError({ seasonSlug })
    } finally {
      if (generation === rosterLoadGeneration.current) {
        setLoading(false)
      }
    }
  }, [isManager, seasonSlug])

  useEffect(() => {
    void load()
  }, [load])

  const customView =
    display.customViews.find(({ id }) => id === display.view) ?? null
  // Una personalizzata eliminata altrove ricade sulla vista Persone.
  const view: string =
    customView || isBuiltInView(display.view) ? display.view : "PEOPLE"
  const builtInView = isBuiltInView(view) ? view : null
  const visibleColumnIds = customView
    ? customView.columns
    : columnPreferences[builtInView ?? "PEOPLE"]
  const layout: ManagementLayout = display.layouts[view] ?? "TABLE"
  const sort: TableSort = display.sorts[view] ?? null
  const columnWidths = display.widths[view] ?? {}
  const columnFilters = customView ? customView.filters : transientFilters
  const showsPassportPhotos = visibleColumnIds.includes("passportPhoto")

  const currentRosterLoaded =
    !loading &&
    loadedSeasonSlug === seasonSlug &&
    rosterLoadError?.seasonSlug !== seasonSlug
  const currentPeople = useMemo(
    () => (currentRosterLoaded ? people : []),
    [currentRosterLoaded, people],
  )
  const attendance = useSeasonAttendance(
    seasonSlug,
    currentPeople,
    !loading && loadedSeasonSlug === seasonSlug,
  )
  const attendanceState = attendance.state

  const peopleWithAttendance = useMemo(() => {
    if (attendanceState?.status !== "loaded") return currentPeople
    return currentPeople.map((person) => ({
      ...person,
      attendance: attendanceState.summaries.get(person.profileId),
    }))
  }, [attendanceState, currentPeople])

  const passportPhotoStates = usePassportPhotoStates(
    currentPeople,
    showsPassportPhotos && !loading && loadedSeasonSlug === seasonSlug,
  )

  const groups = viewGroups(view)
  const tablePeople = useMemo(
    () =>
      peopleWithAttendance.filter(
        (person) =>
          viewGroups(view).includes(personGroup(person)) &&
          (view !== "INJURIES" || Boolean(person.injuries?.length)),
      ),
    [peopleWithAttendance, view],
  )
  const filtered = useMemo(
    () => filterManagementRows(tablePeople, filters),
    [filters, tablePeople],
  )
  const availableColumns = useMemo(
    () => getAvailableManagementColumns(),
    [],
  )
  const visibleColumns = useMemo(() => {
    const byId = new Map(availableColumns.map((column) => [column.id, column]))
    return visibleColumnIds.flatMap((id) => {
      const column = byId.get(id)
      return column ? [column] : []
    })
  }, [availableColumns, visibleColumnIds])
  const filterableColumns = useMemo(
    () => visibleColumns.filter(({ filter }) => Boolean(filter)),
    [visibleColumns],
  )
  const sortableColumns = useMemo(
    () => visibleColumns.filter(({ action }) => !action),
    [visibleColumns],
  )
  const accessors = useMemo(() => getManagementColumnAccessors(), [])
  const appliedFilters = useMemo(
    () => activeColumnFilters(columnFilters, visibleColumnIds),
    [columnFilters, visibleColumnIds],
  )
  // Un ordinamento su una colonna nascosta resterebbe invisibile: cade.
  const appliedSort =
    sort && visibleColumnIds.includes(sort.columnId) ? sort : null
  const visiblePeople = useMemo(
    () => applyTableState(filtered, accessors, appliedFilters, appliedSort),
    [accessors, appliedFilters, appliedSort, filtered],
  )
  const visibleIdsKey = visiblePeople.map(({ id }) => id).join(",")

  // Le azioni di massa agiscono solo su ciò che il manager sta vedendo.
  useEffect(() => {
    setSelected((current) => {
      if (!current.size) return current
      const visibleIds = new Set(visibleIdsKey ? visibleIdsKey.split(",") : [])
      const next = new Set(
        [...current].filter((id) => visibleIds.has(id)),
      )
      return next.size === current.size ? current : next
    })
  }, [visibleIdsKey])

  const selectedPeople = useMemo(
    () => visiblePeople.filter(({ id }) => selected.has(id)),
    [selected, visiblePeople],
  )
  const selectedMembershipIds = selectedPeople.map(({ id }) => id)
  // Lo staff non paga quote: resta fuori anche se selezionato in Persone.
  const payableMembershipIds = selectedPeople
    .filter((person) => personGroup(person) !== "STAFF")
    .map(({ id }) => id)
  const selectedUserIds = selectedPeople
    .map(({ userId }) => userId)
    .filter((id): id is string => Boolean(id))
  const kpis = managementKpis(currentPeople)
  const viewCounts: Record<ManagementView, number> = {
    PEOPLE: kpis.total,
    ATTENDANCE: currentPeople.filter(
      ({ category, status }) => category === "PLAYER" && status !== "NO",
    ).length,
    // Quanti sono KO oggi; la vista elenca chiunque abbia una storia.
    INJURIES: currentPeople.filter(({ injuries }) =>
      isInjuredOn(injuries ?? [], romeDateKey(new Date())),
    ).length,
    PAYMENTS: kpis.paymentsOpen,
    REGISTRATIONS: kpis.registrationsOpen,
    CERTIFICATES: kpis.certificatesOpen,
    ACCOUNTS: kpis.accountsOpen,
  }

  function updateColumns(nextColumns: string[]) {
    if (customView) {
      updateCustomView(customView.id, { columns: nextColumns })
      return
    }
    updateColumnPreferences((current) => ({
      ...current,
      [builtInView ?? "PEOPLE"]: nextColumns,
    }))
  }

  function changeSort(next: TableSort) {
    updateDisplay((current) => ({
      ...current,
      sorts: { ...current.sorts, [view]: next },
    }))
  }

  function changeLayout(next: ManagementLayout) {
    updateDisplay((current) => ({
      ...current,
      layouts: { ...current.layouts, [view]: next },
    }))
  }

  function resizeColumn(columnId: string, width: number | null) {
    updateDisplay((current) => {
      const viewWidths = { ...(current.widths[view] ?? {}) }
      if (width === null) delete viewWidths[columnId]
      else viewWidths[columnId] = width
      return { ...current, widths: { ...current.widths, [view]: viewWidths } }
    })
  }

  function updateCustomView(
    id: string,
    patch: Partial<Omit<CustomView, "id">>,
  ) {
    updateDisplay((current) => ({
      ...current,
      customViews: current.customViews.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }))
  }

  function changeColumnFilters(next: ManagementColumnFilters) {
    if (customView) updateCustomView(customView.id, { filters: next })
    else setTransientFilters(next)
  }

  /** Nuova vista personalizzata a partire da quello che si sta guardando. */
  function createView(label: string) {
    const id = `custom-${crypto.randomUUID()}`
    // Solo i filtri visibili e valorizzati: uno su colonna nascosta tornerebbe attivo di nascosto.
    const filters = { ...appliedFilters }
    updateDisplay((current) => ({
      ...current,
      view: id,
      customViews: [
        ...current.customViews,
        { id, label, columns: [...visibleColumnIds], filters },
      ],
      layouts: { ...current.layouts, [id]: layout },
      sorts: { ...current.sorts, [id]: sort },
      widths: { ...current.widths, [id]: { ...columnWidths } },
    }))
    setTransientFilters({})
  }

  function deleteView(id: string) {
    updateDisplay((current) => ({
      ...forgetViewSettings(current, id),
      view: current.view === id ? "PEOPLE" : current.view,
      customViews: current.customViews.filter((item) => item.id !== id),
    }))
  }

  /** Predefinita come appena installata: colonne, layout, ordine, larghezze. */
  function resetBuiltInView(id: ManagementView) {
    updateColumns([...DEFAULT_COLUMNS[id]])
    setTransientFilters({})
    updateDisplay((current) => forgetViewSettings(current, id))
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

  function selectView(nextView: string) {
    if (nextView === view) return
    // I filtri temporanei valgono per la vista che si lascia; ordinamento,
    // layout e larghezze salvati tornano com'erano.
    setTransientFilters({})
    setFilters((current) => ({ ...current, group: undefined }))
    updateDisplay((current) => ({ ...current, view: nextView }))
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
    if (!currentRosterLoaded || !selectedMembershipIds.length) {
      toast.error("Seleziona almeno una persona")
      return
    }
    setQuickValue("")
    setQuickDialog({ kind: "DEADLINE" })
  }

  async function saveDeadline() {
    if (
      !currentRosterLoaded ||
      !quickValue ||
      !selectedMembershipIds.length
    ) {
      setQuickDialog(null)
      return
    }
    setActionBusy(true)
    const { error } = await supabaseBrowser
      .from("season_memberships")
      .update({ next_contact_on: quickValue, updated_by: profile?.id })
      .in("id", selectedMembershipIds)
    setActionBusy(false)
    if (error) {
      toast.error("Scadenza non aggiornata", { description: error.message })
      return
    }
    toast.success("Scadenza aggiornata")
    setQuickDialog(null)
    await load()
  }

  async function setArchived(archived: boolean) {
    if (!currentRosterLoaded || !selectedMembershipIds.length) {
      toast.error("Seleziona almeno una persona")
      return
    }
    setActionBusy(true)
    const { error } = await supabaseBrowser
      .from("season_memberships")
      .update({ status: archived ? "NO" : "YES", updated_by: profile?.id })
      .in("id", selectedMembershipIds)
    setActionBusy(false)
    if (error) {
      toast.error(
        archived ? "Archiviazione non riuscita" : "Ripristino non riuscito",
        { description: error.message },
      )
      return
    }
    toast.success(
      archived
        ? `${selectedMembershipIds.length} archiviati`
        : `${selectedMembershipIds.length} rimessi in rosa`,
    )
    setSelected(new Set())
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

  // Il tasto rapido conferma tutti i versamenti in attesa della rata; per
  // confermarli o rifiutarli uno a uno c'è la scheda persona.
  async function verifyPayment(paymentId: string) {
    setActionBusy(true)
    const { data: pending, error: pendingError } = await supabaseBrowser
      .from("payment_entries")
      .select("id")
      .eq("payment_id", paymentId)
      .eq("status", "PENDING")
    let error = pendingError
    for (const entry of pending ?? []) {
      if (error) break
      ;({ error } = await supabaseBrowser.rpc("manager_review_payment_entry", {
        p_entry_id: entry.id,
        p_status: "VERIFIED",
      }))
    }
    setActionBusy(false)
    if (error) {
      toast.error("Pagamento non verificato", { description: error.message })
      return
    }
    toast.success("Pagamento verificato")
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
          <DashboardActions
            onAdd={() => setAddOpen(true)}
            onBank={view === "PAYMENTS" ? () => setBankOpen(true) : undefined}
            onTrash={() => setTrashOpen(true)}
          />
        }
        context={
          <select
            aria-label="Stagione"
            className={selectClass}
            onChange={(event) => {
              rosterLoadGeneration.current += 1
              setLoading(true)
              setLoadedSeasonSlug(null)
              setRosterLoadError(null)
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

      <div className="sticky top-16 z-20 min-w-0 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
        <ViewTabs
          counts={viewCounts}
          customViews={display.customViews}
          onSelect={selectView}
          view={view}
          views={views}
        />
        {groups.length > 1 && (
          <GroupChips
            countFor={(group) =>
              filterManagementRows(tablePeople, { ...filters, query: "", group }).length
            }
            groups={groups}
            onSelect={(group) => {
              setSelected(new Set())
              setFilters((current) => ({ ...current, group }))
            }}
            selected={filters.group}
          />
        )}
        <div
          aria-label="Strumenti dashboard"
          className="mt-1.5 flex min-w-0 items-center gap-1 border-t pt-1.5"
          role="group"
        >
          <label className="relative min-w-0 flex-1 xl:max-w-80">
            <span className="sr-only">Cerca persone</span>
            <Search
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-8 pl-8"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Nome o telefono"
              type="search"
              value={filters.query}
            />
          </label>
          <label
            className={cn(
              "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border focus-within:ring-2 focus-within:ring-ring",
              layout === "TABLE" && "md:hidden",
            )}
          >
            <input
              aria-label="Seleziona visibili"
              checked={
                visiblePeople.length > 0 &&
                selectedPeople.length === visiblePeople.length
              }
              className="size-4 accent-operative"
              disabled={!currentRosterLoaded || !visiblePeople.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? new Set(visiblePeople.map(({ id }) => id))
                    : new Set(),
                )
              }
              type="checkbox"
            />
          </label>
          <ColumnFilters
            columns={filterableColumns}
            disabled={!columnPreferencesReady}
            onChange={(columnId, value) =>
              changeColumnFilters({ ...columnFilters, [columnId]: value })
            }
            onReset={() => changeColumnFilters({})}
            values={columnFilters}
          />
          <Button
            aria-label={
              filters.archived ? "Nascondi archiviati" : "Mostra archiviati"
            }
            aria-pressed={Boolean(filters.archived)}
            className="shrink-0 px-2"
            onClick={() => {
              setSelected(new Set())
              setFilters((current) => ({
                ...current,
                archived: !current.archived,
              }))
            }}
            size="sm"
            variant={filters.archived ? "default" : "outline"}
          >
            <Archive aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Archiviati</span>
            <span className="text-[10px] tabular-nums opacity-70">
              {kpis.archived}
            </span>
          </Button>
          <SortControl
            className={cn("shrink-0", layout === "TABLE" && "md:hidden")}
            columns={sortableColumns}
            onChange={changeSort}
            sort={appliedSort}
          />
          <span className="hidden shrink-0 whitespace-nowrap pl-1 text-xs tabular-nums text-muted-foreground lg:inline">
            {visiblePeople.length} risultati · {selectedPeople.length}{" "}
            selezionati
          </span>
          <ViewMenu
            custom={Boolean(customView)}
            disabled={!columnPreferencesReady}
            key={view}
            layout={layout}
            onCreate={createView}
            onDelete={() => customView && deleteView(customView.id)}
            onLayoutChange={changeLayout}
            onRename={(label) =>
              customView && updateCustomView(customView.id, { label })
            }
            onReset={() => builtInView && resetBuiltInView(builtInView)}
            viewLabel={
              customView?.label ??
              views.find(({ id }) => id === builtInView)?.label ??
              "Vista"
            }
          >
            <ColumnCustomizer
              availableColumns={availableColumns}
              columns={visibleColumnIds}
              disabled={!columnPreferencesReady}
              onChange={updateColumns}
              onReset={() =>
                updateColumns([
                  ...DEFAULT_COLUMNS[builtInView ?? "PEOPLE"],
                ])
              }
            />
          </ViewMenu>
        </div>
      </div>

      {rosterLoadError?.seasonSlug === seasonSlug ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold">
            Rosa della stagione {seasonSlug.replace("-", "–")} non disponibile
          </p>
          <Button
            className="mt-3"
            onClick={() => void load()}
            size="sm"
            variant="outline"
          >
            Riprova
          </Button>
        </div>
      ) : loading ||
      !currentRosterLoaded ||
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
            onClick={attendance.retry}
            size="sm"
            variant="outline"
          >
            Riprova
          </Button>
        </div>
      ) : (
        <ManagementTable
          columns={visibleColumnIds}
          layout={layout}
          onAccountAction={accountAction}
          onOpen={setOpenPerson}
          onReviewCertificate={reviewCertificate}
          onSelect={toggleSelection}
          onSelectAllVisible={(checked) =>
            setSelected(
              checked
                ? new Set(visiblePeople.map(({ id }) => id))
                : new Set(),
            )
          }
          onSortChange={(columnId) =>
            changeSort(nextSort(appliedSort, columnId))
          }
          onVerifyPayment={verifyPayment}
          passportPhotoStates={passportPhotoStates}
          people={visiblePeople}
          selected={selected}
          onResizeColumn={resizeColumn}
          sort={appliedSort}
          widths={columnWidths}
        />
      )}

      {selectedPeople.length > 0 && (
        <SelectionBar
          archived={Boolean(filters.archived)}
          busy={actionBusy}
          count={selectedPeople.length}
          onArchive={() => void setArchived(!filters.archived)}
          onClear={() => setSelected(new Set())}
          onDeadline={applyDeadline}
          onNotify={() =>
            selectedUserIds.length
              ? setNotificationOpen(true)
              : toast.error("Nessun selezionato ha un account attivo")
          }
          onPayment={() => {
            if (!payableMembershipIds.length) {
              toast.error("Lo staff non paga quote")
              return
            }
            setPaymentOpen(true)
          }}
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
        membershipIds={currentRosterLoaded ? payableMembershipIds : []}
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
        onAccountAction={(requestId, action) => void accountAction(requestId, action)}
        onOpenChange={(open) => !open && setOpenPerson(null)}
        onSaved={load}
        person={
          openPerson
            ? (people.find(({ id }) => id === openPerson.id) ?? openPerson)
            : null
        }
      />
      <PaymentSettingsDialog
        managerProfileId={profile?.id ?? null}
        onOpenChange={setBankOpen}
        open={bankOpen}
      />
      <TrashDialog
        onOpenChange={setTrashOpen}
        onRestored={load}
        open={trashOpen}
      />

      <QuickActionDialog
        busy={actionBusy}
        dialog={quickDialog}
        onClose={() => setQuickDialog(null)}
        onRejectCertificate={(certificateId) => void submitCertificateReview(certificateId, false)}
        onSaveDeadline={() => void saveDeadline()}
        onValueChange={setQuickValue}
        selectedCount={selectedMembershipIds.length}
        value={quickValue}
      />

      <RejectAccountDialog
        busy={actionBusy}
        onClose={() => setRejectRequestId(null)}
        onConfirm={() => rejectRequestId && void submitAccountAction(rejectRequestId, "REJECT")}
        open={Boolean(rejectRequestId)}
      />
    </div>
  )
}
