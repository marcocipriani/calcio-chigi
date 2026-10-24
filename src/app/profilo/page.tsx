"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  FileText,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import { AppCredits } from "@/components/AppCredits"
import {
  MembershipDocuments,
  useMembershipDocuments,
} from "@/components/documents/MembershipDocuments"
import { JerseyHistory } from "@/components/jersey/JerseyHistory"
import { PaymentEntryDialog } from "@/components/payments/PaymentEntryDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import {
  CertificateCard,
  PassportPhotoCard,
  PaymentsCard,
  PersonalDataCard,
  statusTone,
  TeamDataCard,
  TraitsCard,
  type Certificate,
  type Membership,
  type Payment,
  type ProfileForm,
  type Season,
} from "@/components/profile/ProfileSections"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { fetchOwnProfile } from "@/lib/api"
import {
  fetchJerseyDraft,
  fetchJerseyHistory,
  fetchOwnJerseyPreferences,
  type JerseyHistoryEntry,
} from "@/lib/jersey-api"
import {
  fetchMembershipDocuments,
  type MembershipDocument,
} from "@/lib/membership-documents"
import {
  canEditPassportPhoto,
  registrationStatusLabel,
  type PaymentStatus,
} from "@/lib/profile-operations"
import {
  fetchCashRecipients,
  fetchPaymentSettings,
  formatEuro,
  paidAmount,
  PAYMENT_ENTRY_COLUMNS,
  remainingAmount,
  toPaymentEntries,
  type CashRecipient,
  type PaymentSettings,
} from "@/lib/payments"
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser"
import type { FullProfile } from "@/lib/types"

const emptyForm: ProfileForm = {
  nome: "",
  cognome: "",
  email: "",
  data_nascita: "",
  phone: "",
  note_mediche: "",
  tags: [],
  default_view: "ACTIVITY",
}

async function fetchOwnPayments(membershipId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(`id, description, amount_due, due_on, status, ${PAYMENT_ENTRY_COLUMNS}`)
    .eq("membership_id", membershipId)
    .order("due_on", { ascending: true })
  if (error) {
    toast.error(error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    description: String(row.description),
    amount_due: Number(row.amount_due),
    due_on: (row.due_on as string | null) ?? null,
    status: row.status as PaymentStatus,
    entries: toPaymentEntries(row.payment_entries),
  }))
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingPassport, setUploadingPassport] = useState(false)
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [recipients, setRecipients] = useState<CashRecipient[]>([])
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null)
  const [entryPaymentId, setEntryPaymentId] = useState<string | null>(null)
  const [entryBusy, setEntryBusy] = useState(false)
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [ownDocuments, setOwnDocuments] = useState<MembershipDocument[]>([])
  const [jerseyHistory, setJerseyHistory] = useState<JerseyHistoryEntry[]>([])
  const [hasJerseyPreferences, setHasJerseyPreferences] = useState(false)
  const [jerseyChoiceClosed, setJerseyChoiceClosed] = useState(false)
  const [form, setForm] = useState<ProfileForm>(emptyForm)
  const [initialForm, setInitialForm] = useState<ProfileForm>(emptyForm)

  const documents = useMembershipDocuments(
    profile && membership
      ? { profileId: profile.id, membershipId: membership.id }
      : null,
    ownDocuments,
  )
  // Il giocatore elimina solo ciò che ha caricato lui.
  const canDeleteDocument = (document: MembershipDocument) =>
    document.uploadedBy === profile?.id

  const loadProfile = useCallback(async () => {
    setLoading(true)
    const ownProfile = await fetchOwnProfile(supabase)
    if (!ownProfile) {
      router.replace("/login")
      return
    }

    const [{ data: latestSeason }, { data: privateDetails }] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, slug, starts_on, ends_on")
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profile_private_details")
        .select("phone")
        .eq("profile_id", ownProfile.id)
        .maybeSingle(),
    ])

    let latestMembership: Membership | null = null
    let ownPayments: Payment[] = []
    let ownCertificates: Certificate[] = []
    let loadedDocuments: MembershipDocument[] = []

    if (latestSeason) {
      const { data } = await supabase
        .from("season_memberships")
        .select(
          "id, season_id, category, role, staff_function, jersey_number, uniform_size, asi_card_number, department, status, registration_status, registration_completed_on, passport_photo_path, passport_photo_unlocked_at",
        )
        .eq("profile_id", ownProfile.id)
        .eq("season_id", latestSeason.id)
        .maybeSingle()
      latestMembership = data as Membership | null
    }

    const isPlayer = latestMembership?.category === "PLAYER"
    const [history, jerseyPreferences, jerseyDraft] = await Promise.all([
      fetchJerseyHistory(supabase, ownProfile.id).catch(() => []),
      isPlayer && latestMembership
        ? fetchOwnJerseyPreferences(supabase, latestMembership.id).catch(
            () => null,
          )
        : Promise.resolve(null),
      isPlayer && latestMembership
        ? fetchJerseyDraft(supabase, latestMembership.season_id).catch(
            () => null,
          )
        : Promise.resolve(null),
    ])

    if (latestMembership) {
      const [loadedPayments, { data: certificateRows }, documentRows] = await Promise.all([
        fetchOwnPayments(latestMembership.id),
        supabase
          .from("medical_certificates")
          .select("id, document_path, visit_on, expires_on, laboratory, status, rejection_reason, created_at")
          .eq("membership_id", latestMembership.id)
          .order("created_at", { ascending: false }),
        fetchMembershipDocuments(supabase, [latestMembership.id]).catch(() => []),
      ])
      ownPayments = loadedPayments
      ownCertificates = (certificateRows ?? []) as Certificate[]
      loadedDocuments = documentRows
    }

    const nextForm: ProfileForm = {
      nome: ownProfile.nome ?? "",
      cognome: ownProfile.cognome ?? "",
      email: ownProfile.email ?? "",
      data_nascita: ownProfile.data_nascita ?? "",
      phone: privateDetails?.phone ?? "",
      note_mediche: ownProfile.note_mediche === "OK" ? "" : ownProfile.note_mediche ?? "",
      tags: ownProfile.tags ?? [],
      default_view: ownProfile.default_view === "CALENDAR" ? "CALENDAR" : "ACTIVITY",
    }

    setProfile(ownProfile)
    setSeason(latestSeason as Season | null)
    setMembership(latestMembership)
    setPayments(ownPayments)
    if (ownPayments.length) {
      void Promise.all([
        fetchCashRecipients(supabase).catch(() => []),
        fetchPaymentSettings(supabase).catch(() => null),
      ]).then(([loadedRecipients, settings]) => {
        setRecipients(loadedRecipients)
        setPaymentSettings(settings)
      })
    }
    setCertificates(ownCertificates)
    setOwnDocuments(loadedDocuments)
    setJerseyHistory(history)
    setHasJerseyPreferences(jerseyPreferences !== null)
    setJerseyChoiceClosed(Boolean(jerseyDraft?.confirmedAt))
    setForm(nextForm)
    setInitialForm(nextForm)
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadProfile().catch(() => {
      toast.error("Impossibile caricare il profilo.")
      setLoading(false)
    })
  }, [loadProfile])

  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  )
  const isManager = profile?.is_manager === true
  const passportEditable = membership
    ? canEditPassportPhoto(
        membership.registration_status,
        isManager,
        membership.passport_photo_unlocked_at,
      )
    : false
  const latestCertificate = certificates[0] ?? null
  const openPayments = payments.filter((payment) => payment.status !== "PAID")
  const openAmount = openPayments.reduce(
    (total, payment) => total + Number(payment.amount_due) - paidAmount(payment.entries),
    0,
  )
  const entryPayment = payments.find(({ id }) => id === entryPaymentId) ?? null

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)

    const [{ error: profileError }, { error: privateError }] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          nome: form.nome.trim(),
          cognome: form.cognome.trim(),
          email: form.email.trim() || null,
          data_nascita: form.data_nascita || null,
          note_mediche: form.note_mediche.trim() || "OK",
          tags: form.tags,
          default_view: form.default_view,
        })
        .eq("id", profile.id),
      supabase.from("profile_private_details").upsert(
        {
          profile_id: profile.id,
          phone: form.phone.trim() || null,
          updated_by: profile.id,
        },
        { onConflict: "profile_id" },
      ),
    ])

    if (profileError || privateError) {
      toast.error(profileError?.message ?? privateError?.message ?? "Salvataggio non riuscito")
    } else {
      setInitialForm(form)
      toast.success("Profilo aggiornato")
    }
    setSaving(false)
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !profile) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Usa un’immagine JPG, PNG o WebP")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("L’avatar non può superare 2 MB")
      return
    }

    setUploadingAvatar(true)
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    const path = `players/${profile.id}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      toast.error(uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", profile.id)

    if (error) toast.error(error.message)
    else {
      setProfile({ ...profile, avatar_url: avatarUrl })
      toast.success("Avatar aggiornato")
    }
    setUploadingAvatar(false)
    event.target.value = ""
  }

  async function uploadPassportPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !profile || !membership || !passportEditable) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Usa una fototessera JPG, PNG o WebP")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La fototessera non può superare 5 MB")
      return
    }

    setUploadingPassport(true)
    const path = `${profile.id}/${membership.id}/passport-photo`
    const { error: uploadError } = await supabase.storage
      .from("passport-photos")
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) {
      toast.error(uploadError.message)
      setUploadingPassport(false)
      return
    }

    const { data, error } = await supabase
      .from("season_memberships")
      .update({ passport_photo_path: path })
      .eq("id", membership.id)
      .select(
        "id, season_id, category, role, staff_function, jersey_number, uniform_size, asi_card_number, department, status, registration_status, registration_completed_on, passport_photo_path, passport_photo_unlocked_at",
      )
      .single()

    if (error) toast.error(error.message)
    else {
      setMembership(data as Membership)
      toast.success("Fototessera salvata")
    }
    setUploadingPassport(false)
    event.target.value = ""
  }

  async function openPrivateDocument(bucket: string, path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
    if (error) {
      toast.error(error.message)
      return
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function reloadPayments() {
    if (membership) setPayments(await fetchOwnPayments(membership.id))
  }

  async function cancelEntry(entryId: string) {
    setEntryBusy(true)
    const { error } = await supabase.rpc("cancel_payment_entry", {
      p_entry_id: entryId,
    })
    setEntryBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Pagamento annullato")
    await reloadPayments()
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  if (loading) {
    return (
      <PageContainer contentClassName="mx-auto max-w-5xl pb-24">
        <main className="space-y-4">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-[540px] rounded-2xl lg:col-span-2" />
            <Skeleton className="h-[540px] rounded-2xl" />
          </div>
        </main>
      </PageContainer>
    )
  }

  return (
    <PageContainer contentClassName="mx-auto max-w-5xl pb-24">
      <main className="space-y-4">
      <PageTitleBar
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Esci"
                className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                onClick={logout}
                size="sm"
                variant="outline"
              >
                <LogOut aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Esci</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">Esci</TooltipContent>
          </Tooltip>
        }
        subtitle="Area personale"
        title="Profilo"
      />

      <section className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="group relative w-fit shrink-0">
            <Avatar className="h-24 w-24 border-4 border-background shadow-lg ring-1 ring-border">
              <AvatarImage
                className="object-cover"
                src={profile?.avatar_url ?? undefined}
                alt={`Avatar di ${form.nome} ${form.cognome}`}
              />
              <AvatarFallback className="text-2xl font-black">
                {form.nome[0]}
                {form.cognome[0]}
              </AvatarFallback>
            </Avatar>
            <Label
              htmlFor="avatar-upload"
              className="absolute inset-0 grid cursor-pointer place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="h-6 w-6" aria-hidden="true" />
              )}
              <span className="sr-only">Cambia avatar</span>
            </Label>
            {/* Su touch non c'è hover: il badge segnala che la foto si può cambiare. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid size-8 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm"
            >
              <Camera className="size-4" />
            </span>
            <Input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              style={{ height: 1, left: 0, top: 0, width: 1 }}
              disabled={uploadingAvatar}
              onChange={uploadAvatar}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-black">
                {form.nome} {form.cognome}
              </h2>
              {isManager && (
                <Badge className="border-0 bg-operative text-operative-foreground">
                  <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                  Manager
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {membership?.category === "STAFF"
                ? membership.staff_function || "Staff"
                : membership?.role || "Ruolo da assegnare"}
              {membership?.jersey_number != null ? ` · Maglia ${membership.jersey_number}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {season && <Badge variant="outline">{season.name}</Badge>}
              {membership && (
                <Badge variant="outline" className={statusTone(membership.status)}>
                  {membership.status === "YES"
                    ? "In rosa"
                    : membership.status === "TRAINING_ONLY"
                      ? "Solo allenamenti"
                      : "Archiviato"}
                </Badge>
              )}
              {membership && (
                <Badge
                  variant="outline"
                  className={statusTone(membership.registration_status)}
                >
                  {membership.registration_status === "ACTIVE"
                    ? "Tesserato"
                    : `Tesseramento ${registrationStatusLabel(membership.registration_status).toLowerCase()}`}
                </Badge>
              )}
            </div>
          </div>

          {openPayments.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              <span className="block text-[10px] font-black uppercase tracking-wider">
                Quote aperte
              </span>
              <span className="text-2xl font-black">{formatEuro(openAmount)}</span>
            </div>
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <form className="space-y-4" onSubmit={handleSave}>
          <PersonalDataCard form={form} onChange={setForm} />
          <TraitsCard form={form} onChange={setForm} />

          <div className="flex items-center justify-end gap-2">
            {hasChanges && (
              <Button type="button" variant="ghost" onClick={() => setForm(initialForm)}>
                Annulla
              </Button>
            )}
            <Button type="submit" className="gap-2" disabled={!hasChanges || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salva profilo
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <TeamDataCard
            hasJerseyPreferences={hasJerseyPreferences}
            jerseyChoiceClosed={jerseyChoiceClosed}
            membership={membership}
          />

          <JerseyHistory entries={jerseyHistory} />

          <PassportPhotoCard
            editable={passportEditable}
            membership={membership}
            onOpen={(path) => void openPrivateDocument("passport-photos", path)}
            onUpload={uploadPassportPhoto}
            uploading={uploadingPassport}
          />

          {membership?.category === "PLAYER" && profile && (
            <CertificateCard
              latestCertificate={latestCertificate}
              membershipId={membership.id}
              onOpen={(path) => void openPrivateDocument("medical-certificates", path)}
              onSubmitted={(certificate) => setCertificates((current) => [certificate, ...current])}
              profileId={profile.id}
            />
          )}

          {membership && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                  Documenti
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                <MembershipDocuments
                  canDelete={canDeleteDocument}
                  state={documents}
                />
              </CardContent>
            </Card>
          )}

          <PaymentsCard
            busy={entryBusy}
            canDeleteDocument={canDeleteDocument}
            documents={documents}
            onCancelEntry={(entryId) => void cancelEntry(entryId)}
            onRegister={setEntryPaymentId}
            payments={payments}
            recipients={recipients}
          />
        </div>
      </div>

      {entryPayment && profile && (
        <PaymentEntryDialog
          currentProfileId={profile.id}
          description={entryPayment.description}
          mode="player"
          onOpenChange={(open) => !open && setEntryPaymentId(null)}
          onSaved={reloadPayments}
          open
          ownerName={`${profile.nome} ${profile.cognome}`}
          ownerProfileId={profile.id}
          paymentId={entryPayment.id}
          recipients={recipients}
          remaining={remainingAmount(entryPayment.amount_due, entryPayment.entries)}
          settings={paymentSettings}
        />
      )}

      <AppCredits uid={profile?.id} />
      </main>
    </PageContainer>
  )
}
