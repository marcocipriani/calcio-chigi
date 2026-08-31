"use client"

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import {
  Camera,
  CreditCard,
  ExternalLink,
  FileText,
  IdCard,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

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
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { Textarea } from "@/components/ui/textarea"
import type { ManagementPerson } from "@/lib/management"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const certificateLabels = {
  MISSING: "Mancante",
  PENDING_REVIEW: "Da verificare",
  VALID: "Valido",
  REJECTED: "Respinto",
  EXPIRED: "Scaduto",
}

const paymentLabels = {
  DUE: "Da pagare",
  PENDING_REVIEW: "Da verificare",
  PAID: "Pagato",
}

const accountLabels = {
  NONE: "non registrato",
  REQUESTED: "da approvare",
  ACTIVE: "attivo",
}

export function PersonDrawer({
  person,
  onOpenChange,
  onSaved,
}: {
  person: ManagementPerson | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [category, setCategory] = useState<"PLAYER" | "STAFF">(
    person?.category ?? "PLAYER",
  )
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<"AVATAR" | "PASSPORT" | null>(null)
  const [pendingForm, setPendingForm] = useState<FormData | null>(null)

  useEffect(() => {
    if (person) {
      setCategory(person.category)
      setPendingForm(null)
    }
  }, [person])

  if (!person) return null
  const currentPerson = person

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const sensitiveChanged =
      String(form.get("asiCardNumber") ?? "") !==
        (currentPerson.asiCardNumber ?? "") ||
      String(form.get("registrationStatus")) !==
        currentPerson.registrationStatus ||
      String(form.get("birthDate") ?? "") !==
        (currentPerson.birthDate ?? "") ||
      (form.get("isManager") === "on") !== Boolean(currentPerson.isManager)

    if (sensitiveChanged) {
      setPendingForm(form)
      return
    }

    await save(form)
  }

  async function save(form: FormData) {
    setBusy(true)
    const { error } = await supabaseBrowser.rpc("manager_update_person", {
      p_profile_id: currentPerson.profileId,
      p_membership_id: currentPerson.id,
      p_expected_profile_updated_at: currentPerson.profileUpdatedAt,
      p_expected_membership_updated_at: currentPerson.membershipUpdatedAt,
      p_expected_private_updated_at: currentPerson.privateUpdatedAt,
      p_profile: {
        nome: String(form.get("nome") ?? ""),
        cognome: String(form.get("cognome") ?? ""),
        data_nascita: String(form.get("birthDate") ?? ""),
        joined_on: String(form.get("joinedOn") ?? ""),
        is_manager: form.get("isManager") === "on",
      },
      p_private: {
        phone: String(form.get("phone") ?? ""),
        operational_email: String(form.get("operationalEmail") ?? ""),
      },
      p_membership: {
        category,
        status: String(form.get("status")),
        role: String(form.get("role") ?? ""),
        staff_function: String(form.get("staffFunction") ?? ""),
        jersey_number: String(form.get("jerseyNumber") ?? ""),
        department: String(form.get("department") ?? ""),
        asi_card_number: String(form.get("asiCardNumber") ?? ""),
        uniform_size: String(form.get("uniformSize") ?? ""),
        is_external: form.get("isExternal") === "on",
        is_aggregated: form.get("isAggregated") === "on",
        training_only: form.get("trainingOnly") === "on",
        operational_notes: String(form.get("operationalNotes") ?? ""),
        next_contact_on: String(form.get("nextContactOn") ?? ""),
        registration_status: String(form.get("registrationStatus")),
        registration_completed_on: String(
          form.get("registrationCompletedOn") ?? "",
        ),
      },
    })
    setBusy(false)

    if (error) {
      toast.error(
        error.code === "40001"
          ? "Scheda aggiornata da un altro manager"
          : "Modifiche non salvate",
        {
          description:
            error.code === "40001"
              ? "Riapri la scheda per usare i dati più recenti."
              : error.message,
        },
      )
      return
    }
    toast.success("Scheda aggiornata")
    setPendingForm(null)
    onOpenChange(false)
    await onSaved()
  }

  async function openPrivateDocument(bucket: string, path?: string | null) {
    if (!path) return
    const { data, error } = await supabaseBrowser.storage
      .from(bucket)
      .createSignedUrl(path, 60)
    if (error) {
      toast.error("Documento non disponibile", { description: error.message })
      return
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Usa un’immagine JPG, PNG o WebP")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("L’avatar non può superare 2 MB")
      return
    }

    setUploading("AVATAR")
    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg"
    const path = `players/${currentPerson.profileId}.${extension}`
    const { error: uploadError } = await supabaseBrowser.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      toast.error("Avatar non caricato", { description: uploadError.message })
      setUploading(null)
      return
    }

    const { data } = supabaseBrowser.storage.from("avatars").getPublicUrl(path)
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await supabaseBrowser
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", currentPerson.profileId)

    setUploading(null)
    event.target.value = ""
    if (error) {
      toast.error("Avatar non aggiornato", { description: error.message })
      return
    }
    toast.success("Avatar aggiornato")
    onOpenChange(false)
    await onSaved()
  }

  async function uploadPassport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Usa una fototessera JPG, PNG o WebP")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La fototessera non può superare 5 MB")
      return
    }

    setUploading("PASSPORT")
    const path = `${currentPerson.profileId}/${currentPerson.id}/passport-photo`
    const { error: uploadError } = await supabaseBrowser.storage
      .from("passport-photos")
      .upload(path, file, { contentType: file.type, upsert: true })
    if (uploadError) {
      toast.error("Fototessera non caricata", {
        description: uploadError.message,
      })
      setUploading(null)
      return
    }

    const { error } = await supabaseBrowser
      .from("season_memberships")
      .update({ passport_photo_path: path })
      .eq("id", currentPerson.id)
    setUploading(null)
    event.target.value = ""
    if (error) {
      toast.error("Fototessera non collegata", { description: error.message })
      return
    }
    toast.success("Fototessera aggiornata")
    onOpenChange(false)
    await onSaved()
  }

  return (
    <>
      <Dialog
        open={Boolean(person)}
        onOpenChange={(open) => {
          if (!open) setPendingForm(null)
          onOpenChange(open)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 text-left">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 shrink-0 ring-1 ring-border">
              <AvatarImage
                alt={`${person.nome} ${person.cognome}`}
                className="object-cover"
                src={person.avatarUrl ?? undefined}
              />
              <AvatarFallback className="font-bold">
                {person.nome[0]}
                {person.cognome[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>
                  {person.nome} {person.cognome}
                </DialogTitle>
                {person.isManager && (
                  <Badge className="bg-violet-600">Manager</Badge>
                )}
              </div>
              <DialogDescription>
                Scheda stagione · account {accountLabels[person.accountStatus]}
              </DialogDescription>
            </div>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <Camera aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">
                {uploading === "AVATAR" ? "Caricamento…" : "Avatar"}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={Boolean(uploading)}
                onChange={uploadAvatar}
                type="file"
              />
            </label>
          </div>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <div className="grid flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-2">
            <section className="grid content-start gap-3">
              <h3 className="text-sm font-semibold">
                Persona e contatti
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-birth">Data di nascita</Label>
                  <Input
                    defaultValue={person.birthDate ?? ""}
                    id="person-birth"
                    name="birthDate"
                    type="date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-name">Nome</Label>
                  <Input
                    defaultValue={person.nome}
                    id="person-name"
                    name="nome"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-surname">Cognome</Label>
                  <Input
                    defaultValue={person.cognome}
                    id="person-surname"
                    name="cognome"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-phone">Telefono</Label>
                  <Input
                    defaultValue={person.phone ?? ""}
                    id="person-phone"
                    name="phone"
                    type="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-email">Email operativa</Label>
                  <Input
                    defaultValue={person.operationalEmail ?? ""}
                    id="person-email"
                    name="operationalEmail"
                    type="email"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-joined">In squadra dal</Label>
                  <Input
                    defaultValue={person.joinedOn ?? ""}
                    id="person-joined"
                    name="joinedOn"
                    type="date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-department">Dipartimento</Label>
                  <Input
                    defaultValue={person.department ?? ""}
                    id="person-department"
                    name="department"
                  />
                </div>
              </div>
              <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                <input
                  className="size-4 accent-violet-600"
                  defaultChecked={person.isManager}
                  name="isManager"
                  type="checkbox"
                />
                Permesso manager
              </label>
            </section>

            <section className="grid content-start gap-3">
              <h3 className="text-sm font-semibold">
                Stagione
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-category">Categoria</Label>
                  <select
                    className={selectClass}
                    id="person-category"
                    onChange={(event) =>
                      setCategory(event.target.value as "PLAYER" | "STAFF")
                    }
                    value={category}
                  >
                    <option value="PLAYER">Giocatore</option>
                    <option value="STAFF">Staff</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-status">Stato</Label>
                  <select
                    className={selectClass}
                    defaultValue={person.status}
                    id="person-status"
                    name="status"
                  >
                    <option value="YES">In rosa</option>
                    <option value="NO">Archiviato</option>
                  </select>
                </div>
              </div>
              {category === "PLAYER" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="person-role">Ruolo</Label>
                    <select
                      className={selectClass}
                      defaultValue={person.role ?? ""}
                      id="person-role"
                      name="role"
                    >
                      <option value="">Da definire</option>
                      <option value="PORTIERE">Portiere</option>
                      <option value="DIFENSORE">Difensore</option>
                      <option value="CENTROCAMPISTA">Centrocampista</option>
                      <option value="ATTACCANTE">Attaccante</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="person-number">Numero maglia</Label>
                    <Input
                      defaultValue={person.jerseyNumber ?? ""}
                      id="person-number"
                      max="99"
                      min="0"
                      name="jerseyNumber"
                      type="number"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="person-staff">Funzione staff</Label>
                  <Input
                    defaultValue={person.staffFunction ?? ""}
                    id="person-staff"
                    name="staffFunction"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-asi">Tessera ASI</Label>
                  <Input
                    defaultValue={person.asiCardNumber ?? ""}
                    id="person-asi"
                    name="asiCardNumber"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-size">Taglia divisa</Label>
                  <Input
                    defaultValue={person.uniformSize ?? ""}
                    id="person-size"
                    name="uniformSize"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {[
                  ["isExternal", "EXT", person.isExternal],
                  ["isAggregated", "AGG", person.isAggregated],
                  ["trainingOnly", "Solo allenamenti", person.trainingOnly],
                ].map(([name, label, checked]) => (
                  <label
                    className="flex min-h-10 items-center gap-2 text-sm"
                    key={String(name)}
                  >
                    <input
                      className="size-4 accent-primary"
                      defaultChecked={Boolean(checked)}
                      name={String(name)}
                      type="checkbox"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section className="grid content-start gap-3 md:col-span-2">
              <h3 className="text-sm font-semibold">
                Documenti
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex min-h-20 items-center gap-3 rounded-lg border p-3">
                  <IdCard
                    aria-hidden="true"
                    className="size-5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">Fototessera</strong>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.passportPhotoPath ? "Caricata" : "Mancante"}
                    </span>
                  </span>
                  {person.passportPhotoPath && (
                    <Button
                      aria-label="Apri fototessera"
                      onClick={() =>
                        void openPrivateDocument(
                          "passport-photos",
                          person.passportPhotoPath,
                        )
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ExternalLink aria-hidden="true" />
                    </Button>
                  )}
                  <label className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                    <Upload aria-hidden="true" className="size-4" />
                    <span className="sr-only">
                      {uploading === "PASSPORT"
                        ? "Caricamento fototessera"
                        : "Carica fototessera"}
                    </span>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={Boolean(uploading)}
                      onChange={uploadPassport}
                      type="file"
                    />
                  </label>
                </div>
                <div className="flex min-h-20 items-center gap-3 rounded-lg border p-3">
                  <FileText
                    aria-hidden="true"
                    className="size-5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">
                      Certificato agonistico
                    </strong>
                    <span className="block truncate text-xs text-muted-foreground">
                      {certificateLabels[person.certificateStatus]}
                      {person.certificateExpiresOn
                        ? ` · scade ${person.certificateExpiresOn}`
                        : ""}
                    </span>
                    {(person.certificateVisitOn ||
                      person.certificateLaboratory) && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {person.certificateVisitOn ?? "Visita non indicata"}
                        {person.certificateLaboratory
                          ? ` · ${person.certificateLaboratory}`
                          : ""}
                      </span>
                    )}
                  </span>
                  {person.certificateDocumentPath && (
                    <Button
                      aria-label="Apri certificato PDF"
                      onClick={() =>
                        void openPrivateDocument(
                          "medical-certificates",
                          person.certificateDocumentPath,
                        )
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ExternalLink aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </section>

            <section className="grid content-start gap-3 md:col-span-2">
              <h3 className="text-sm font-semibold">
                Pagamenti
              </h3>
              {person.payments.length ? (
                <div className="divide-y rounded-lg border">
                  {person.payments.map((payment) => (
                    <div
                      className="flex min-h-12 items-center gap-3 px-3 py-2"
                      key={payment.id}
                    >
                      <CreditCard
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {payment.description ?? "Quota"}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {payment.dueOn
                            ? `Scadenza ${payment.dueOn}`
                            : "Nessuna scadenza"}
                          {payment.method
                            ? ` · ${payment.method === "CASH" ? "contanti" : "bonifico"}`
                            : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <strong className="block text-sm tabular-nums">
                          {payment.amountDue.toLocaleString("it-IT", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </strong>
                        <Badge variant={payment.status === "PAID" ? "default" : "outline"}>
                          {paymentLabels[payment.status]}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nessuna quota assegnata.
                </p>
              )}
            </section>

            <section className="grid content-start gap-3 md:col-span-2">
              <h3 className="text-sm font-semibold">
                Operativo
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person-registration">Tesseramento</Label>
                  <select
                    className={selectClass}
                    defaultValue={person.registrationStatus}
                    id="person-registration"
                    name="registrationStatus"
                  >
                    <option value="TODO">Da fare</option>
                    <option value="SUBMITTED">In verifica</option>
                    <option value="ACTIVE">Attivo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-registration-date">
                    Data tesseramento
                  </Label>
                  <Input
                    defaultValue={person.registrationCompletedOn ?? ""}
                    id="person-registration-date"
                    name="registrationCompletedOn"
                    type="date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-contact">Prossimo contatto</Label>
                  <Input
                    defaultValue={person.nextContactOn ?? ""}
                    id="person-contact"
                    name="nextContactOn"
                    type="date"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-notes">Note operative</Label>
                <Textarea
                  className="min-h-20"
                  defaultValue={person.operationalNotes ?? ""}
                  id="person-notes"
                  name="operationalNotes"
                />
              </div>
            </section>
          </div>
          <DialogFooter className="border-t p-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Chiudi
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Salvataggio…" : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingForm)}
        onOpenChange={(open) => !open && setPendingForm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifiche delicate</AlertDialogTitle>
            <AlertDialogDescription>
              Stai modificando dati anagrafici o di tesseramento, tessera ASI
              oppure permesso manager. Controlla i dati prima di continuare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Torna alla scheda</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                if (pendingForm) void save(pendingForm)
              }}
            >
              Conferma e salva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
