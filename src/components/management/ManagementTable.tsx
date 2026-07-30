"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
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
import { PassportPhotoPreview } from "@/components/management/PassportPhotoPreview"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  applyTableState,
  DEFAULT_COLUMNS,
  type ManagementView,
  type TableSort,
} from "@/lib/management-columns"
import { cn } from "@/lib/utils"

const statusLabel = {
  INTERESTED: "Interessato",
  PENDING: "Da confermare",
  YES: "Sì",
  MAYBE: "Forse",
  NO: "No",
}

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
  filterValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  sortValue: (
    person: ManagementPerson,
  ) => string | number | null | undefined
  filter?:
    | "text"
    | "category"
    | "confirmation"
    | "account"
    | "payment"
    | "registration"
    | "certificate"
  render: (
    person: ManagementPerson,
    actions: ManagementTableActions,
    passportPhotoUrls: Map<string, string>,
  ) => ReactNode
}

const personColumn: ManagementColumn = {
  id: "person",
  label: "Persona",
  required: true,
  filter: "category",
  filterValue: (person) => person.category,
  sortValue: (person) => `${person.cognome} ${person.nome}`,
  render: (person) => <PersonIdentity person={person} />,
}

const columnsByView: Record<ManagementView, ManagementColumn[]> = {
  PEOPLE: [
    personColumn,
    {
      id: "confirmation",
      label: "Conferma",
      filter: "confirmation",
      filterValue: (person) => person.status,
      sortValue: (person) => statusLabel[person.status],
      render: (person) => (
        <Dot
          kind={
            person.status === "YES"
              ? "good"
              : person.status === "MAYBE"
                ? "warning"
                : person.status === "NO"
                  ? "bad"
                  : "neutral"
          }
          label={statusLabel[person.status]}
        />
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
    {
      id: "matchRate",
      label: "Presenze partite",
      filterValue: (person) => person.attendance?.matches.percentage,
      sortValue: (person) => person.attendance?.matches.percentage,
      render: (person) => (
        <span className="text-xs tabular-nums">
          {percentage(person.attendance?.matches.percentage)}
          <span className="ml-1 text-muted-foreground">
            ({person.attendance?.matches.present ?? 0}/
            {person.attendance?.matches.total ?? 0})
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
      filterValue: () => "",
      sortValue: () => "",
      render: (person, actions) => {
        const next = nextPayment(person)
        return next?.status === "PENDING_REVIEW" && next.id ? (
          <Button
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
      render: (person, _actions, passportPhotoUrls) => (
        <PassportPhotoPreview
          personName={`${person.nome} ${person.cognome}`}
          signedUrl={
            person.passportPhotoPath
              ? passportPhotoUrls.get(person.passportPhotoPath)
              : undefined
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
      filterValue: () => "",
      sortValue: () => "",
      render: (person, actions) =>
        person.associationRequestId ? (
          <div className="flex gap-1">
            <Button
              onClick={(event) => {
                event.stopPropagation()
                actions.onAccountAction(person.associationRequestId!, "APPROVE")
              }}
              size="sm"
            >
              Approva
            </Button>
            <Button
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

export function getAvailableManagementColumns(view: ManagementView) {
  return columnsByView[view].map(({ id, label, required }) => ({
    id,
    label,
    required,
  }))
}

const filterOptions = {
  category: [
    ["", "Tutti"],
    ["PLAYER", "Giocatori"],
    ["STAFF", "Staff"],
  ],
  confirmation: [
    ["", "Tutte"],
    ["INTERESTED", "Interessato"],
    ["PENDING", "Da confermare"],
    ["YES", "Sì"],
    ["MAYBE", "Forse"],
    ["NO", "No"],
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

function ColumnFilter({
  column,
  value,
  onChange,
}: {
  column: ManagementColumn
  value: string
  onChange: (value: string) => void
}) {
  if (!column.filter) return null
  const label = `Filtra ${column.label}`

  if (column.filter === "text") {
    return (
      <Input
        aria-label={label}
        className="h-7 min-w-28 text-xs"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filtra…"
        value={value}
      />
    )
  }

  return (
    <select
      aria-label={label}
      className="h-7 min-w-28 rounded-md border bg-background px-2 text-xs"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {filterOptions[column.filter].map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  )
}

function nextSort(current: TableSort, columnId: string): TableSort {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "asc" }
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" }
  }
  return null
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

export function ManagementTable({
  people,
  view,
  columns = DEFAULT_COLUMNS[view],
  selected,
  onSelect,
  onOpen,
  onVisiblePeopleChange,
  onAccountAction,
  onVerifyPayment,
  onReviewCertificate,
  passportPhotoUrls = new Map(),
}: {
  people: ManagementPerson[]
  view: ManagementView
  columns?: string[]
  selected: Set<string>
  onSelect: (membershipId: string) => void
  onOpen: (person: ManagementPerson) => void
  onVisiblePeopleChange?: (people: ManagementPerson[]) => void
  onAccountAction: ManagementTableActions["onAccountAction"]
  onVerifyPayment: ManagementTableActions["onVerifyPayment"]
  onReviewCertificate: ManagementTableActions["onReviewCertificate"]
  passportPhotoUrls?: Map<string, string>
}) {
  const [sort, setSort] = useState<TableSort>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const visibleColumns = useMemo(() => {
    const byId = new Map(columnsByView[view].map((column) => [column.id, column]))
    return columns
      .map((id) => byId.get(id))
      .filter((column): column is ManagementColumn => Boolean(column))
  }, [columns, view])
  const accessors = useMemo(
    () =>
      Object.fromEntries(
        columnsByView[view].map((column) => [
          column.id,
          {
            filterValue: column.filterValue,
            sortValue: column.sortValue,
          },
        ]),
      ),
    [view],
  )
  const rows = useMemo(
    () =>
      applyTableState(
        people,
        accessors,
        Object.fromEntries(
          visibleColumns.map(({ id }) => [id, filters[id] ?? ""]),
        ),
        sort,
      ),
    [accessors, filters, people, sort, visibleColumns],
  )
  const actions = useMemo(
    () => ({ onAccountAction, onReviewCertificate, onVerifyPayment }),
    [onAccountAction, onReviewCertificate, onVerifyPayment],
  )
  const mobileColumns = visibleColumns
    .filter(
      ({ id }) =>
        id !== "person" &&
        id !== "paymentAction" &&
        id !== "certificateAction" &&
        id !== "accountAction" &&
        id !== "passportPhoto",
    )
    .slice(0, 2)

  useEffect(() => {
    onVisiblePeopleChange?.(rows)
  }, [onVisiblePeopleChange, rows])

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <TableRow className="h-10">
              <TableHead className="w-10">
                <span className="sr-only">Selezione</span>
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
                    className="inline-flex min-h-8 items-center gap-1 font-medium"
                    onClick={() =>
                      setSort((current) => nextSort(current, column.id))
                    }
                    type="button"
                  >
                    {column.label}
                    <SortIcon columnId={column.id} sort={sort} />
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
            <TableRow>
              <TableHead />
              {visibleColumns.map((column) => (
                <TableHead className="pb-2 align-top" key={column.id}>
                  <ColumnFilter
                    column={column}
                    onChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        [column.id]: value,
                      }))
                    }
                    value={filters[column.id] ?? ""}
                  />
                </TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((person) => (
              <TableRow
                className="h-11 cursor-pointer transition-colors"
                data-state={selected.has(person.id) ? "selected" : undefined}
                key={person.id}
                onClick={() => onOpen(person)}
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
                    {column.render(person, actions, passportPhotoUrls)}
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
        {rows.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nessuna persona corrisponde ai filtri.
          </p>
        )}
      </div>

      <div className="grid gap-2 md:hidden">
        {rows.map((person) => (
          <div
            className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-3 shadow-xs"
            key={person.id}
          >
            <input
              aria-label={`Seleziona ${person.nome} ${person.cognome}`}
              checked={selected.has(person.id)}
              className="size-5 shrink-0 accent-primary"
              onChange={() => onSelect(person.id)}
              onClick={(event) => event.stopPropagation()}
              type="checkbox"
            />
            <button
              aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-left transition-transform active:scale-[0.99]"
              onClick={() => onOpen(person)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <PersonIdentity accessibleJersey={false} person={person} />
                <span className="mt-2 grid gap-1 pl-10">
                  {mobileColumns.map((column) => (
                    <span
                      className="flex min-w-0 items-center gap-2 text-xs"
                      key={column.id}
                    >
                      <span className="text-muted-foreground">
                        {column.label}:
                      </span>
                      {column.render(person, actions, passportPhotoUrls)}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export type { ManagementView } from "@/lib/management-columns"
