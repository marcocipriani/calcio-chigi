"use client"

import { useEffect, useState } from "react"
import { differenceInCalendarDays } from "date-fns"
import { ArchiveRestore } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchTrashedPeople,
  restorePerson,
  type TrashedPerson,
} from "@/lib/management-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

export const TRASH_RETENTION_DAYS = 30

export function daysLeftInTrash(deletedAt: string, now = new Date()) {
  return Math.max(
    0,
    TRASH_RETENTION_DAYS - differenceInCalendarDays(now, new Date(deletedAt)),
  )
}

export function TrashDialog({
  open,
  onOpenChange,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestored: () => Promise<void>
}) {
  const [people, setPeople] = useState<TrashedPerson[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setPeople(null)
    fetchTrashedPeople(supabaseBrowser)
      .then((next) => {
        if (active) setPeople(next)
      })
      .catch((error) => {
        if (!active) return
        setPeople([])
        toast.error("Cestino non disponibile", {
          description: error instanceof Error ? error.message : undefined,
        })
      })
    return () => {
      active = false
    }
  }, [open])

  async function restore(person: TrashedPerson) {
    setBusyId(person.profileId)
    try {
      await restorePerson(supabaseBrowser, person.profileId)
    } catch (error) {
      toast.error("Ripristino non riuscito", {
        description: error instanceof Error ? error.message : undefined,
      })
      return
    } finally {
      setBusyId(null)
    }
    toast.success(`${person.nome} ${person.cognome} ripristinato`, {
      description: "Lo trovi tra gli archiviati.",
    })
    setPeople((current) =>
      (current ?? []).filter(({ profileId }) => profileId !== person.profileId),
    )
    await onRestored()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b p-4 pr-14 text-left">
          <DialogTitle>Cestino</DialogTitle>
          <DialogDescription>
            Dopo {TRASH_RETENTION_DAYS} giorni le persone vengono eliminate
            definitivamente con presenze, statistiche e pagamenti.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {people === null ? (
            <div className="grid gap-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : people.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Il cestino è vuoto.
            </p>
          ) : (
            <ul className="divide-y">
              {people.map((person) => {
                const daysLeft = daysLeftInTrash(person.deletedAt)
                return (
                  <li
                    className="flex min-h-14 items-center gap-3 px-2 py-2"
                    key={person.profileId}
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarImage
                        alt=""
                        className="object-cover"
                        src={person.avatarUrl ?? undefined}
                      />
                      <AvatarFallback className="text-[10px] font-bold">
                        {person.nome[0]}
                        {person.cognome[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {person.nome} {person.cognome}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {daysLeft === 0
                          ? "Eliminazione entro oggi"
                          : `Eliminazione tra ${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}`}
                      </span>
                    </span>
                    <Button
                      aria-label={`Ripristina ${person.nome} ${person.cognome}`}
                      disabled={busyId !== null}
                      onClick={() => void restore(person)}
                      size="sm"
                      variant="outline"
                    >
                      <ArchiveRestore aria-hidden="true" />
                      Ripristina
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
