"use client"

import { useEffect, useState } from "react"
import { Eye, FileText } from "lucide-react"
import { toast } from "sonner"

import {
  DeleteDocumentButton,
  DocumentPreview,
  UploadDocumentButton,
} from "@/components/documents/DocumentControls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DOCUMENT_BUCKET,
  DOCUMENT_MIME_TYPES,
  deleteMembershipDocument,
  documentKindLabel,
  uploadMembershipDocument,
  type DocumentKind,
  type MembershipDocument,
} from "@/lib/membership-documents"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

const ACCEPT = DOCUMENT_MIME_TYPES.join(",")
const SLOTS = ["IDENTITY", "REGISTRATION_FORM"] satisfies DocumentKind[]

export type MembershipDocumentsState = ReturnType<typeof useMembershipDocuments>

/**
 * Allegati di un'iscrizione con carica ed elimina. Lo stato vive qui: chi lo usa
 * resta aperto mentre `onChanged` aggiorna il resto della pagina.
 */
export function useMembershipDocuments(
  owner: { profileId: string; membershipId: string } | null,
  initial: MembershipDocument[],
  onChanged?: () => void,
) {
  const [documents, setDocuments] = useState(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDocuments(initial)
  }, [initial])

  async function upload(input: {
    kind: DocumentKind
    file: File
    title?: string
    paymentId?: string
  }) {
    if (!owner) return false
    setBusy(true)
    try {
      const document = await uploadMembershipDocument(supabaseBrowser, {
        ...owner,
        ...input,
      })
      setDocuments((current) => [...current, document])
      toast.success("Documento caricato")
      onChanged?.()
      return true
    } catch (error) {
      toast.error("Documento non caricato", {
        description: error instanceof Error ? error.message : undefined,
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function remove(document: MembershipDocument) {
    setBusy(true)
    try {
      await deleteMembershipDocument(supabaseBrowser, document)
      setDocuments((current) => current.filter(({ id }) => id !== document.id))
      toast.success("Documento eliminato")
      onChanged?.()
    } catch (error) {
      toast.error("Documento non eliminato", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return { documents, busy, upload, remove }
}

function DocumentActions({
  document,
  label,
  state,
  canDelete,
}: {
  document: MembershipDocument
  label: string
  state: MembershipDocumentsState
  canDelete: (document: MembershipDocument) => boolean
}) {
  return (
    <>
      <DocumentPreview
        bucket={DOCUMENT_BUCKET}
        image={document.contentType.startsWith("image/")}
        path={document.path}
        title={label}
      >
        <Button
          aria-label={`Apri ${label}`}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Eye aria-hidden="true" />
        </Button>
      </DocumentPreview>
      {canDelete(document) && (
        <DeleteDocumentButton
          disabled={state.busy}
          label={label}
          onConfirm={() => void state.remove(document)}
        />
      )}
    </>
  )
}

/** Slot identità e modulo, poi la lista libera "Altri documenti". */
export function MembershipDocuments({
  state,
  canDelete,
}: {
  state: MembershipDocumentsState
  canDelete: (document: MembershipDocument) => boolean
}) {
  const [title, setTitle] = useState("")
  const others = state.documents.filter(({ kind }) => kind === "OTHER")

  return (
    <>
      {SLOTS.map((kind) => {
        const label = documentKindLabel[kind]
        const document = state.documents.find((item) => item.kind === kind)
        return (
          <div
            className="flex min-h-20 items-center gap-3 rounded-lg border p-3"
            key={kind}
          >
            <FileText
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">{label}</strong>
              <span className="block truncate text-xs text-muted-foreground">
                {document ? "Caricato" : "Mancante"}
              </span>
            </span>
            {document ? (
              <DocumentActions
                canDelete={canDelete}
                document={document}
                label={label}
                state={state}
              />
            ) : (
              <UploadDocumentButton
                accept={ACCEPT}
                disabled={state.busy}
                label={`Carica ${label}`}
                onFile={(file) => void state.upload({ kind, file })}
              />
            )}
          </div>
        )
      })}

      <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
        <strong className="block text-sm">Altri documenti</strong>
        {others.map((document) => (
          <div className="flex items-center gap-2" key={document.id}>
            <span className="min-w-0 flex-1 truncate text-sm">
              {document.title}
            </span>
            <DocumentActions
              canDelete={canDelete}
              document={document}
              label={document.title ?? documentKindLabel.OTHER}
              state={state}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            aria-label="Titolo del nuovo documento"
            className="h-9"
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            // Nella scheda persona il campo sta dentro il form: Invio lo salverebbe.
            onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
            placeholder="Titolo, poi scegli il file"
            value={title}
          />
          <UploadDocumentButton
            accept={ACCEPT}
            disabled={state.busy || !title.trim()}
            label="Aggiungi documento"
            onFile={(file) =>
              void state
                .upload({ kind: "OTHER", file, title })
                .then((saved) => saved && setTitle(""))
            }
          />
        </div>
      </div>
    </>
  )
}

/** Ricevuta di una quota: anteprima ed elimina, oppure il pulsante per allegarla. */
export function PaymentReceipt({
  paymentId,
  label = "Ricevuta",
  state,
  canDelete,
}: {
  paymentId: string
  label?: string
  state: MembershipDocumentsState
  canDelete: (document: MembershipDocument) => boolean
}) {
  const document = state.documents.find((item) => item.paymentId === paymentId)
  return document ? (
    <DocumentActions
      canDelete={canDelete}
      document={document}
      label={label}
      state={state}
    />
  ) : (
    <UploadDocumentButton
      accept={ACCEPT}
      disabled={state.busy}
      label={`Allega ${label}`}
      onFile={(file) =>
        void state.upload({ kind: "PAYMENT_RECEIPT", file, paymentId })
      }
    />
  )
}
