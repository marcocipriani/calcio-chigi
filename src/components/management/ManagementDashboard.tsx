"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
  BellPlus,
  CalendarClock,
  CircleDollarSign,
  Plus,
  Search,
  Shirt,
  Trash2,
  UsersRound,
  X,
} from "lucide-react"
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
  ManagementTable,
} from "@/components/management/ManagementTable"
import { NotificationComposer } from "@/components/management/NotificationComposer"
import type { PassportPhotoState } from "@/components/management/PassportPhotoPreview"
import { PersonDrawer } from "@/components/management/PersonDrawer"
import { TrashDialog } from "@/components/management/TrashDialog"
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
  fetchManagementDisplayPreferences,
  fetchManagementPeople,
  saveManagementColumnPreferences,
  saveManagementDisplayPreferences,
} from "@/lib/management-api"
import type { AttendanceSummary } from "@/lib/management-attendance"
import {
  activeColumnFilters,
  applyTableState,
  DEFAULT_COLUMNS,
  nextSort,
  normalizeColumnPreferences,
  normalizeDisplayPreferences,
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
  { id: "PAYMENTS", label: "Quote" },
  { id: "REGISTRATIONS", label: "Tesseramenti" },
  { id: "CERTIFICATES", label: "Certificati" },
  { id: "ACCOUNTS", label: "Account" },
] satisfies Array<{ id: ManagementView; label: string }>


const emptyFilters: ManagementFilters = {
  query: "",
  archived: false,
}

type QuickDialog =
  | { kind: "DEADLINE" }
  | { kind: "PAYMENT"; paymentId: string }
  | { kind: "CERTIFICATE"; certificateId: string }

type AttendanceLoadState =
  | { status: "loading"; signature: string; requestId: number }
  | {
      status: "loaded"
      signature: string
      requestId: number
      summaries: Map<string, AttendanceSummary>
    }
  | {
      status: "error"
      signature: string
      requestId: number
      message?: string
    }

type RosterLoadError = {
  seasonSlug: string
}

function attendanceRosterSignature(people: ManagementPerson[]) {
  return people
    .filter(({ category }) => category === "PLAYER")
    .map(({ profileId, joinedOn }) => `${profileId}:${joinedOn ?? ""}`)
    .sort()
    .join("|")
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
  const [display, setDisplay] = useState<DisplayPreferences>(() =>
    normalizeDisplayPreferences(null),
  )
  const [filters, setFilters] = useState(emptyFilters)
  const [columnPreferences, setColumnPreferences] = useState(() =>
    normalizeColumnPreferences(null),
  )
  const [columnPreferencesReady, setColumnPreferencesReady] = useState(false)
  const [attendanceBySeason, setAttendanceBySeason] = useState<
    Record<string, AttendanceLoadState>
  >({})
  const [passportPhotoStates, setPassportPhotoStates] = useState<
    Map<string, PassportPhotoState>
  >(new Map())
  // Filtri delle viste predefinite: temporanei. Le personalizzate li salvano.
  const [transientFilters, setTransientFilters] =
    useState<ManagementColumnFilters>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPerson, setOpenPerson] = useState<ManagementPerson | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [quickDialog, setQuickDialog] = useState<QuickDialog | null>(null)
  const [quickValue, setQuickValue] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER"
  >("BANK_TRANSFER")
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const rosterLoadGeneration = useRef(0)
  const attendanceRequestId = useRef(0)
  const passportPhotoRequestId = useRef(0)
  const preferencesLoadGeneration = useRef(0)
  const columnPreferencesRef = useRef(columnPreferences)
  const displayPreferencesRef = useRef(display)
  const preferenceSaveQueue = useRef<Promise<void>>(Promise.resolve())

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

  useEffect(() => {
    if (!profile?.id) return
    const generation = ++preferencesLoadGeneration.current
    setColumnPreferencesReady(false)

    void (async () => {
      try {
        const [storedColumns, storedDisplay] = await Promise.all([
          fetchManagementColumnPreferences(supabaseBrowser, profile.id),
          fetchManagementDisplayPreferences(supabaseBrowser, profile.id),
        ])
        const next = normalizeColumnPreferences(storedColumns)
        const display = normalizeDisplayPreferences(storedDisplay)
        if (generation !== preferencesLoadGeneration.current) return
        columnPreferencesRef.current = next
        setColumnPreferences(next)
        displayPreferencesRef.current = display
        setDisplay(display)
      } catch {
        if (generation !== preferencesLoadGeneration.current) return
        const fallback = normalizeColumnPreferences(null)
        columnPreferencesRef.current = fallback
        setColumnPreferences(fallback)
      } finally {
        if (generation === preferencesLoadGeneration.current) {
          setColumnPreferencesReady(true)
        }
      }
    })()

    return () => {
      if (generation === preferencesLoadGeneration.current) {
        preferencesLoadGeneration.current += 1
      }
    }
  }, [profile?.id])

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
  const rosterSignature = useMemo(
    () => attendanceRosterSignature(currentPeople),
    [currentPeople],
  )
  const cachedAttendanceState = attendanceBySeason[seasonSlug]
  const attendanceState =
    cachedAttendanceState?.signature === rosterSignature
      ? cachedAttendanceState
      : undefined

  useEffect(() => {
    // Caricate sempre (non solo nella vista "Presenze"): la scheda persona
    // le mostra da qualunque vista si apra.
    if (
      loading ||
      loadedSeasonSlug !== seasonSlug ||
      cachedAttendanceState?.signature === rosterSignature
    ) {
      return
    }

    const requestId = ++attendanceRequestId.current
    setAttendanceBySeason((current) => ({
      ...current,
      [seasonSlug]: {
        status: "loading",
        signature: rosterSignature,
        requestId,
      },
    }))

    void fetchManagementAttendance(supabaseBrowser, seasonSlug, currentPeople)
      .then((summaries) => {
        setAttendanceBySeason((current) => {
          if (current[seasonSlug]?.requestId !== requestId) return current
          return {
            ...current,
            [seasonSlug]: {
              status: "loaded",
              signature: rosterSignature,
              requestId,
              summaries,
            },
          }
        })
      })
      .catch((error) => {
        setAttendanceBySeason((current) => {
          if (current[seasonSlug]?.requestId !== requestId) return current
          return {
            ...current,
            [seasonSlug]: {
              status: "error",
              signature: rosterSignature,
              requestId,
              message: error instanceof Error ? error.message : undefined,
            },
          }
        })
      })
  }, [
    cachedAttendanceState,
    loadedSeasonSlug,
    loading,
    currentPeople,
    rosterSignature,
    seasonSlug,
  ])

  const peopleWithAttendance = useMemo(() => {
    if (attendanceState?.status !== "loaded") return currentPeople
    return currentPeople.map((person) => ({
      ...person,
      attendance: attendanceState.summaries.get(person.profileId),
    }))
  }, [attendanceState, currentPeople])

  useEffect(() => {
    const requestId = ++passportPhotoRequestId.current
    if (!showsPassportPhotos || loading || loadedSeasonSlug !== seasonSlug) {
      setPassportPhotoStates(new Map())
      return
    }

    const paths = [
      ...new Set(
        currentPeople.flatMap(({ passportPhotoPath }) =>
          passportPhotoPath ? [passportPhotoPath] : [],
        ),
      ),
    ]
    setPassportPhotoStates(
      new Map<string, PassportPhotoState>(
        paths.map((path) => [path, { status: "loading" }]),
      ),
    )

    void (async () => {
      const { data, error } = paths.length
        ? await supabaseBrowser.storage
            .from("passport-photos")
            .createSignedUrls(paths, 300)
        : { data: [], error: null }
      if (requestId !== passportPhotoRequestId.current) return
      if (error) {
        toast.error("Anteprime fototessera non disponibili")
        setPassportPhotoStates(
          new Map<string, PassportPhotoState>(
            paths.map((path) => [path, { status: "unavailable" }]),
          ),
        )
        return
      }
      const resultsByPath = new Map(
        (data ?? []).flatMap((item) =>
          item.path ? [[item.path, item] as const] : [],
        ),
      )
      setPassportPhotoStates(
        new Map(
          paths.map((path) => {
            const result = resultsByPath.get(path)
            const state: PassportPhotoState =
              result?.signedUrl && !result.error
                ? { status: "ready", signedUrl: result.signedUrl }
                : { status: "unavailable" }
            return [path, state]
          }),
        ),
      )
    })()
  }, [currentPeople, loadedSeasonSlug, loading, seasonSlug, showsPassportPhotos])

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
  const selectedUserIds = selectedPeople
    .map(({ userId }) => userId)
    .filter((id): id is string => Boolean(id))
  const kpis = managementKpis(currentPeople)
  const viewCounts: Record<ManagementView, number> = {
    PEOPLE: kpis.total,
    ATTENDANCE: currentPeople.filter(
      ({ category, status }) => category === "PLAYER" && status !== "NO",
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
    const next = {
      ...columnPreferencesRef.current,
      [builtInView ?? "PEOPLE"]: nextColumns,
    }
    columnPreferencesRef.current = next
    setColumnPreferences(next)
    if (!profile?.id) return
    const profileId = profile.id
    preferenceSaveQueue.current = preferenceSaveQueue.current.then(
      async () => {
        try {
          await saveManagementColumnPreferences(
            supabaseBrowser,
            profileId,
            next,
          )
        } catch {
          toast.error("Preferenze colonne non salvate")
        }
      },
    )
  }

  function updateDisplay(
    change: (current: DisplayPreferences) => DisplayPreferences,
  ) {
    const next = change(displayPreferencesRef.current)
    displayPreferencesRef.current = next
    setDisplay(next)
    if (!profile?.id) return
    const profileId = profile.id
    preferenceSaveQueue.current = preferenceSaveQueue.current.then(
      async () => {
        try {
          await saveManagementDisplayPreferences(
            supabaseBrowser,
            profileId,
            next,
          )
        } catch {
          // Solo comodità: la vista resta usabile anche senza salvataggio.
        }
      },
    )
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Cestino"
                  className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                  onClick={() => setTrashOpen(true)}
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
                  onClick={() => setAddOpen(true)}
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
        <div className="flex min-w-0 items-start gap-1">
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
              onClick={() => selectView(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
              <span
                className={cn(
                  "rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground",
                  view === item.id &&
                    "bg-operative-foreground/15 text-operative-foreground",
                )}
              >
                {viewCounts[item.id]}
              </span>
            </button>
          ))}
          {display.customViews.map((item) => (
            <button
              aria-selected={view === item.id}
              className={cn(
                "inline-flex min-h-8 min-w-0 shrink-0 items-center justify-center rounded-md border border-dashed px-2 text-xs font-semibold sm:justify-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === item.id
                  ? "border-transparent bg-operative text-operative-foreground hover:bg-operative/90"
                  : "text-muted-foreground hover:bg-operative/10 hover:text-operative",
              )}
              key={item.id}
              onClick={() => selectView(item.id)}
              role="tab"
              type="button"
            >
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
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
        />
        </div>
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
          <ColumnFilters
            columns={filterableColumns}
            disabled={!columnPreferencesReady}
            onChange={(columnId, value) =>
              changeColumnFilters({ ...columnFilters, [columnId]: value })
            }
            onReset={() => changeColumnFilters({})}
            values={columnFilters}
          />
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
              onClick={() => setSelected(new Set())}
              size="icon-sm"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {selectedPeople.length}
              <span className="sr-only sm:not-sr-only"> selezionati</span>
            </span>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <Button
                aria-label="Registra quota"
                disabled={actionBusy}
                onClick={() => setPaymentOpen(true)}
                size="sm"
                variant="outline"
              >
                <CircleDollarSign aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Quota</span>
              </Button>
              <Button
                aria-label="Imposta scadenza"
                disabled={actionBusy}
                onClick={applyDeadline}
                size="sm"
                variant="outline"
              >
                <CalendarClock aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Scadenza</span>
              </Button>
              <Button
                aria-label={
                  filters.archived
                    ? "Rimetti in rosa i selezionati"
                    : "Archivia i selezionati"
                }
                disabled={actionBusy}
                onClick={() => void setArchived(!filters.archived)}
                size="sm"
                variant="outline"
              >
                {filters.archived ? (
                  <ArchiveRestore aria-hidden="true" />
                ) : (
                  <Archive aria-hidden="true" />
                )}
                <span className="sr-only sm:not-sr-only">
                  {filters.archived ? "In rosa" : "Archivia"}
                </span>
              </Button>
              <Button
                aria-label="Invia notifica"
                disabled={actionBusy}
                onClick={() =>
                  selectedUserIds.length
                    ? setNotificationOpen(true)
                    : toast.error("Nessun selezionato ha un account attivo")
                }
                size="sm"
                variant="outline"
              >
                <BellPlus aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Notifica</span>
              </Button>
            </div>
          </div>
        </>
      )}

      <AddPersonDialog
        onOpenChange={setAddOpen}
        onSaved={load}
        open={addOpen}
        seasonSlug={seasonSlug}
      />
      <BulkPaymentDialog
        managerProfileId={profile?.id ?? ""}
        membershipIds={currentRosterLoaded ? selectedMembershipIds : []}
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
      <TrashDialog
        onOpenChange={setTrashOpen}
        onRestored={load}
        open={trashOpen}
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
                  Applica la data alle {selectedMembershipIds.length} persone
                  selezionate.
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
