"use client"

import type { ReactNode } from "react"
import { Check, ShieldCheck, Shirt, X } from "lucide-react"

import { DocumentPreview } from "@/components/documents/DocumentControls"
import {
  AttendancePercentage,
  AttendanceStreak,
} from "@/components/management/AttendanceStreak"
import {
  PassportPhotoPreview,
  type PassportPhotoState,
} from "@/components/management/PassportPhotoPreview"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { openInjury } from "@/lib/injuries"
import type { ManagementPerson } from "@/lib/management"
import {
  DOCUMENT_BUCKET,
  type DocumentKind,
} from "@/lib/membership-documents"
import { certificateStatusLabel, registrationStatusLabel } from "@/lib/profile-operations"
import { UNIFORM_SIZES } from "@/lib/domain"
import { ageGroupAt, cn, getAge } from "@/lib/utils"

// Registro delle colonne della gestione: celle, filtri e ordinamento.
// La tabella (ManagementTable) le dispone; la dashboard ne usa filtri e accessori.

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

export function PersonIdentity({
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
  const total = open.reduce(
    (sum, payment) => sum + payment.amountDue - (payment.amountPaid ?? 0),
    0,
  )
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
      label={certificateStatusLabel(person.certificateStatus)}
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

/** Apre l'anteprima dalla tabella senza aprire la scheda della persona. */
function DocumentCell({
  bucket,
  path,
  image,
  title,
  label,
}: {
  bucket: string
  path: string
  image: boolean
  title: string
  label: string
}) {
  return (
    <DocumentPreview bucket={bucket} image={image} path={path} title={title}>
      <button
        aria-label={`Apri ${title}`}
        className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
      >
        {label}
      </button>
    </DocumentPreview>
  )
}

function documentColumn(
  id: string,
  label: string,
  kind: DocumentKind,
): ManagementColumn {
  const find = (person: ManagementPerson) =>
    person.documents?.find((document) => document.kind === kind)
  return {
    id,
    label,
    filterValue: (person) => (find(person) ? "Caricato" : "Mancante"),
    sortValue: (person) => (find(person) ? 1 : 0),
    render: (person) => {
      const document = find(person)
      return document ? (
        <DocumentCell
          bucket={DOCUMENT_BUCKET}
          image={document.contentType.startsWith("image/")}
          label="Caricato"
          path={document.path}
          title={`${label} di ${person.nome} ${person.cognome}`}
        />
      ) : (
        <span className="text-xs text-muted-foreground">Mancante</span>
      )
    },
  }
}

const statusLabel: Record<ManagementPerson["status"], string> = {
  YES: "In rosa",
  TRAINING_ONLY: "Solo allenamenti",
  NO: "Archiviato",
}

/** "KO dal …" se è ancora fermo, altrimenti l'ultimo giorno di KO. */
function latestInjury(injuries: ManagementPerson["injuries"]) {
  return injuries?.length ? (openInjury(injuries) ?? injuries[0]) : undefined
}

function injuryLabel(injuries: ManagementPerson["injuries"]) {
  const latest = latestInjury(injuries)
  if (!latest) return ""
  return latest.endedOn
    ? `KO fino al ${displayDate(latest.endedOn)}`
    : `KO dal ${displayDate(latest.startedOn)}`
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

export type ManagementColumn = {
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
          <AttendancePercentage rate={person.attendance?.training} />
          {Boolean(person.attendance?.training.all) && (
            <span
              className="ml-1 text-muted-foreground"
              title="presenze / allenamenti senza KO / tutti"
            >
              ({person.attendance?.training.present}/
              {person.attendance?.training.total}/
              {person.attendance?.training.all})
            </span>
          )}
        </span>
      ),
    },
    {
      id: "injury",
      label: "Infortunio",
      filterValue: (person) => injuryLabel(person.injuries),
      // KO in corso prima, poi i rientri più recenti.
      sortValue: (person) => {
        const latest = latestInjury(person.injuries)
        return latest ? `${latest.endedOn ? 0 : 1}${latest.startedOn}` : ""
      },
      render: (person) => {
        const latest = latestInjury(person.injuries)
        if (!latest) {
          return <span className="text-xs text-muted-foreground">—</span>
        }
        return (
          <Badge
            className={cn(
              !latest.endedOn &&
                "border-rose-300 bg-white text-rose-700 dark:bg-white",
            )}
            variant="outline"
          >
            {injuryLabel(person.injuries)}
          </Badge>
        )
      },
    },
    {
      id: "injuryCount",
      label: "Infortuni",
      filterValue: (person) => person.injuries?.length ?? 0,
      sortValue: (person) => person.injuries?.length ?? 0,
      render: (person) => (
        <span className="text-xs tabular-nums">
          {person.injuries?.length ?? 0}
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
    documentColumn("identityDocument", "Documento identità", "IDENTITY"),
    documentColumn("registrationForm", "Modulo iscrizione", "REGISTRATION_FORM"),
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
      render: (person) =>
        person.certificateDocumentPath ? (
          <DocumentCell
            bucket="medical-certificates"
            image={false}
            label="PDF caricato"
            path={person.certificateDocumentPath}
            title={`Certificato di ${person.nome} ${person.cognome}`}
          />
        ) : (
          <span className="text-xs">—</span>
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

export const columnsById = new Map(
  managementColumns.map((column) => [column.id, column]),
)

const managementFilterOptions = {
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
