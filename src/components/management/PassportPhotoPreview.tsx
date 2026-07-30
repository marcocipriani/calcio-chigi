"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function PassportPhotoPreview({
  personName,
  signedUrl,
}: {
  personName: string
  signedUrl?: string
}) {
  if (!signedUrl) {
    return <span className="text-xs text-muted-foreground">Mancante</span>
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button aria-label={`Apri fototessera di ${personName}`} type="button">
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
