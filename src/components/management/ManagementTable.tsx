"use client"

import { Check, ChevronRight, ShieldCheck, X } from "lucide-react"

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
import { cn } from "@/lib/utils"

export type ManagementView =
  | "ROSTER"
  | "REGISTRATIONS"
  | "PAYMENTS"
  | "CERTIFICATES"
  | "ACCOUNTS"

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

function PersonIdentity({ person }: { person: ManagementPerson }) {
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
        <span className="block truncate text-[11px] text-muted-foreground">
          {person.category === "PLAYER"
            ? person.role ?? "Ruolo da assegnare"
            : person.staffFunction ?? "Staff"}
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

function RosterCells({ person }: { person: ManagementPerson }) {
  return (
    <>
      <TableCell>
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
      </TableCell>
      <TableCell className="max-w-36 truncate text-xs">
        {person.department ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {person.isExternal && <Badge variant="outline">EXT</Badge>}
          {person.isAggregated && <Badge variant="outline">AGG</Badge>}
          {person.trainingOnly && <Badge variant="secondary">ALL</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-xs">{person.phone ?? "—"}</TableCell>
      <TableCell>
        <AccountState person={person} />
      </TableCell>
    </>
  )
}

function RegistrationCells({ person }: { person: ManagementPerson }) {
  const kind =
    person.registrationStatus === "ACTIVE"
      ? "good"
      : person.registrationStatus === "SUBMITTED"
        ? "warning"
        : "bad"
  return (
    <>
      <TableCell>
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
      </TableCell>
      <TableCell className="font-mono text-xs">
        {person.asiCardNumber ?? "—"}
      </TableCell>
      <TableCell>
        <Dot
          kind={person.passportPhotoPath ? "good" : "bad"}
          label={person.passportPhotoPath ? "Presente" : "Mancante"}
        />
      </TableCell>
      <TableCell className="text-xs">
        {person.joinedOn
          ? new Intl.DateTimeFormat("it").format(new Date(person.joinedOn))
          : "—"}
      </TableCell>
      <TableCell className="text-xs">
        {person.registrationCompletedOn ?? "—"}
      </TableCell>
    </>
  )
}

function PaymentCells({
  person,
  onVerifyPayment,
}: {
  person: ManagementPerson
  onVerifyPayment: (paymentId: string) => void
}) {
  const next = person.payments
    .filter(({ status }) => status !== "PAID")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))[0]
  return (
    <>
      <TableCell>
        <PaymentState person={person} />
      </TableCell>
      <TableCell className="text-xs">{next?.description ?? "—"}</TableCell>
      <TableCell className="text-xs">{next?.dueOn ?? "—"}</TableCell>
      <TableCell>
        {next?.status === "PENDING_REVIEW" && next.id ? (
          <Button
            onClick={(event) => {
              event.stopPropagation()
              onVerifyPayment(next.id!)
            }}
            size="sm"
            variant="outline"
          >
            <ShieldCheck aria-hidden="true" />
            Verifica
          </Button>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-xs">{next?.method ?? "—"}</TableCell>
    </>
  )
}

function CertificateCells({
  person,
  onReviewCertificate,
}: {
  person: ManagementPerson
  onReviewCertificate: (certificateId: string, approved: boolean) => void
}) {
  return (
    <>
      <TableCell>
        {person.category === "PLAYER" ? (
          <CertificateState person={person} />
        ) : (
          <span className="text-xs text-muted-foreground">Non richiesto</span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {person.certificateExpiresOn ?? "—"}
      </TableCell>
      <TableCell className="text-xs">
        {person.certificateStatus === "PENDING_REVIEW"
          ? "PDF caricato"
          : "—"}
      </TableCell>
      <TableCell>
        {person.certificateStatus === "PENDING_REVIEW" &&
        person.certificateId ? (
          <div className="flex gap-1">
            <Button
              aria-label={`Approva certificato di ${person.nome} ${person.cognome}`}
              onClick={(event) => {
                event.stopPropagation()
                onReviewCertificate(person.certificateId!, true)
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
                onReviewCertificate(person.certificateId!, false)
              }}
              size="icon-sm"
              variant="outline"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell />
    </>
  )
}

function AccountCells({
  person,
  onAccountAction,
}: {
  person: ManagementPerson
  onAccountAction: (requestId: string, action: "APPROVE" | "REJECT") => void
}) {
  return (
    <>
      <TableCell>
        <AccountState person={person} />
      </TableCell>
      <TableCell className="text-xs">
        {person.operationalEmail ?? "—"}
      </TableCell>
      <TableCell className="text-xs">{person.phone ?? "—"}</TableCell>
      <TableCell>
        {person.associationRequestId ? (
          <div className="flex gap-1">
            <Button
              onClick={(event) => {
                event.stopPropagation()
                onAccountAction(person.associationRequestId!, "APPROVE")
              }}
              size="sm"
            >
              Approva
            </Button>
            <Button
              onClick={(event) => {
                event.stopPropagation()
                onAccountAction(person.associationRequestId!, "REJECT")
              }}
              size="sm"
              variant="outline"
            >
              Rifiuta
            </Button>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        {person.isManager && <Badge className="bg-violet-600">Manager</Badge>}
      </TableCell>
    </>
  )
}

const headers: Record<ManagementView, string[]> = {
  ROSTER: ["Conferma", "Dipartimento", "Tag", "Telefono", "Account"],
  REGISTRATIONS: ["Stato", "Tessera ASI", "Fototessera", "In squadra", "Data"],
  PAYMENTS: ["Quote", "Prossima quota", "Scadenza", "Azione", "Metodo"],
  CERTIFICATES: ["Certificato", "Scadenza", "Documento", "Azione", ""],
  ACCOUNTS: ["Stato", "Email", "Telefono", "Azioni", "Permesso"],
}

export function ManagementTable({
  people,
  view,
  selected,
  onSelect,
  onOpen,
  onAccountAction,
  onVerifyPayment,
  onReviewCertificate,
}: {
  people: ManagementPerson[]
  view: ManagementView
  selected: Set<string>
  onSelect: (membershipId: string) => void
  onOpen: (person: ManagementPerson) => void
  onAccountAction: (
    requestId: string,
    action: "APPROVE" | "REJECT",
  ) => void
  onVerifyPayment: (paymentId: string) => void
  onReviewCertificate: (certificateId: string, approved: boolean) => void
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <TableRow className="h-10">
              <TableHead className="w-10">
                <span className="sr-only">Selezione</span>
              </TableHead>
              <TableHead className="min-w-56">Persona</TableHead>
              {headers[view].map((header, index) => (
                <TableHead className="whitespace-nowrap" key={`${header}-${index}`}>
                  {header}
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
                    className="size-4 accent-primary"
                    onChange={() => onSelect(person.id)}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                </TableCell>
                <TableCell>
                  <PersonIdentity person={person} />
                </TableCell>
                {view === "ROSTER" && <RosterCells person={person} />}
                {view === "REGISTRATIONS" && (
                  <RegistrationCells person={person} />
                )}
                {view === "PAYMENTS" && (
                  <PaymentCells
                    onVerifyPayment={onVerifyPayment}
                    person={person}
                  />
                )}
                {view === "CERTIFICATES" && (
                  <CertificateCells
                    onReviewCertificate={onReviewCertificate}
                    person={person}
                  />
                )}
                {view === "ACCOUNTS" && (
                  <AccountCells
                    onAccountAction={onAccountAction}
                    person={person}
                  />
                )}
                <TableCell>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {people.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nessuna persona corrisponde ai filtri.
          </p>
        )}
      </div>

      <div className="grid gap-2 md:hidden">
        {people.map((person) => (
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
              className="flex min-w-0 flex-1 items-center gap-2 text-left transition-transform active:scale-[0.99]"
              onClick={() => onOpen(person)}
              type="button"
            >
              <span className="min-w-0 flex-1">
              <PersonIdentity person={person} />
              <span className="mt-2 flex flex-wrap gap-2 pl-10">
                <Dot
                  kind={person.status === "YES" ? "good" : "warning"}
                  label={statusLabel[person.status]}
                />
                <AccountState person={person} />
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
