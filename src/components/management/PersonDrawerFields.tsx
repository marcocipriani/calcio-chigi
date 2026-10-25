"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UNIFORM_SIZES } from "@/lib/domain"
import type { ManagementPerson } from "@/lib/management"

// Campi del form della scheda persona: quasi tutti non controllati
// (defaultValue), li legge il submit di PersonDrawer con FormData. I `name`
// sono il contratto.

type Category = "PLAYER" | "STAFF"

const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function ContactFields({ person }: { person: ManagementPerson }) {
  return (
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
          className="size-4 accent-operative"
          defaultChecked={person.isManager}
          name="isManager"
          type="checkbox"
        />
        Permesso manager
      </label>
    </section>
  )
}

/** La categoria resta controllata: cambia i campi mostrati (ruolo o funzione staff). */
export function SeasonFields({
  person,
  category,
  onCategoryChange,
}: {
  person: ManagementPerson
  category: Category
  onCategoryChange: (category: Category) => void
}) {
  // Controllato solo per bloccare il numero di chi fa solo allenamenti.
  const [status, setStatus] = useState(person.status)
  const trainingOnly = category === "PLAYER" && status === "TRAINING_ONLY"

  return (
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
              onCategoryChange(event.target.value as Category)
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
            id="person-status"
            name="status"
            onChange={(event) => setStatus(event.target.value as ManagementPerson["status"])}
            value={status}
          >
            <option value="YES">In rosa</option>
            {category === "PLAYER" && (
              <option value="TRAINING_ONLY">Solo allenamenti</option>
            )}
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
            {trainingOnly ? (
              <>
                {/* Senza name: il server tiene il numero che c'era, riservato per la stagione. */}
                <Input aria-describedby="person-number-reserved" disabled id="person-number" readOnly value="—" />
                <p className="text-[11px] text-muted-foreground" id="person-number-reserved">
                  {person.jerseyNumber != null
                    ? `Solo allenamenti: il ${person.jerseyNumber} resta riservato per la stagione.`
                    : "Solo allenamenti: niente numero."}
                </p>
              </>
            ) : (
              <Input
                defaultValue={person.jerseyNumber ?? ""}
                id="person-number"
                max="99"
                min="0"
                name="jerseyNumber"
                type="number"
              />
            )}
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
          <select
            className={selectClass}
            defaultValue={person.uniformSize ?? ""}
            id="person-size"
            name="uniformSize"
          >
            <option value="">—</option>
            {UNIFORM_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[
          ["isExternal", "EXT", person.isExternal],
          ["isAggregated", "AGG", person.isAggregated],
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
  )
}

export function OperationalFields({ person }: { person: ManagementPerson }) {
  return (
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
  )
}
