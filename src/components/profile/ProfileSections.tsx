"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileBadge,
  FileText,
  Loader2,
  Mail,
  Phone,
  Shirt,
  Upload,
  User,
} from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"

import {
  PaymentReceipt,
  type MembershipDocumentsState,
} from "@/components/documents/MembershipDocuments"
import {
  PaymentEntriesList,
  PaymentProgress,
} from "@/components/payments/PaymentEntriesList"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BOMBER_TAGS } from "@/lib/constants"
import type { MembershipDocument } from "@/lib/membership-documents"
import {
  certificateStatusLabel,
  paymentStatusLabel,
  type CertificateStatus,
  type PaymentStatus,
  type RegistrationStatus,
} from "@/lib/profile-operations"
import {
  formatEuro,
  paidAmount,
  remainingAmount,
  type CashRecipient,
  type PaymentEntry,
} from "@/lib/payments"
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser"

// Card della pagina profilo (/profilo). Lo stato del profilo resta nella
// pagina; il certificato tiene il suo form, che è indipendente dal resto.

export type Season = {
  id: string
  name: string
  slug: string
  starts_on: string
  ends_on: string
}

export type Membership = {
  id: string
  season_id: string
  category: "PLAYER" | "STAFF"
  role: string | null
  staff_function: string | null
  jersey_number: number | null
  uniform_size: string | null
  asi_card_number: string | null
  department: string | null
  status: "YES" | "TRAINING_ONLY" | "NO"
  registration_status: RegistrationStatus
  registration_completed_on: string | null
  passport_photo_path: string | null
  passport_photo_unlocked_at: string | null
}

export type Payment = {
  id: string
  description: string
  amount_due: number
  due_on: string | null
  status: PaymentStatus
  entries: PaymentEntry[]
}

export type Certificate = {
  id: string
  document_path: string | null
  visit_on: string | null
  expires_on: string | null
  laboratory: string | null
  status: CertificateStatus
  rejection_reason: string | null
  created_at: string
}

export type ProfileForm = {
  nome: string
  cognome: string
  email: string
  data_nascita: string
  phone: string
  note_mediche: string
  tags: string[]
  default_view: "ACTIVITY" | "CALENDAR"
}

function formatDate(value: string | null) {
  return value ? format(new Date(`${value}T12:00:00`), "d MMM yyyy", { locale: it }) : "—"
}

export function statusTone(status: string) {
  if (status === "PAID" || status === "VALID" || status === "ACTIVE" || status === "YES") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
  }
  if (status === "PENDING_REVIEW" || status === "SUBMITTED" || status === "TRAINING_ONLY") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
  }
  return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
}

type FormChange = (form: ProfileForm) => void

export function PersonalDataCard({ form, onChange }: { form: ProfileForm; onChange: FormChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <User className="h-5 w-5 text-primary" aria-hidden="true" />
          Dati personali
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            autoComplete="given-name"
            value={form.nome}
            onChange={(event) => onChange({ ...form, nome: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-surname">Cognome</Label>
          <Input
            id="profile-surname"
            autoComplete="family-name"
            value={form.cognome}
            onChange={(event) => onChange({ ...form, cognome: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              className="pl-9"
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-phone">Telefono di contatto</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="pl-9"
              placeholder="+39…"
              value={form.phone}
              onChange={(event) => onChange({ ...form, phone: event.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-birth">Data di nascita</Label>
          <Input
            id="profile-birth"
            type="date"
            value={form.data_nascita}
            onChange={(event) => onChange({ ...form, data_nascita: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-calendar-view">Vista calendario</Label>
          <div id="profile-calendar-view" className="grid grid-cols-2 rounded-lg border p-1">
            {(["ACTIVITY", "CALENDAR"] as const).map((view) => (
              <Button
                key={view}
                type="button"
                size="sm"
                variant={form.default_view === view ? "default" : "ghost"}
                onClick={() => onChange({ ...form, default_view: view })}
              >
                {view === "ACTIVITY" ? "Lista" : "Calendario"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function TraitsCard({ form, onChange }: { form: ProfileForm; onChange: FormChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Caratteristiche e note personali</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-2 block">Tag</Label>
          <div className="flex flex-wrap gap-2">
            {BOMBER_TAGS.map((tag) => {
              const selected = form.tags.includes(tag)
              return (
                <Button
                  key={tag}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({
                      ...form,
                      tags: selected
                        ? form.tags.filter((current) => current !== tag)
                        : [...form.tags, tag],
                    })
                  }
                >
                  {selected && <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
                  {tag}
                </Button>
              )
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-medical-notes">Note mediche personali</Label>
          <Textarea
            id="profile-medical-notes"
            className="min-h-24 resize-y"
            placeholder="Allergie, infortuni o indicazioni utili…"
            value={form.note_mediche}
            onChange={(event) => onChange({ ...form, note_mediche: event.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function TeamDataCard({
  membership,
  jerseyChoiceClosed,
  hasJerseyPreferences,
}: {
  membership: Membership | null
  jerseyChoiceClosed: boolean
  hasJerseyPreferences: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shirt className="h-5 w-5 text-primary" aria-hidden="true" />
          Dati squadra
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {[
          ["Ruolo", membership?.role ?? membership?.staff_function ?? "—"],
          ["Maglia", membership?.jersey_number?.toString() ?? "—"],
          ["Tessera ASI", membership?.asi_card_number ?? "—"],
          ["Dipartimento", membership?.department ?? "—"],
          ["Taglia divisa", membership?.uniform_size ?? "—"],
          ["Data tesseramento", formatDate(membership?.registration_completed_on ?? null)],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-bold">{value}</span>
          </div>
        ))}
        <p className="pt-2 text-xs text-muted-foreground">
          Ruolo, maglia e tessera ASI sono modificabili solo dai manager.
        </p>
        {membership?.category === "PLAYER" && membership.status === "YES" && (
          <Link
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-semibold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/maglie"
          >
            <span>
              {jerseyChoiceClosed
                ? "Numeri di maglia"
                : "Preferenze numero di maglia"}
              <span
                className={`block text-xs font-medium ${
                  hasJerseyPreferences || jerseyChoiceClosed
                    ? "text-muted-foreground"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {jerseyChoiceClosed
                  ? "Numeri assegnati · vedi"
                  : hasJerseyPreferences
                    ? "Indicate · modifica"
                    : "Da indicare"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

export function PassportPhotoCard({
  membership,
  editable,
  uploading,
  onUpload,
  onOpen,
}: {
  membership: Membership | null
  editable: boolean
  uploading: boolean
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOpen: (path: string | null) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileBadge className="h-5 w-5 text-primary" aria-hidden="true" />
          Fototessera
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Documento privato usato per il tesseramento.
        </p>
        {membership?.passport_photo_path && (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => onOpen(membership.passport_photo_path)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Visualizza fototessera
          </Button>
        )}
        <Label
          htmlFor="passport-upload"
          className={`flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm font-bold ${
            editable
              ? "cursor-pointer hover:border-primary hover:bg-muted/40"
              : "cursor-not-allowed bg-muted/40 text-muted-foreground"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-4 w-4" aria-hidden="true" />
          )}
          {membership?.passport_photo_path ? "Sostituisci fototessera" : "Carica fototessera"}
        </Label>
        <Input
          id="passport-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          style={{ height: 1, left: 0, top: 0, width: 1 }}
          disabled={!editable || uploading}
          onChange={onUpload}
        />
        {!editable && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Bloccata dopo il tesseramento. Un manager può riaprire la modifica.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const EMPTY_CERTIFICATE_FORM = { visitOn: "", expiresOn: "", laboratory: "" }

/** Ultimo certificato e invio di uno nuovo, che il manager poi verifica. */
export function CertificateCard({
  profileId,
  membershipId,
  latestCertificate,
  onOpen,
  onSubmitted,
}: {
  profileId: string
  membershipId: string
  latestCertificate: Certificate | null
  onOpen: (path: string | null) => void
  onSubmitted: (certificate: Certificate) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [certificateForm, setCertificateForm] = useState(EMPTY_CERTIFICATE_FORM)

  async function submitCertificate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fileInput = event.currentTarget.elements.namedItem("certificate-file") as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) {
      toast.error("Seleziona il PDF del certificato")
      return
    }
    if (file.type !== "application/pdf") {
      toast.error("Il certificato deve essere un PDF")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Il PDF non può superare 10 MB")
      return
    }
    if (!certificateForm.visitOn || !certificateForm.expiresOn || !certificateForm.laboratory.trim()) {
      toast.error("Compila data visita, scadenza e laboratorio")
      return
    }

    setUploading(true)
    const certificateId = crypto.randomUUID()
    const path = `${profileId}/${membershipId}/${certificateId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from("medical-certificates")
      .upload(path, file, { contentType: "application/pdf" })
    if (uploadError) {
      toast.error(uploadError.message)
      setUploading(false)
      return
    }

    const { data, error } = await supabase
      .from("medical_certificates")
      .insert({
        id: certificateId,
        membership_id: membershipId,
        document_path: path,
        competitive_declared: true,
        visit_on: certificateForm.visitOn,
        expires_on: certificateForm.expiresOn,
        laboratory: certificateForm.laboratory.trim(),
        status: "PENDING_REVIEW",
        updated_by: profileId,
      })
      .select("id, document_path, visit_on, expires_on, laboratory, status, rejection_reason, created_at")
      .single()

    if (error) {
      await supabase.storage.from("medical-certificates").remove([path])
      toast.error(error.message)
    } else {
      onSubmitted(data as Certificate)
      setCertificateForm({ visitOn: "", expiresOn: "", laboratory: "" })
      fileInput.value = ""
      toast.success("Certificato inviato al manager per la verifica")
    }
    setUploading(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          Certificato agonistico
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {latestCertificate && (
          <div className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="outline" className={statusTone(latestCertificate.status)}>
                  {certificateStatusLabel(latestCertificate.status)}
                </Badge>
                <p className="mt-2 text-sm font-bold">
                  Scadenza {formatDate(latestCertificate.expires_on)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Visita {formatDate(latestCertificate.visit_on)} · {latestCertificate.laboratory}
                </p>
              </div>
              {latestCertificate.document_path && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Apri certificato"
                  onClick={() => onOpen(latestCertificate.document_path)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
            {latestCertificate.rejection_reason && (
              <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
                {latestCertificate.rejection_reason}
              </p>
            )}
          </div>
        )}

        <form className="space-y-3" onSubmit={submitCertificate}>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="certificate-visit">Data visita</Label>
              <Input
                id="certificate-visit"
                type="date"
                value={certificateForm.visitOn}
                onChange={(event) =>
                  setCertificateForm({ ...certificateForm, visitOn: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="certificate-expiry">Scadenza</Label>
              <Input
                id="certificate-expiry"
                type="date"
                value={certificateForm.expiresOn}
                onChange={(event) =>
                  setCertificateForm({ ...certificateForm, expiresOn: event.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="certificate-lab">Laboratorio</Label>
            <Input
              id="certificate-lab"
              value={certificateForm.laboratory}
              onChange={(event) =>
                setCertificateForm({ ...certificateForm, laboratory: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="certificate-file">PDF certificato agonistico</Label>
            <Input
              id="certificate-file"
              name="certificate-file"
              type="file"
              accept="application/pdf"
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            Invia per verifica
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function PaymentsCard({
  payments,
  recipients,
  busy,
  documents,
  canDeleteDocument,
  onCancelEntry,
  onRegister,
}: {
  payments: Payment[]
  recipients: CashRecipient[]
  busy: boolean
  documents: MembershipDocumentsState
  canDeleteDocument: (document: MembershipDocument) => boolean
  onCancelEntry: (entryId: string) => void
  onRegister: (paymentId: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
          Quote e pagamenti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nessuna quota richiesta.
          </p>
        ) : (
          payments.map((payment) => {
            const remaining = remainingAmount(payment.amount_due, payment.entries)
            return (
            <div key={payment.id} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{payment.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Scadenza {formatDate(payment.due_on)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">{formatEuro(payment.amount_due)}</p>
                  <Badge variant="outline" className={statusTone(payment.status)}>
                    {paymentStatusLabel(payment.status)}
                  </Badge>
                </div>
              </div>
              <PaymentProgress
                due={payment.amount_due}
                paid={paidAmount(payment.entries)}
              />
              <PaymentEntriesList
                busy={busy}
                entries={payment.entries}
                onCancel={onCancelEntry}
                recipients={recipients}
              />
              {payment.status !== "PAID" && remaining > 0 && (
                <Button
                  className="w-full"
                  onClick={() => onRegister(payment.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Registra pagamento
                </Button>
              )}
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                Ricevuta
                <PaymentReceipt
                  canDelete={canDeleteDocument}
                  label={`ricevuta ${payment.description}`}
                  paymentId={payment.id}
                  state={documents}
                />
              </div>
            </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
