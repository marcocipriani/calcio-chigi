"use client"

import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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

  useEffect(() => {
    if (person) setCategory(person.category)
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
      (form.get("isManager") === "on") !== Boolean(currentPerson.isManager)

    if (
      sensitiveChanged &&
      !window.confirm(
        "Stai modificando tessera, tesseramento o permesso manager. Confermi?",
      )
    ) {
      return
    }

    setBusy(true)
    const { error } = await supabaseBrowser.rpc("manager_update_person", {
      p_profile_id: currentPerson.profileId,
      p_membership_id: currentPerson.id,
      p_profile: {
        nome: String(form.get("nome") ?? ""),
        cognome: String(form.get("cognome") ?? ""),
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
      toast.error("Modifiche non salvate", { description: error.message })
      return
    }
    toast.success("Scheda aggiornata")
    onOpenChange(false)
    await onSaved()
  }

  return (
    <Dialog open={Boolean(person)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 text-left">
          <div className="flex items-center gap-2">
            <DialogTitle>
              {person.nome} {person.cognome}
            </DialogTitle>
            {person.isManager && (
              <Badge className="bg-violet-600">Manager</Badge>
            )}
          </div>
          <DialogDescription>
            Scheda stagione · account {person.accountStatus.toLowerCase()}
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <div className="grid flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-2">
            <section className="grid content-start gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Persona e contatti
              </h3>
              <div className="grid grid-cols-2 gap-3">
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                  <Label htmlFor="person-status">Conferma</Label>
                  <select
                    className={selectClass}
                    defaultValue={person.status}
                    id="person-status"
                    name="status"
                  >
                    <option value="INTERESTED">Interessato</option>
                    <option value="PENDING">Da confermare</option>
                    <option value="YES">Sì</option>
                    <option value="MAYBE">Forse</option>
                    <option value="NO">No</option>
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
  )
}
