"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export type PassportPhotoState =
  | { status: "missing" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; signedUrl: string }

export function PassportPhotoPreview({
  personName,
  state,
}: {
  personName: string
  state: PassportPhotoState
}) {
  if (state.status === "missing") {
    return <span className="text-xs text-muted-foreground">Mancante</span>
  }
  if (state.status === "loading") {
    return (
      <span className="text-xs text-muted-foreground" role="status">
        Caricamento…
      </span>
    )
  }
  if (state.status === "unavailable") {
    return (
      <span className="text-xs text-muted-foreground">Non disponibile</span>
    )
  }

  const signedUrl = state.signedUrl

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label={`Apri fototessera di ${personName}`}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          {/* Signed storage URLs are not compatible with static image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`Fototessera di ${personName}`}
            className="size-10 rounded object-cover"
            src={signedUrl}
          />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fototessera di {personName}</DialogTitle>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`Fototessera di ${personName}`}
          className="max-h-[70dvh] w-full object-contain"
          src={signedUrl}
        />
      </DialogContent>
    </Dialog>
  )
}
