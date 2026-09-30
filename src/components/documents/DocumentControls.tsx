"use client"

import { useState, type ReactNode } from "react"
import { ExternalLink, Trash2, Upload } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PreviewState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; signedUrl: string }

/**
 * Anteprima di un file privato: l'URL firmato nasce all'apertura. `children` è
 * il pulsante che la apre.
 */
export function DocumentPreview({
  bucket,
  path,
  image,
  title,
  children,
}: {
  bucket: string
  path: string
  image: boolean
  title: string
  children: ReactNode
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" })

  async function handleOpenChange(open: boolean) {
    if (!open) return
    setState({ status: "loading" })
    const { data, error } = await supabaseBrowser.storage
      .from(bucket)
      .createSignedUrl(path, 300)
    setState(
      error || !data?.signedUrl
        ? { status: "unavailable" }
        : { status: "ready", signedUrl: data.signedUrl },
    )
  }

  return (
    // Il dialog vive in un portale, ma per React resta figlio di chi lo ospita:
    // in tabella i click al suo interno aprirebbero la scheda della riga.
    <span className="contents" onClick={(event) => event.stopPropagation()}>
      <Dialog onOpenChange={(open) => void handleOpenChange(open)}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground" role="status">
              Caricamento…
            </p>
          )}
          {state.status === "unavailable" && (
            <p className="text-sm text-muted-foreground">
              Documento non disponibile.
            </p>
          )}
          {state.status === "ready" && (
            <>
              {image ? (
                // Signed storage URLs are not compatible with static image optimization.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={title}
                  className="max-h-[70dvh] w-full object-contain"
                  src={state.signedUrl}
                />
              ) : (
                <iframe
                  className="h-[70dvh] w-full rounded border"
                  src={state.signedUrl}
                  title={title}
                />
              )}
              {/* iOS mostra solo la prima pagina di un PDF in iframe. */}
              <a
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={state.signedUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                Apri in nuova scheda
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </span>
  )
}

export function DeleteDocumentButton({
  label,
  description = "Il file viene cancellato e non si può recuperare.",
  disabled = false,
  onConfirm,
}: {
  label: string
  description?: string
  disabled?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Elimina ${label}`}
          disabled={disabled}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare {label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function UploadDocumentButton({
  label,
  accept,
  disabled = false,
  onFile,
}: {
  label: string
  accept: string
  disabled?: boolean
  onFile: (file: File) => void
}) {
  return (
    <label
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50"
    >
      <Upload aria-hidden="true" className="size-4" />
      <span className="sr-only">{label}</span>
      <input
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onFile(file)
        }}
        type="file"
      />
    </label>
  )
}
