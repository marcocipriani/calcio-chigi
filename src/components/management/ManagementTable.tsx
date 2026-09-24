"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  clampColumnWidth,
  DEFAULT_COLUMNS,
  type ManagementLayout,
  type ManagementView,
  type TableSort,
} from "@/lib/management-columns"
import { registrationStatusLabel } from "@/lib/profile-operations"
import { UNIFORM_SIZES } from "@/lib/domain"
import { ageGroupAt, cn, getAge } from "@/lib/utils"

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
                <Badge className="h-4 border-0 bg-sky-100 px-1 text-[10px] text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-200">
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
      label={registrationStatusLabel(person.registrationStatus)}
    />
  )
}

const roleFilterValue = (person: ManagementPerson) =>
  person.category === "STAFF" ? "STAFF" : (person.role?.toUpperCase() ?? "TBD")

function roleLabel(person: ManagementPerson) {
  if (person.category === "STAFF") return person.staffFunction ?? "Staff"
  if (!person.role) return "Da definire"
  return person.role.charAt(0).toUpperCase() + person.role.slice(1).toLowerCase()
}

const tagDefinitions: Array<
  readonly [string, string, (person: ManagementPerson) => boolean]
> = [
  ["EXT", "EXT", (person) => person.isExternal],
  ["AGG", "AGG", (person) => person.isAggregated],
  ["TRAINING_ONLY", "Solo allenamenti", (person) => person.status === "TRAINING_ONLY"],
]

function personTags(person: ManagementPerson) {
  return tagDefinitions.filter(([, , matches]) => matches(person))
}

const statusLabel: Record<ManagementPerson["status"], string> = {
  YES: "In rosa",
  TRAINING_ONLY: "Solo allenamenti",
  NO: "Archiviato",
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
    | "role"
    | "tags"
    | "status"
    | "uniformSize"
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

// Un solo registro: ogni colonna è disponibile in qualunque vista. Gli id
// devono coincidere con ALL_COLUMN_IDS (verificato da un test).
const managementColumns: ManagementColumn[] = [
  personColumn,
    {
      id: "role",
      label: "Ruolo",
      filter: "role",
      filterValue: roleFilterValue,
      sortValue: roleLabel,
      render: (person) => <span className="text-xs">{roleLabel(person)}</span>,
    },
    {
      id: "status",
      label: "Stato",
      filter: "status",
      filterValue: (person) => person.status,
      sortValue: (person) => statusLabel[person.status],
      render: (person) => (
        <span className="text-xs">{statusLabel[person.status]}</span>
      ),
    },
    {
      id: "birthDate",
      label: "Nascita",
      filter: "text",
      filterValue: (person) => person.birthDate,
      sortValue: (person) => person.birthDate,
      render: (person) => (
        <span className="text-xs tabular-nums">
          {displayDate(person.birthDate)}
          {person.birthDate && (
            <span className="ml-1 text-muted-foreground">
              ({getAge(person.birthDate)})
            </span>
          )}
        </span>
      ),
    },
    {
      id: "jerseyNumber",
      label: "Maglia",
      filter: "text",
      filterValue: (person) => person.jerseyNumber,
      sortValue: (person) => person.jerseyNumber,
      render: (person) => (
        <span className="text-xs tabular-nums">{person.jerseyNumber ?? "—"}</span>
      ),
    },
    {
      id: "uniformSize",
      label: "Taglia",
      filter: "uniformSize",
      filterValue: (person) => person.uniformSize ?? "NONE",
      sortValue: (person) =>
        person.uniformSize
          ? UNIFORM_SIZES.indexOf(
              person.uniformSize as (typeof UNIFORM_SIZES)[number],
            )
          : null,
      render: (person) => (
        <span className="text-xs">{person.uniformSize ?? "—"}</span>
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
      id: "department",
      label: "Dipartimento",
      filter: "text",
      filterValue: (person) => person.department,
      sortValue: (person) => person.department,
      render: (person) => (
        <span className="text-xs">{person.department ?? "—"}</span>
      ),
    },
    {
      id: "tags",
      label: "Tag",
      filter: "tags",
      // I filtri confrontano per sottostringa: "EXT AGG" risponde a entrambi.
      filterValue: (person) =>
        personTags(person).map(([id]) => id).join(" ") || "NONE",
      sortValue: (person) =>
        personTags(person).map(([, label]) => label).join(" "),
      render: (person) => {
        const tags = personTags(person)
        return tags.length ? (
          <span className="inline-flex flex-wrap justify-end gap-1">
            {tags.map(([id, label]) => (
              <Badge className="text-[10px]" key={id} variant="outline">
                {label}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
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
      label: "Scadenza quota",
      filter: "text",
      filterValue: (person) => nextPayment(person)?.dueOn,
      sortValue: (person) => nextPayment(person)?.dueOn,
      render: (person) => (
        <span className="text-xs">{displayDate(nextPayment(person)?.dueOn)}</span>
      ),
    },
    {
      id: "paymentAction",
      label: "Azione quota",
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
      label: "Metodo pagamento",
      filter: "text",
      filterValue: (person) => nextPayment(person)?.method,
      sortValue: (person) => nextPayment(person)?.method,
      render: (person) => (
        <span className="text-xs">{nextPayment(person)?.method ?? "—"}</span>
      ),
    },
    {
      id: "registration",
      label: "Tesseramento",
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
      label: "Tesserato il",
      filter: "text",
      filterValue: (person) => person.registrationCompletedOn,
      sortValue: (person) => person.registrationCompletedOn,
      render: (person) => (
        <span className="text-xs">
          {displayDate(person.registrationCompletedOn)}
        </span>
      ),
    },
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
      label: "Scadenza certificato",
      filter: "text",
      filterValue: (person) => person.certificateExpiresOn,
      sortValue: (person) => person.certificateExpiresOn,
      render: (person) => (
        <span className="text-xs">{displayDate(person.certificateExpiresOn)}</span>
      ),
    },
    {
      id: "document",
      label: "Certificato PDF",
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
      label: "Azione certificato",
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
    {
      id: "account",
      label: "Account",
      filter: "account",
      filterValue: (person) => person.accountStatus,
      sortValue: (person) => person.accountStatus,
      render: (person) => <AccountState person={person} />,
    },
    {
      id: "accountAction",
      label: "Azione account",
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
          <Badge className="bg-operative text-operative-foreground">Manager</Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "nextContactOn",
      label: "Prossimo contatto",
      filter: "text",
      filterValue: (person) => person.nextContactOn,
      sortValue: (person) => person.nextContactOn,
      render: (person) => (
        <span className="text-xs">{displayDate(person.nextContactOn)}</span>
      ),
    },
    {
      id: "notes",
      label: "Note",
      wide: true,
      filter: "text",
      filterValue: (person) => person.operationalNotes,
      sortValue: (person) => person.operationalNotes,
      render: (person) => (
        <span className="line-clamp-2 text-xs">
          {person.operationalNotes ?? "—"}
        </span>
      ),
    },
]

const columnsById = new Map(
  managementColumns.map((column) => [column.id, column]),
)

export const managementFilterOptions = {
  role: [
    ["", "Tutti"],
    ["PORTIERE", "Portiere"],
    ["DIFENSORE", "Difensore"],
    ["CENTROCAMPISTA", "Centrocampista"],
    ["ATTACCANTE", "Attaccante"],
    ["TBD", "Da definire"],
    ["STAFF", "Staff"],
  ],
  tags: [
    ["", "Tutti"],
    ["EXT", "EXT"],
    ["AGG", "AGG"],
    ["TRAINING_ONLY", "Solo allenamenti"],
    ["NONE", "Nessuno"],
  ],
  status: [
    ["", "Tutti"],
    ["YES", "In rosa"],
    ["TRAINING_ONLY", "Solo allenamenti"],
    ["NO", "Archiviato"],
  ],
  uniformSize: [
    ["", "Tutte"],
    ...UNIFORM_SIZES.map((size): [string, string] => [size, size]),
    ["NONE", "Non indicata"],
  ],
  ageGroup: [
    ["", "Tutti"],
    ["U35", "Under 35"],
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

export function getAvailableManagementColumns(): ManagementColumnMeta[] {
  return managementColumns.map(({ id, label, required, action, filter }) => ({
    id,
    label,
    required,
    action,
    filter,
    filterOptions:
      filter && filter !== "text" ? managementFilterOptions[filter] : undefined,
  }))
}

export function getManagementColumnAccessors() {
  return Object.fromEntries(
    managementColumns.map((column) => [
      column.id,
      {
        filterValue: column.filterValue,
        sortValue: column.sortValue,
        exact: column.filter === "uniformSize" || column.filter === "status",
      },
    ]),
  )
}

const RESIZE_KEY_STEP = 16

/**
 * Bordo destro trascinabile dell'intestazione. Frecce ←/→ per tastiera,
 * doppio clic per tornare alla larghezza automatica.
 */
function ColumnResizeHandle({
  label,
  width,
  onPreview,
  onCommit,
}: {
  label: string
  width: number | undefined
  onPreview: (width: number) => void
  onCommit: (width: number | null) => void
}) {
  const handleRef = useRef<HTMLSpanElement>(null)

  function headerWidth() {
    return (
      width ??
      handleRef.current?.parentElement?.getBoundingClientRect().width ??
      120
    )
  }

  return (
    <span
      aria-label={`Ridimensiona colonna ${label}`}
      aria-orientation="vertical"
      aria-valuenow={width ? Math.round(width) : undefined}
      className="absolute inset-y-1 right-0 w-2 cursor-col-resize touch-none rounded-sm after:absolute after:inset-y-1 after:right-0.5 after:w-px after:bg-border hover:bg-operative/20 focus-visible:bg-operative/30 focus-visible:outline-none"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onCommit(null)
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const step = event.key === "ArrowLeft" ? -RESIZE_KEY_STEP : RESIZE_KEY_STEP
        onCommit(clampColumnWidth(headerWidth() + step))
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startWidth = headerWidth()
        let latest = startWidth
        const target = event.currentTarget
        target.setPointerCapture(event.pointerId)
        const move = (moveEvent: PointerEvent) => {
          latest = clampColumnWidth(startWidth + moveEvent.clientX - startX)
          onPreview(latest)
        }
        const up = () => {
          target.removeEventListener("pointermove", move)
          target.removeEventListener("pointerup", up)
          target.removeEventListener("pointercancel", up)
          if (latest !== startWidth) onCommit(latest)
        }
        target.addEventListener("pointermove", move)
        target.addEventListener("pointerup", up)
        target.addEventListener("pointercancel", up)
      }}
      ref={handleRef}
      role="separator"
      tabIndex={0}
    />
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
      className="size-4 accent-operative"
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  )
}

export function ManagementTable({
  people,
  view = "PEOPLE",
  columns = DEFAULT_COLUMNS[view],
  layout = "TABLE",
  selected,
  sort = null,
  widths = {},
  onResizeColumn,
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
  view?: ManagementView
  columns?: string[]
  layout?: ManagementLayout
  selected: Set<string>
  sort?: TableSort
  /** Larghezze in px per colonna; assenti = automatiche. */
  widths?: Record<string, number>
  /** width null = torna automatica. */
  onResizeColumn?: (columnId: string, width: number | null) => void
  onSortChange?: (columnId: string) => void
  onSelect: (membershipId: string) => void
  onSelectAllVisible?: (checked: boolean) => void
  onOpen: (person: ManagementPerson) => void
  onAccountAction: ManagementTableActions["onAccountAction"]
  onVerifyPayment: ManagementTableActions["onVerifyPayment"]
  onReviewCertificate: ManagementTableActions["onReviewCertificate"]
  passportPhotoStates?: Map<string, PassportPhotoState>
}) {
  const visibleColumns = useMemo(
    () =>
      columns
        .map((id) => columnsById.get(id))
        .filter((column): column is ManagementColumn => Boolean(column)),
    [columns],
  )
  const actions = useMemo(
    () => ({ onAccountAction, onReviewCertificate, onVerifyPayment }),
    [onAccountAction, onReviewCertificate, onVerifyPayment],
  )
  // Nella card il ruolo è già sotto il nome: niente riga "Ruolo" duplicata.
  const cardFieldColumns = visibleColumns.filter(
    (column) =>
      column.id !== "person" && column.id !== "role" && !column.action,
  )
  const cardActionColumns = visibleColumns.filter((column) => column.action)
  // Durante il trascinamento la larghezza vive qui; si salva al rilascio.
  const [liveWidth, setLiveWidth] = useState<{
    columnId: string
    width: number
  } | null>(null)
  const widthOf = (columnId: string) =>
    liveWidth?.columnId === columnId ? liveWidth.width : widths[columnId]
  const widthStyle = (columnId: string) => {
    const width = widthOf(columnId)
    return width ? { width, minWidth: width, maxWidth: width } : undefined
  }
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
                      "relative whitespace-nowrap",
                      column.id === "person" && !widthOf(column.id) && "min-w-56",
                    )}
                    key={column.id}
                    style={widthStyle(column.id)}
                  >
                    <button
                      className="inline-flex min-h-8 max-w-full items-center gap-1 overflow-hidden rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSortChange?.(column.id)}
                      type="button"
                    >
                      <span className="truncate">{column.label}</span>
                      <SortIcon columnId={column.id} sort={sort} />
                    </button>
                    {onResizeColumn && (
                      <ColumnResizeHandle
                        label={column.label}
                        onCommit={(width) => {
                          setLiveWidth(null)
                          onResizeColumn(column.id, width)
                        }}
                        onPreview={(width) =>
                          setLiveWidth({ columnId: column.id, width })
                        }
                        width={widthOf(column.id)}
                      />
                    )}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
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
                      className="size-4 accent-operative"
                      onChange={() => onSelect(person.id)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell
                      className={widthOf(column.id) ? "overflow-hidden" : undefined}
                      key={column.id}
                      style={widthStyle(column.id)}
                    >
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
                "flex min-h-20 cursor-pointer gap-3 rounded-lg border bg-card p-3 shadow-xs",
                selected.has(person.id) && "border-operative bg-operative/5",
              )}
              key={person.id}
              onClick={() => onOpen(person)}
            >
              <label
                className="-m-2.5 grid size-11 shrink-0 cursor-pointer place-items-center"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  aria-label={`Seleziona ${person.nome} ${person.cognome}`}
                  checked={selected.has(person.id)}
                  className="size-5 accent-operative"
                  onChange={() => onSelect(person.id)}
                  type="checkbox"
                />
              </label>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  // Il click risale all'article, che apre la scheda.
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
                            "min-w-0 py-0.5",
                            column.wide
                              ? "overflow-x-auto overscroll-x-contain"
                              : "break-words text-right",
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
