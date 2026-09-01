"use client"

import { useEffect, useMemo, useRef, type ReactNode } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ShieldCheck,
  Shirt,
  X,
} from "lucide-react"

import { AttendanceStreak } from "@/components/management/AttendanceStreak"
import {
  PassportPhotoPreview,
  type PassportPhotoState,
} from "@/components/management/PassportPhotoPreview"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ManagementPerson } from "@/lib/management"
import {
  DEFAULT_COLUMNS,
  type ManagementLayout,
  type ManagementView,
  type TableSort,
} from "@/lib/management-columns"
import { ageGroupAt, cn } from "@/lib/utils"

const tone = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  bad: "bg-rose-500",
  neutral: "bg-slate-400",
}

function Dot({
  label,
  kind = "neutral",
}: {
  label: string
  kind?: keyof typeof tone
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span aria-hidden="true" className={cn("size-2 rounded-full", tone[kind])} />
      {label}
    </span>
  )
}

function PersonIdentity({
  person,
  accessibleJersey = true,
}: {
  person: ManagementPerson
  accessibleJersey?: boolean
}) {
  const role =
    person.category === "PLAYER"
      ? person.role ?? "Ruolo da assegnare"
      : person.staffFunction ?? "Staff"

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          alt=""
          className="object-cover"
          src={person.avatarUrl ?? undefined}
        />
        <AvatarFallback className="text-[10px] font-bold">
          {person.nome[0]}
          {person.cognome[0]}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {person.nome} {person.cognome}
        </span>
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          {role}
          {person.category === "PLAYER" && (
            <>
              {ageGroupAt(person.birthDate, new Date()) === "U35" && (
                <Badge className="h-4 border-0 bg-sky-100 px-1 text-[8px] text-sky-700 hover:bg-sky-100">
                  U35
                </Badge>
              )}
              <span
                aria-label={
                  accessibleJersey
                    ? `Numero maglia ${person.jerseyNumber ?? "non assegnato"}`
                    : undefined
                }
                className="inline-flex items-center gap-0.5"
              >
                <Shirt aria-hidden="true" className="size-3" />
                {person.jerseyNumber ?? "—"}
              </span>
            </>
          )}
        </span>
      </span>
    </div>
  )
}

function AccountState({ person }: { person: ManagementPerson }) {
  if (person.accountStatus === "ACTIVE") {
    return <Dot kind="good" label="Account attivo" />
  }
  if (person.accountStatus === "REQUESTED") {
    return <Dot kind="warning" label="Da approvare" />
  }
  return <Dot label="Non registrato" />
}

function PaymentState({ person }: { person: ManagementPerson }) {
  const open = person.payments.filter((payment) => payment.status !== "PAID")
  const total = open.reduce((sum, payment) => sum + payment.amountDue, 0)
  if (!open.length) return <Dot kind="good" label="In regola" />
  const pending = open.some((payment) => payment.status === "PENDING_REVIEW")
  return (
    <Dot
      kind={pending ? "warning" : "bad"}
      label={`${total.toLocaleString("it-IT", {
        style: "currency",
        currency: "EUR",
      })} · ${pending ? "da verificare" : "dovuti"}`}
    />
  )
}

function CertificateState({ person }: { person: ManagementPerson }) {
  const kind =
    person.certificateStatus === "VALID"
      ? "good"
      : person.certificateStatus === "PENDING_REVIEW"
        ? "warning"
        : "bad"
  return (
    <Dot
      kind={kind}
      label={
        {
          VALID: "Valido",
          PENDING_REVIEW: "Da verificare",
          MISSING: "Mancante",
          REJECTED: "Respinto",
          EXPIRED: "Scaduto",
        }[person.certificateStatus]
      }
    />
  )
}

function RegistrationState({ person }: { person: ManagementPerson }) {
  const kind =
    person.registrationStatus === "ACTIVE"
      ? "good"
      : person.registrationStatus === "SUBMITTED"
        ? "warning"
        : "bad"
  return (
    <Dot
      kind={kind}
      label={
        {
          ACTIVE: "Tesserato",
          SUBMITTED: "In verifica",
          TODO: "Da fare",
        }[person.registrationStatus]
      }
    />
  )
}

function percentage(value: number | undefined) {
  return `${Math.round(value ?? 0)}%`
}

function displayDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("it").format(new Date(value))
    : "—"
}

function nextPayment(person: ManagementPerson) {
  return person.payments
    .filter(({ status }) => status !== "PAID")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))[0]
}

export type ManagementTableActions = {
  onAccountAction: (
    requestId: string,
    action: "APPROVE" | "REJECT",
  ) => void
  onVerifyPayment: (paymentId: string) => void
  onReviewCertificate: (certificateId: string, approved: boolean) => void
}

type ManagementColumn = {
  id: string
  label: string
  required?: boolean
  /** Le colonne azione restano fuori dai campi della scheda. */
  action?: boolean
  /** Nella scheda il valore largo va sotto l’etichetta, non accanto. */
  wide?: boolean
  /** Vero solo quando la riga ha davvero un’azione disponibile. */
  actionable?: (person: ManagementPerson) => boolean
  filterValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  sortValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  filter?:
    | "text"
    | "ageGroup"
    | "account"
    | "payment"
    | "registration"
    | "certificate"
  render: (
    person: ManagementPerson,
    actions: ManagementTableActions,
    passportPhotoStates: Map<string, PassportPhotoState>,
  ) => ReactNode
}

const personColumn: ManagementColumn = {
  id: "person",
  label: "Persona",
  required: true,
  filter: "ageGroup",
  filterValue: (person) =>
    person.category === "PLAYER"
      ? (ageGroupAt(person.birthDate, new Date()) ?? "")
      : "",
  sortValue: (person) => `${person.cognome} ${person.nome}`,
  render: (person) => <PersonIdentity person={person} />,
}

const columnsByView: Record<ManagementView, ManagementColumn[]> = {
  PEOPLE: [
    personColumn,
    {
      id: "phone",
      label: "Telefono",
      filter: "text",
      filterValue: (person) => person.phone,
      sortValue: (person) => person.phone,
      render: (person) => (
        <span className="text-xs">{person.phone ?? "—"}</span>
      ),
    },
    {
      id: "account",
      label: "Account",
      filter: "account",
      filterValue: (person) => person.accountStatus,
      sortValue: (person) => person.accountStatus,
      render: (person) => <AccountState person={person} />,
    },
  ],
  ATTENDANCE: [
    personColumn,
    {
      id: "trainingStreak",
      label: "Ultimi allenamenti",
      wide: true,
      filterValue: () => "",
      sortValue: (person) => person.attendance?.training.percentage,
      render: (person) => (
        <AttendanceStreak items={person.attendance?.recentTraining ?? []} />
      ),
    },
    {
      id: "trainingRate",
      label: "Presenze allenamenti",
      filterValue: (person) => person.attendance?.training.percentage,
      sortValue: (person) => person.attendance?.training.percentage,
      render: (person) => (
        <span className="text-xs tabular-nums">
          {percentage(person.attendance?.training.percentage)}
          <span className="ml-1 text-muted-foreground">
            ({person.attendance?.training.present ?? 0}/
            {person.attendance?.training.total ?? 0})
          </span>
        </span>
      ),
    },
  ],
  PAYMENTS: [
    personColumn,
    {
      id: "payments",
      label: "Quote",
      filter: "payment",
      filterValue: (person) =>
        person.payments.some(({ status }) => status !== "PAID")
          ? "OPEN"
          : "PAID",
      sortValue: (person) =>
        person.payments.filter(({ status }) => status !== "PAID").length,
      render: (person) => <PaymentState person={person} />,
    },
    {
      id: "nextPayment",
      label: "Prossima quota",
      filter: "text",
      filterValue: (person) => nextPayment(person)?.description,
      sortValue: (person) => nextPayment(person)?.description,
      render: (person) => (
        <span className="text-xs">{nextPayment(person)?.description ?? "—"}</span>
      ),
    },
    {
      id: "dueOn",
      label: "Scadenza",
      filter: "text",
      filterValue: (person) => nextPayment(person)?.dueOn,
      sortValue: (person) => nextPayment(person)?.dueOn,
      render: (person) => (
        <span className="text-xs">{displayDate(nextPayment(person)?.dueOn)}</span>
      ),
    },
    {
      id: "paymentAction",
      label: "Azione",
      action: true,
      actionable: (person) => {
        const next = nextPayment(person)
        return Boolean(next?.status === "PENDING_REVIEW" && next.id)
      },
      filterValue: () => "",
      sortValue: () => "",
      render: (person, actions) => {
        const next = nextPayment(person)
        return next?.status === "PENDING_REVIEW" && next.id ? (
          <Button
            aria-label={`Verifica pagamento di ${person.nome} ${person.cognome}`}
            onClick={(event) => {
              event.stopPropagation()
              actions.onVerifyPayment(next.id!)
            }}
            size="sm"
            variant="outline"
          >
            <ShieldCheck aria-hidden="true" />
            Verifica
          </Button>
        ) : (
          "—"
        )
      },
    },
    {
      id: "method",
      label: "Metodo",
      filter: "text",
      filterValue: (person) => nextPayment(person)?.method,
      sortValue: (person) => nextPayment(person)?.method,
      render: (person) => (
        <span className="text-xs">{nextPayment(person)?.method ?? "—"}</span>
      ),
    },
  ],
  REGISTRATIONS: [
    personColumn,
    {
      id: "registration",
      label: "Stato",
      filter: "registration",
      filterValue: (person) => person.registrationStatus,
      sortValue: (person) => person.registrationStatus,
      render: (person) => <RegistrationState person={person} />,
    },
    {
      id: "asiCard",
      label: "Tessera ASI",
      filter: "text",
      filterValue: (person) => person.asiCardNumber,
      sortValue: (person) => person.asiCardNumber,
      render: (person) => (
        <span className="font-mono text-xs">{person.asiCardNumber ?? "—"}</span>
      ),
    },
    {
      id: "passportPhoto",
      label: "Fototessera",
      filterValue: (person) => (person.passportPhotoPath ? "PRESENT" : "MISSING"),
      sortValue: (person) => (person.passportPhotoPath ? 1 : 0),
      render: (person, _actions, passportPhotoStates) => (
        <PassportPhotoPreview
          personName={`${person.nome} ${person.cognome}`}
          state={
            person.passportPhotoPath
              ? (passportPhotoStates.get(person.passportPhotoPath) ?? {
                  status: "loading",
                })
              : { status: "missing" }
          }
        />
      ),
    },
    {
      id: "joinedOn",
      label: "In squadra",
      filter: "text",
      filterValue: (person) => person.joinedOn,
      sortValue: (person) => person.joinedOn,
      render: (person) => (
        <span className="text-xs">{displayDate(person.joinedOn)}</span>
      ),
    },
    {
      id: "completedOn",
      label: "Completato il",
      filter: "text",
      filterValue: (person) => person.registrationCompletedOn,
      sortValue: (person) => person.registrationCompletedOn,
      render: (person) => (
        <span className="text-xs">
          {displayDate(person.registrationCompletedOn)}
        </span>
      ),
    },
  ],
  CERTIFICATES: [
    personColumn,
    {
      id: "certificate",
      label: "Certificato",
      filter: "certificate",
      filterValue: (person) =>
        person.category === "PLAYER" ? person.certificateStatus : "NOT_REQUIRED",
      sortValue: (person) => person.certificateStatus,
      render: (person) =>
        person.category === "PLAYER" ? (
          <CertificateState person={person} />
        ) : (
          <span className="text-xs text-muted-foreground">Non richiesto</span>
        ),
    },
    {
      id: "expiresOn",
      label: "Scadenza",
      filter: "text",
      filterValue: (person) => person.certificateExpiresOn,
      sortValue: (person) => person.certificateExpiresOn,
      render: (person) => (
        <span className="text-xs">{displayDate(person.certificateExpiresOn)}</span>
      ),
    },
    {
      id: "document",
      label: "Documento",
      filterValue: (person) => person.certificateDocumentPath,
      sortValue: (person) => person.certificateDocumentPath,
      render: (person) => (
        <span className="text-xs">
          {person.certificateDocumentPath ? "PDF caricato" : "—"}
        </span>
      ),
    },
    {
      id: "certificateAction",
      label: "Azione",
      action: true,
      actionable: (person) =>
        person.certificateStatus === "PENDING_REVIEW" &&
        Boolean(person.certificateId),
      filterValue: () => "",
      sortValue: () => "",
      render: (person, actions) =>
        person.certificateStatus === "PENDING_REVIEW" &&
        person.certificateId ? (
          <div className="flex gap-1">
            <Button
              aria-label={`Approva certificato di ${person.nome} ${person.cognome}`}
              onClick={(event) => {
                event.stopPropagation()
                actions.onReviewCertificate(person.certificateId!, true)
              }}
              size="icon-sm"
              variant="outline"
            >
              <Check aria-hidden="true" />
            </Button>
            <Button
              aria-label={`Respingi certificato di ${person.nome} ${person.cognome}`}
              onClick={(event) => {
                event.stopPropagation()
                actions.onReviewCertificate(person.certificateId!, false)
              }}
              size="icon-sm"
              variant="outline"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          "—"
        ),
    },
  ],
  ACCOUNTS: [
    personColumn,
    {
      id: "account",
      label: "Stato",
      filter: "account",
      filterValue: (person) => person.accountStatus,
      sortValue: (person) => person.accountStatus,
      render: (person) => <AccountState person={person} />,
    },
    {
      id: "email",
      label: "Email",
      filter: "text",
      filterValue: (person) => person.operationalEmail,
      sortValue: (person) => person.operationalEmail,
      render: (person) => (
        <span className="text-xs">{person.operationalEmail ?? "—"}</span>
      ),
    },
    {
      id: "phone",
      label: "Telefono",
      filter: "text",
      filterValue: (person) => person.phone,
      sortValue: (person) => person.phone,
      render: (person) => (
        <span className="text-xs">{person.phone ?? "—"}</span>
      ),
    },
    {
      id: "accountAction",
      label: "Azioni",
      action: true,
      actionable: (person) => Boolean(person.associationRequestId),
      filterValue: () => "",
      sortValue: () => "",
      render: (person, actions) =>
        person.associationRequestId ? (
          <div className="flex gap-1">
            <Button
              aria-label={`Approva account di ${person.nome} ${person.cognome}`}
              onClick={(event) => {
                event.stopPropagation()
                actions.onAccountAction(person.associationRequestId!, "APPROVE")
              }}
              size="sm"
            >
              Approva
            </Button>
            <Button
              aria-label={`Rifiuta account di ${person.nome} ${person.cognome}`}
              onClick={(event) => {
                event.stopPropagation()
                actions.onAccountAction(person.associationRequestId!, "REJECT")
              }}
              size="sm"
              variant="outline"
            >
              Rifiuta
            </Button>
          </div>
        ) : (
          "—"
        ),
    },
    {
      id: "permission",
      label: "Permesso",
      filterValue: (person) => (person.isManager ? "MANAGER" : ""),
      sortValue: (person) => (person.isManager ? 1 : 0),
      render: (person) =>
        person.isManager ? (
          <Badge className="bg-violet-600">Manager</Badge>
        ) : (
          "—"
        ),
    },
  ],
}

export const managementFilterOptions = {
  ageGroup: [
    ["", "Tutti"],
    ["U35", "U35"],
    ["OVER_35", "Over 35"],
  ],
  account: [
    ["", "Tutti"],
    ["ACTIVE", "Attivo"],
    ["REQUESTED", "Da approvare"],
    ["NONE", "Non registrato"],
  ],
  payment: [
    ["", "Tutte"],
    ["OPEN", "Aperte"],
    ["PAID", "In regola"],
  ],
  registration: [
    ["", "Tutti"],
    ["TODO", "Da fare"],
    ["SUBMITTED", "In verifica"],
    ["ACTIVE", "Tesserato"],
  ],
  certificate: [
    ["", "Tutti"],
    ["VALID", "Valido"],
    ["PENDING_REVIEW", "Da verificare"],
    ["MISSING", "Mancante"],
    ["REJECTED", "Respinto"],
    ["EXPIRED", "Scaduto"],
    ["NOT_REQUIRED", "Non richiesto"],
  ],
} satisfies Record<
  Exclude<NonNullable<ManagementColumn["filter"]>, "text">,
  Array<[string, string]>
>

export type ManagementColumnMeta = {
  id: string
  label: string
  required?: boolean
  action?: boolean
  filter?: ManagementColumn["filter"]
  filterOptions?: Array<[string, string]>
}

export function getAvailableManagementColumns(
  view: ManagementView,
): ManagementColumnMeta[] {
  return columnsByView[view].map(({ id, label, required, action, filter }) => ({
    id,
    label,
    required,
    action,
    filter,
    filterOptions:
      filter && filter !== "text" ? managementFilterOptions[filter] : undefined,
  }))
}

export function getManagementColumnAccessors(view: ManagementView) {
  return Object.fromEntries(
    columnsByView[view].map((column) => [
      column.id,
      { filterValue: column.filterValue, sortValue: column.sortValue },
    ]),
  )
}

function SortIcon({
  sort,
  columnId,
}: {
  sort: TableSort
  columnId: string
}) {
  if (sort?.columnId !== columnId) {
    return <ChevronsUpDown aria-hidden="true" className="size-3 opacity-50" />
  }
  return sort.direction === "asc" ? (
    <ChevronUp aria-hidden="true" className="size-3" />
  ) : (
    <ChevronDown aria-hidden="true" className="size-3" />
  )
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      aria-label="Seleziona tutte le righe visibili"
      checked={checked}
      className="size-4 accent-primary"
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  )
}

export function ManagementTable({
  people,
  view,
  columns = DEFAULT_COLUMNS[view],
  layout = "TABLE",
  selected,
  sort = null,
  onSortChange,
  onSelect,
  onSelectAllVisible,
  onOpen,
  onAccountAction,
  onVerifyPayment,
  onReviewCertificate,
  passportPhotoStates = new Map(),
}: {
  people: ManagementPerson[]
  view: ManagementView
  columns?: string[]
  layout?: ManagementLayout
  selected: Set<string>
  sort?: TableSort
  onSortChange?: (columnId: string) => void
  onSelect: (membershipId: string) => void
  onSelectAllVisible?: (checked: boolean) => void
  onOpen: (person: ManagementPerson) => void
  onAccountAction: ManagementTableActions["onAccountAction"]
  onVerifyPayment: ManagementTableActions["onVerifyPayment"]
  onReviewCertificate: ManagementTableActions["onReviewCertificate"]
  passportPhotoStates?: Map<string, PassportPhotoState>
}) {
  const visibleColumns = useMemo(() => {
    const byId = new Map(columnsByView[view].map((column) => [column.id, column]))
    return columns
      .map((id) => byId.get(id))
      .filter((column): column is ManagementColumn => Boolean(column))
  }, [columns, view])
  const actions = useMemo(
    () => ({ onAccountAction, onReviewCertificate, onVerifyPayment }),
    [onAccountAction, onReviewCertificate, onVerifyPayment],
  )
  const cardFieldColumns = visibleColumns.filter(
    (column) => column.id !== "person" && !column.action,
  )
  const cardActionColumns = visibleColumns.filter((column) => column.action)
  const allVisibleSelected =
    people.length > 0 && people.every(({ id }) => selected.has(id))
  const someVisibleSelected = people.some(({ id }) => selected.has(id))

  return (
    <>
      {layout === "TABLE" && (
        <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
          <Table>
            <TableHeader className="bg-muted/90">
              <TableRow className="h-11">
                <TableHead className="w-10">
                  <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    onChange={(checked) => onSelectAllVisible?.(checked)}
                  />
                </TableHead>
                {visibleColumns.map((column) => (
                  <TableHead
                    aria-sort={
                      sort?.columnId === column.id
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "whitespace-nowrap",
                      column.id === "person" && "min-w-56",
                    )}
                    key={column.id}
                  >
                    <button
                      className="inline-flex min-h-8 items-center gap-1 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSortChange?.(column.id)}
                      type="button"
                    >
                      {column.label}
                      <SortIcon columnId={column.id} sort={sort} />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow
                  className="h-11 transition-colors"
                  data-state={selected.has(person.id) ? "selected" : undefined}
                  key={person.id}
                >
                  <TableCell>
                    <input
                      aria-label={`Seleziona ${person.nome} ${person.cognome}`}
                      checked={selected.has(person.id)}
                      className="size-4 accent-primary"
                      onChange={() => onSelect(person.id)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      {column.render(person, actions, passportPhotoStates)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(person)
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div
        className={cn(
          "grid gap-2",
          layout === "TABLE"
            ? "md:hidden"
            : "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {people.map((person) => {
          const availableActions = cardActionColumns.filter((column) =>
            column.actionable?.(person),
          )
          return (
            <article
              className={cn(
                "flex min-h-20 gap-3 rounded-lg border bg-card p-3 shadow-xs",
                selected.has(person.id) && "border-violet-500 bg-violet-50/60 dark:bg-violet-950/20",
              )}
              key={person.id}
            >
              <input
                aria-label={`Seleziona ${person.nome} ${person.cognome}`}
                checked={selected.has(person.id)}
                className="mt-1 size-5 shrink-0 accent-primary"
                onChange={() => onSelect(person.id)}
                onClick={(event) => event.stopPropagation()}
                type="checkbox"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  onClick={() => onOpen(person)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <PersonIdentity accessibleJersey={false} person={person} />
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </button>
                {cardFieldColumns.length > 0 && (
                  <dl className="grid gap-1">
                    {cardFieldColumns.map((column) => (
                      <div
                        className={cn(
                          "min-w-0 gap-2 text-xs",
                          column.wide
                            ? "grid"
                            : "flex items-center justify-between",
                        )}
                        key={column.id}
                      >
                        <dt className="shrink-0 text-muted-foreground">
                          {column.label}:
                        </dt>
                        <dd
                          className={cn(
                            "min-w-0 overflow-x-auto py-0.5",
                            !column.wide && "text-right",
                          )}
                        >
                          {column.render(person, actions, passportPhotoStates)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {availableActions.length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
                    {availableActions.map((column) => (
                      <div key={column.id}>
                        {column.render(person, actions, passportPhotoStates)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {people.length === 0 && (
        <p className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          Nessuna persona corrisponde ai filtri.
        </p>
      )}
    </>
  )
}

export type { ManagementView } from "@/lib/management-columns"
