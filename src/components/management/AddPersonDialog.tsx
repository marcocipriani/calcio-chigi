"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

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
import { createManagementPerson } from "@/lib/management-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

const fieldClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function AddPersonDialog({
  open,
  seasonSlug,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  seasonSlug: string
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [category, setCategory] = useState<"PLAYER" | "STAFF">("PLAYER")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await createManagementPerson(supabaseBrowser, {
        seasonSlug,
        nome: String(form.get("nome") ?? ""),
        cognome: String(form.get("cognome") ?? ""),
        phone: String(form.get("phone") ?? ""),
        category,
        role: String(form.get("role") ?? ""),
        staffFunction: String(form.get("staffFunction") ?? ""),
        trainingOnly: form.get("trainingOnly") === "on",
        joinedOn: String(form.get("joinedOn") ?? ""),
      })
      toast.success("Persona aggiunta")
      onOpenChange(false)
      await onSaved()
    } catch (error) {
      toast.error("Persona non aggiunta", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Aggiungi persona</DialogTitle>
          <DialogDescription>
            Entra subito in rosa. Se non gioca più, archivialo dalla scheda.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Nome</Label>
            <Input id="new-name" name="nome" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-surname">Cognome</Label>
            <Input id="new-surname" name="cognome" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-phone">Telefono</Label>
            <Input
              autoComplete="tel"
              id="new-phone"
              inputMode="tel"
              name="phone"
              type="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-category">Categoria</Label>
            <select
              className={fieldClass}
              id="new-category"
              onChange={(event) =>
                setCategory(event.target.value as "PLAYER" | "STAFF")
              }
              value={category}
            >
              <option value="PLAYER">Giocatore</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>
          {category === "PLAYER" ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Ruolo</Label>
              <select className={fieldClass} id="new-role" name="role">
                <option value="">Da definire</option>
                <option value="PORTIERE">Portiere</option>
                <option value="DIFENSORE">Difensore</option>
                <option value="CENTROCAMPISTA">Centrocampista</option>
                <option value="ATTACCANTE">Attaccante</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="new-staff-function">Funzione staff</Label>
              <Input
                id="new-staff-function"
                name="staffFunction"
                placeholder="Presidente, infermiere…"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new-joined">Data ingresso in squadra</Label>
            <Input id="new-joined" name="joinedOn" type="date" />
          </div>
          <label className="flex min-h-10 items-center gap-2 self-end text-sm">
            <input
              className="size-4 accent-primary"
              name="trainingOnly"
              type="checkbox"
            />
            Solo allenamenti
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Annulla
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Salvataggio…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
