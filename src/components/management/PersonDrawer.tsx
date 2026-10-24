"use client"

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import {
  Camera,
  Eye,
  IdCard,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import {
  DeleteDocumentButton,
  DocumentPreview,
} from "@/components/documents/DocumentControls"
import {
  MembershipDocuments,
  useMembershipDocuments,
} from "@/components/documents/MembershipDocuments"
import { InjuryHistory } from "@/components/injuries/InjuryHistory"
import { JerseyHistory } from "@/components/jersey/JerseyHistory"
import {
  CertificateCard,
  CertificateDialog,
  useCertificateEditor,
} from "@/components/management/PersonCertificate"
import {
  ContactFields,
  OperationalFields,
  SeasonFields,
} from "@/components/management/PersonDrawerFields"
import {
  PersonPaymentDialogs,
  PersonPaymentsSection,
  usePaymentReview,
} from "@/components/management/PersonPayments"
import {
  AttendancePercentage,
  AttendanceStreak,
} from "@/components/management/AttendanceStreak"
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchJerseyHistory, type JerseyHistoryEntry } from "@/lib/jersey-api"
import type { ManagementPerson } from "@/lib/management"
import { trashPerson } from "@/lib/management-api"
import type { Injury } from "@/lib/injuries"
import type { MembershipDocument } from "@/lib/membership-documents"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

const NO_DOCUMENTS: MembershipDocument[] = []
const NO_INJURIES: Injury[] = []

const accountLabels = {
  NONE: "non registrato",
  REQUESTED: "da approvare",
  ACTIVE: "attivo",
}

export function PersonDrawer({
  person,
  onOpenChange,
  onSaved,
  onAccountAction,
}: {
  person: ManagementPerson | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
  onAccountAction: (requestId: string, action: "APPROVE" | "REJECT") => void
}) {
  const { profile } = useAppSession()
  const [category, setCategory] = useState<"PLAYER" | "STAFF">(
    person?.category ?? "PLAYER",
  )
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<"AVATAR" | "PASSPORT" | null>(null)
  const [pendingForm, setPendingForm] = useState<FormData | null>(null)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [jerseyHistory, setJerseyHistory] = useState<JerseyHistoryEntry[]>([])
  const paymentReview = usePaymentReview(person, onSaved)
  const certificate = useCertificateEditor(person, async () => {
    onOpenChange(false)
    await onSaved()
  })

  useEffect(() => {
    if (person) {
      setCategory(person.category)
      setPendingForm(null)
      setConfirmTrash(false)
    }
  }, [person])

  const profileId = person?.profileId
  useEffect(() => {
    setJerseyHistory([])
    if (!profileId) return
    let active = true
    fetchJerseyHistory(supabaseBrowser, profileId)
      .then((entries) => {
        if (active) setJerseyHistory(entries)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [profileId])

  const passportPath = person?.passportPhotoPath
  const [passportUrl, setPassportUrl] = useState<string | null>(null)
  useEffect(() => {
    setPassportUrl(null)
    if (!passportPath) return
    let active = true
    void supabaseBrowser.storage
      .from("passport-photos")
      .createSignedUrl(passportPath, 300)
      .then(({ data }) => {
        if (active) setPassportUrl(data?.signedUrl ?? null)
      })
    return () => {
      active = false
    }
  }, [passportPath])

  const documents = useMembershipDocuments(
    person ? { profileId: person.profileId, membershipId: person.id } : null,
    person?.documents ?? NO_DOCUMENTS,
    // La scheda resta aperta: si aggiorna solo la tabella sotto.
    () => void onSaved(),
  )

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

  async function moveToTrash() {
    setBusy(true)
    try {
      await trashPerson(supabaseBrowser, currentPerson.profileId)
    } catch (error) {
      toast.error("Eliminazione non riuscita", {
        description: error instanceof Error ? error.message : undefined,
      })
      return
    } finally {
      setBusy(false)
    }
    toast.success(`${currentPerson.nome} ${currentPerson.cognome} nel cestino`, {
      description: "Puoi ripristinarlo dal cestino entro 30 giorni.",
    })
    setConfirmTrash(false)
    onOpenChange(false)
    await onSaved()
  }

  async function deletePassport() {
    const path = currentPerson.passportPhotoPath
    if (!path) return
    setUploading("PASSPORT")
    // Prima il riferimento: un file orfano non si vede, un percorso rotto sì.
    const { error } = await supabaseBrowser
      .from("season_memberships")
      .update({ passport_photo_path: null })
      .eq("id", currentPerson.id)
    if (error) {
      setUploading(null)
      toast.error("Fototessera non eliminata", { description: error.message })
      return
    }
    await supabaseBrowser.storage.from("passport-photos").remove([path])
    setUploading(null)
    toast.success("Fototessera eliminata")
    onOpenChange(false)
    await onSaved()
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
        <DialogContent
          className="flex h-dvh max-h-dvh max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-lg sm:border sm:pt-0"
          showCloseButton={false}
        >
        <DialogHeader className="shrink-0 border-b p-4 pr-2 text-left">
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
                  <Badge className="bg-operative text-operative-foreground">Manager</Badge>
                )}
              </div>
              <DialogDescription>
                Scheda stagione · account {accountLabels[person.accountStatus]}
              </DialogDescription>
            </div>
            <label className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm sm:h-9 sm:w-auto sm:px-3 font-medium transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <Camera aria-hidden="true" className="size-4" />
              <span className="sr-only sm:not-sr-only">
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
            {/* Nel flusso dell'header, non assoluta: su iPhone resta sotto la
                safe area e non copre il pulsante avatar. */}
            <DialogClose asChild>
              <Button
                aria-label="Chiudi"
                className="size-11 shrink-0"
                size="icon"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        {person.associationRequestId && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              Richiesta di collegamento account in attesa.
            </span>
            <Button
              onClick={() => {
                onOpenChange(false)
                onAccountAction(person.associationRequestId!, "APPROVE")
              }}
              size="sm"
              type="button"
            >
              Approva
            </Button>
            <Button
              onClick={() => {
                onOpenChange(false)
                onAccountAction(person.associationRequestId!, "REJECT")
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Rifiuta
            </Button>
          </div>
        )}
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-2">
            <ContactFields person={person} />

            <SeasonFields category={category} onCategoryChange={setCategory} person={person} />

            {(category === "PLAYER" || jerseyHistory.length > 0) && (
              <div className="md:col-span-2">
                <JerseyHistory entries={jerseyHistory} />
              </div>
            )}

            {person.attendance && (
              <section className="grid content-start gap-2 md:col-span-2">
                <h3 className="text-sm font-semibold">Presenze</h3>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <span className="text-sm">
                    <strong className="text-base">
                      <AttendancePercentage
                        rate={person.attendance.training}
                      />
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      ({person.attendance.training.present} presenze su{" "}
                      {person.attendance.training.total} senza KO,{" "}
                      {person.attendance.training.all} in tutto)
                    </span>
                  </span>
                  <AttendanceStreak
                    items={person.attendance.recentTraining}
                  />
                </div>
              </section>
            )}

            {category === "PLAYER" && (
              <section className="grid content-start gap-2 md:col-span-2">
                <h3 className="text-sm font-semibold">Infermeria</h3>
                <div className="rounded-lg border p-3">
                  <InjuryHistory
                    injuries={person.injuries ?? NO_INJURIES}
                    onChanged={() => void onSaved()}
                    profileId={person.profileId}
                  />
                </div>
              </section>
            )}

            <section className="grid content-start gap-3 md:col-span-2">
              <h3 className="text-sm font-semibold">
                Documenti
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex min-h-20 items-center gap-3 rounded-lg border p-3">
                  {passportUrl ? (
                    // Signed storage URLs are not compatible with static image optimization.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-10 shrink-0 rounded object-cover"
                      src={passportUrl}
                    />
                  ) : (
                    <IdCard
                      aria-hidden="true"
                      className="size-5 shrink-0 text-primary"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">Fototessera</strong>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.passportPhotoPath ? "Caricata" : "Mancante"}
                    </span>
                  </span>
                  {person.passportPhotoPath && (
                    <>
                      <DocumentPreview
                        bucket="passport-photos"
                        image
                        path={person.passportPhotoPath}
                        title={`Fototessera di ${person.nome} ${person.cognome}`}
                      >
                        <Button
                          aria-label="Apri fototessera"
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                      </DocumentPreview>
                      <DeleteDocumentButton
                        disabled={Boolean(uploading)}
                        label="fototessera"
                        onConfirm={() => void deletePassport()}
                      />
                    </>
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
                <CertificateCard editor={certificate} person={person} />
                <MembershipDocuments canDelete={() => true} state={documents} />
              </div>
            </section>

            <PersonPaymentsSection documents={documents} person={person} review={paymentReview} />

            <OperationalFields person={person} />
          </div>
          <DialogFooter className="shrink-0 flex-row items-center border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
            {!person.isManager && (
              <Button
                className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirmTrash(true)}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
                Elimina
              </Button>
            )}
            <Button className="ml-auto" disabled={busy} type="submit">
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

      <AlertDialog
        open={confirmTrash}
        onOpenChange={(open) => !open && setConfirmTrash(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare {person.nome} {person.cognome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esce da tutte le stagioni e perde l’account collegato. Resta nel
              cestino per 30 giorni, poi viene cancellato per sempre con
              presenze, statistiche e pagamenti. Per chi lascia solo la
              squadra usa l’archiviazione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void moveToTrash()
              }}
            >
              Sposta nel cestino
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CertificateDialog editor={certificate} />

      <PersonPaymentDialogs
        currentProfileId={profile?.id ?? null}
        onSaved={onSaved}
        person={person}
        review={paymentReview}
      />
    </>
  )
}
