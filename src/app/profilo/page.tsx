"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  Check,
  CreditCard,
  Download,
  FileBadge,
  FileText,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Shirt,
  Upload,
  User,
} from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"

import { AppCredits } from "@/components/AppCredits"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BOMBER_TAGS } from "@/lib/constants"
import { fetchOwnProfile } from "@/lib/api"
import {
  canEditPassportPhoto,
  certificateStatusLabel,
  type CertificateStatus,
  paymentStatusLabel,
  type PaymentStatus,
  type RegistrationStatus,
} from "@/lib/profile-operations"
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser"
import type { FullProfile } from "@/lib/types"

type Season = {
  id: string
  name: string
  slug: string
  starts_on: string
  ends_on: string
}

type Membership = {
  id: string
  season_id: string
  category: "PLAYER" | "STAFF"
  role: string | null
  staff_function: string | null
  jersey_number: number | null
  uniform_size: string | null
  asi_card_number: string | null
  department: string | null
  status: "INTERESTED" | "PENDING" | "YES" | "MAYBE" | "NO"
  registration_status: RegistrationStatus
  registration_completed_on: string | null
  passport_photo_path: string | null
  passport_photo_unlocked_at: string | null
}

type Payment = {
  id: string
  description: string
  amount_due: number
  due_on: string | null
  status: PaymentStatus
  method: "CASH" | "BANK_TRANSFER" | null
  declared_at: string | null
}

type Certificate = {
  id: string
  document_path: string | null
  visit_on: string | null
  expires_on: string | null
  laboratory: string | null
  status: CertificateStatus
  rejection_reason: string | null
  created_at: string
}

type ProfileForm = {
  nome: string
  cognome: string
  email: string
  data_nascita: string
  phone: string
  note_mediche: string
  tags: string[]
  default_view: "ACTIVITY" | "CALENDAR"
}

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

function formatDate(value: string | null) {
  return value ? format(new Date(`${value}T12:00:00`), "d MMM yyyy", { locale: it }) : "—"
}

function statusTone(status: string) {
  if (status === "PAID" || status === "VALID" || status === "ACTIVE" || status === "YES") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
  }
  if (status === "PENDING_REVIEW" || status === "SUBMITTED" || status === "MAYBE") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
  }
  return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingPassport, setUploadingPassport] = useState(false)
  const [uploadingCertificate, setUploadingCertificate] = useState(false)
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [form, setForm] = useState<ProfileForm>(emptyForm)
  const [initialForm, setInitialForm] = useState<ProfileForm>(emptyForm)
  const [certificateForm, setCertificateForm] = useState({
    visitOn: "",
    expiresOn: "",
    laboratory: "",
  })

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

    if (latestMembership) {
      const [{ data: paymentRows }, { data: certificateRows }] = await Promise.all([
        supabase
          .from("payments")
          .select("id, description, amount_due, due_on, status, method, declared_at")
          .eq("membership_id", latestMembership.id)
          .order("due_on", { ascending: true }),
        supabase
          .from("medical_certificates")
          .select("id, document_path, visit_on, expires_on, laboratory, status, rejection_reason, created_at")
          .eq("membership_id", latestMembership.id)
          .order("created_at", { ascending: false }),
      ])
      ownPayments = (paymentRows ?? []) as Payment[]
      ownCertificates = (certificateRows ?? []) as Certificate[]
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
    setCertificates(ownCertificates)
    setForm(nextForm)
    setInitialForm(nextForm)
    setLoading(false)
  }, [router])

  useEffect(() => {
    void loadProfile()
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
    (total, payment) => total + Number(payment.amount_due),
    0,
  )

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

  async function submitCertificate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fileInput = event.currentTarget.elements.namedItem("certificate-file") as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file || !profile || !membership) {
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

    setUploadingCertificate(true)
    const certificateId = crypto.randomUUID()
    const path = `${profile.id}/${membership.id}/${certificateId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from("medical-certificates")
      .upload(path, file, { contentType: "application/pdf" })
    if (uploadError) {
      toast.error(uploadError.message)
      setUploadingCertificate(false)
      return
    }

    const { data, error } = await supabase
      .from("medical_certificates")
      .insert({
        id: certificateId,
        membership_id: membership.id,
        document_path: path,
        competitive_declared: true,
        visit_on: certificateForm.visitOn,
        expires_on: certificateForm.expiresOn,
        laboratory: certificateForm.laboratory.trim(),
        status: "PENDING_REVIEW",
        updated_by: profile.id,
      })
      .select("id, document_path, visit_on, expires_on, laboratory, status, rejection_reason, created_at")
      .single()

    if (error) {
      await supabase.storage.from("medical-certificates").remove([path])
      toast.error(error.message)
    } else {
      setCertificates((current) => [data as Certificate, ...current])
      setCertificateForm({ visitOn: "", expiresOn: "", laboratory: "" })
      fileInput.value = ""
      toast.success("Certificato inviato al manager per la verifica")
    }
    setUploadingCertificate(false)
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

  async function declarePayment(paymentId: string, method: "CASH" | "BANK_TRANSFER") {
    const { data, error } = await supabase.rpc("declare_payment", {
      p_payment_id: paymentId,
      p_method: method,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId ? ({ ...payment, ...data } as Payment) : payment,
      ),
    )
    toast.success("Pagamento dichiarato: il manager lo verificherà")
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
            <Input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
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
                <Badge className="border-0 bg-purple-600 text-white">
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
                  Conferma {membership.status}
                </Badge>
              )}
              {membership && (
                <Badge
                  variant="outline"
                  className={statusTone(membership.registration_status)}
                >
                  Tesseramento {membership.registration_status}
                </Badge>
              )}
            </div>
          </div>

          {openPayments.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              <span className="block text-[10px] font-black uppercase tracking-wider">
                Quote aperte
              </span>
              <span className="text-2xl font-black">€ {openAmount.toFixed(2)}</span>
            </div>
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <form className="space-y-4" onSubmit={handleSave}>
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
                  onChange={(event) => setForm({ ...form, nome: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-surname">Cognome</Label>
                <Input
                  id="profile-surname"
                  autoComplete="family-name"
                  value={form.cognome}
                  onChange={(event) => setForm({ ...form, cognome: event.target.value })}
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
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
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
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-birth">Data di nascita</Label>
                <Input
                  id="profile-birth"
                  type="date"
                  value={form.data_nascita}
                  onChange={(event) => setForm({ ...form, data_nascita: event.target.value })}
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
                      onClick={() => setForm({ ...form, default_view: view })}
                    >
                      {view === "ACTIVITY" ? "Lista" : "Calendario"}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

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
                          setForm({
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
                  onChange={(event) => setForm({ ...form, note_mediche: event.target.value })}
                />
              </div>
            </CardContent>
          </Card>

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
            </CardContent>
          </Card>

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
                  onClick={() =>
                    openPrivateDocument("passport-photos", membership.passport_photo_path)
                  }
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Visualizza fototessera
                </Button>
              )}
              <Label
                htmlFor="passport-upload"
                className={`flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm font-bold ${
                  passportEditable
                    ? "cursor-pointer hover:border-primary hover:bg-muted/40"
                    : "cursor-not-allowed bg-muted/40 text-muted-foreground"
                }`}
              >
                {uploadingPassport ? (
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
                disabled={!passportEditable || uploadingPassport}
                onChange={uploadPassportPhoto}
              />
              {!passportEditable && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Bloccata dopo il tesseramento. Un manager può riaprire la modifica.
                </p>
              )}
            </CardContent>
          </Card>

          {membership?.category === "PLAYER" && (
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
                          onClick={() =>
                            openPrivateDocument(
                              "medical-certificates",
                              latestCertificate.document_path,
                            )
                          }
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
                  <Button type="submit" className="w-full gap-2" disabled={uploadingCertificate}>
                    {uploadingCertificate ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden="true" />
                    )}
                    Invia per verifica
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

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
                payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{payment.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Scadenza {formatDate(payment.due_on)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black">€ {Number(payment.amount_due).toFixed(2)}</p>
                        <Badge variant="outline" className={statusTone(payment.status)}>
                          {paymentStatusLabel(payment.status)}
                        </Badge>
                      </div>
                    </div>
                    {payment.status === "DUE" && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => declarePayment(payment.id, "CASH")}
                        >
                          Contanti
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => declarePayment(payment.id, "BANK_TRANSFER")}
                        >
                          Bonifico
                        </Button>
                      </div>
                    )}
                    {payment.status === "PENDING_REVIEW" && (
                      <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Dichiarato {payment.method === "CASH" ? "in contanti" : "con bonifico"}; in attesa del manager.
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AppCredits uid={profile?.id} />
      </main>
    </PageContainer>
  )
}
