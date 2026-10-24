"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Eye, FileText, Upload } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import {
  DeleteDocumentButton,
  DocumentPreview,
} from "@/components/documents/DocumentControls"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ManagementPerson } from "@/lib/management"
import { certificateStatusLabel } from "@/lib/profile-operations"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

// Certificato agonistico nella scheda persona. Come per i pagamenti, la card
// sta nel form della scheda e il dialog fuori, perché ha un form suo.

const EMPTY_FORM = { visitOn: "", expiresOn: "", laboratory: "" }

/** onDone: chiude la scheda e ricarica la tabella, dopo un caricamento o un'eliminazione. */
export function useCertificateEditor(
  person: ManagementPerson | null,
  onDone: () => Promise<void>,
) {
  const { profile } = useAppSession()
  const [certDialogOpen, setCertDialogOpen] = useState(false)
  const [certBusy, setCertBusy] = useState(false)
  const [certForm, setCertForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (person) {
      setCertDialogOpen(false)
      setCertForm(EMPTY_FORM)
    }
  }, [person])

  async function deleteCertificate() {
    if (!person?.certificateId) return
    setCertBusy(true)
    const { error } = await supabaseBrowser
      .from("medical_certificates")
      .delete()
      .eq("id", person.certificateId)
    if (error) {
      setCertBusy(false)
      toast.error("Certificato non eliminato", { description: error.message })
      return
    }
    if (person.certificateDocumentPath) {
      await supabaseBrowser.storage
        .from("medical-certificates")
        .remove([person.certificateDocumentPath])
    }
    setCertBusy(false)
    toast.success("Certificato eliminato")
    await onDone()
  }

  async function submitCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!person) return
    const fileInput = event.currentTarget.elements.namedItem(
      "certificate-file",
    ) as HTMLInputElement
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
    if (!certForm.visitOn || !certForm.expiresOn || !certForm.laboratory.trim()) {
      toast.error("Compila data visita, scadenza e laboratorio")
      return
    }

    setCertBusy(true)
    const certificateId = crypto.randomUUID()
    const path = `${person.profileId}/${person.id}/${certificateId}.pdf`
    const { error: uploadError } = await supabaseBrowser.storage
      .from("medical-certificates")
      .upload(path, file, { contentType: "application/pdf" })
    if (uploadError) {
      toast.error(uploadError.message)
      setCertBusy(false)
      return
    }

    const { error } = await supabaseBrowser.from("medical_certificates").insert({
      id: certificateId,
      membership_id: person.id,
      document_path: path,
      competitive_declared: true,
      visit_on: certForm.visitOn,
      expires_on: certForm.expiresOn,
      laboratory: certForm.laboratory.trim(),
      status: "VALID",
      verified_by: profile?.id ?? null,
      verified_at: new Date().toISOString(),
      updated_by: profile?.id ?? null,
    })
    setCertBusy(false)

    if (error) {
      await supabaseBrowser.storage.from("medical-certificates").remove([path])
      toast.error("Certificato non salvato", { description: error.message })
      return
    }
    toast.success("Certificato registrato")
    setCertDialogOpen(false)
    await onDone()
  }

  return {
    certDialogOpen,
    setCertDialogOpen,
    certBusy,
    certForm,
    setCertForm,
    deleteCertificate,
    submitCertificate,
  }
}

type CertificateEditor = ReturnType<typeof useCertificateEditor>

export function CertificateCard({
  person,
  editor,
}: {
  person: ManagementPerson
  editor: CertificateEditor
}) {
  return (
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
          {certificateStatusLabel(person.certificateStatus)}
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
        <DocumentPreview
          bucket="medical-certificates"
          image={false}
          path={person.certificateDocumentPath}
          title={`Certificato di ${person.nome} ${person.cognome}`}
        >
          <Button
            aria-label="Apri certificato PDF"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Eye aria-hidden="true" />
          </Button>
        </DocumentPreview>
      )}
      {person.certificateId && (
        <DeleteDocumentButton
          disabled={editor.certBusy}
          label="certificato"
          onConfirm={() => void editor.deleteCertificate()}
        />
      )}
      <Button
        aria-label="Carica o correggi certificato"
        onClick={() => editor.setCertDialogOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Upload aria-hidden="true" />
      </Button>
    </div>
  )
}

export function CertificateDialog({ editor }: { editor: CertificateEditor }) {
  return (
    <Dialog onOpenChange={editor.setCertDialogOpen} open={editor.certDialogOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Certificato agonistico</DialogTitle>
          <DialogDescription>
            Carica il PDF e i dati: viene registrato come già verificato.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={editor.submitCertificate}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cert-visit">Data visita</Label>
              <Input
                id="cert-visit"
                onChange={(event) =>
                  editor.setCertForm({ ...editor.certForm, visitOn: event.target.value })
                }
                type="date"
                value={editor.certForm.visitOn}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-expiry">Scadenza</Label>
              <Input
                id="cert-expiry"
                onChange={(event) =>
                  editor.setCertForm({ ...editor.certForm, expiresOn: event.target.value })
                }
                type="date"
                value={editor.certForm.expiresOn}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-lab">Laboratorio</Label>
            <Input
              id="cert-lab"
              onChange={(event) =>
                editor.setCertForm({ ...editor.certForm, laboratory: event.target.value })
              }
              value={editor.certForm.laboratory}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-file">PDF certificato</Label>
            <Input
              accept="application/pdf"
              id="cert-file"
              name="certificate-file"
              type="file"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={editor.certBusy} type="button" variant="outline">
                Annulla
              </Button>
            </DialogClose>
            <Button disabled={editor.certBusy} type="submit">
              {editor.certBusy ? "Salvataggio…" : "Salva certificato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
