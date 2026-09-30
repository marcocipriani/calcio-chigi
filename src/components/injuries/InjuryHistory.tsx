"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import { Plus, Save } from "lucide-react"
import { toast } from "sonner"

import { DeleteDocumentButton } from "@/components/documents/DocumentControls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  deleteInjury,
  fetchInjuries,
  saveInjury,
  type Injury,
} from "@/lib/injuries"
import { romeDateKey } from "@/lib/season"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

function displayDay(value: string) {
  return new Intl.DateTimeFormat("it", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

// Nella scheda persona i campi stanno dentro il form: Invio la salverebbe.
function blockEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault()
}

function InjuryRow({
  injury,
  profileId,
  busy,
  onSave,
  onDelete,
}: {
  injury: Injury | null
  profileId: string
  busy: boolean
  onSave: (injury: Parameters<typeof saveInjury>[1]) => Promise<boolean>
  onDelete?: () => void
}) {
  const initial = {
    startedOn: injury?.startedOn ?? romeDateKey(new Date()),
    endedOn: injury?.endedOn ?? "",
    note: injury?.note ?? "",
  }
  const [draft, setDraft] = useState(initial)
  const label = injury
    ? `infortunio del ${displayDay(injury.startedOn)}`
    : "nuovo infortunio"
  const dirty =
    !injury ||
    draft.startedOn !== initial.startedOn ||
    draft.endedOn !== initial.endedOn ||
    draft.note !== initial.note

  async function save() {
    const saved = await onSave({
      id: injury?.id,
      profileId,
      startedOn: draft.startedOn,
      endedOn: draft.endedOn || null,
      note: draft.note,
    })
    if (saved && !injury) setDraft(initial)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={`Inizio ${label}`}
        className="h-9 w-36"
        onChange={(event) =>
          setDraft({ ...draft, startedOn: event.target.value })
        }
        onKeyDown={blockEnter}
        type="date"
        value={draft.startedOn}
      />
      <Input
        aria-label={`Rientro ${label}`}
        className="h-9 w-36"
        min={draft.startedOn}
        onChange={(event) => setDraft({ ...draft, endedOn: event.target.value })}
        onKeyDown={blockEnter}
        title="Ultimo giorno di KO: vuoto se è ancora fermo"
        type="date"
        value={draft.endedOn}
      />
      <Input
        aria-label={`Nota ${label}`}
        className="h-9 min-w-32 flex-1"
        maxLength={200}
        onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        onKeyDown={blockEnter}
        placeholder="Nota (es. caviglia)"
        value={draft.note}
      />
      <Button
        aria-label={injury ? `Salva ${label}` : "Segna KO"}
        disabled={busy || !dirty || !draft.startedOn}
        onClick={() => void save()}
        size={injury ? "icon" : "sm"}
        type="button"
        variant="outline"
      >
        {injury ? (
          <Save aria-hidden="true" />
        ) : (
          <>
            <Plus aria-hidden="true" />
            Segna KO
          </>
        )}
      </Button>
      {onDelete && (
        <DeleteDocumentButton
          description="L’infortunio sparisce dalla storia e quei giorni tornano a contare nelle presenze."
          disabled={busy}
          label={label}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}

/**
 * Storia infortuni. Senza `profileId` è in sola lettura (pagina giocatore); con
 * `profileId` il manager apre, chiude, corregge ed elimina.
 */
export function InjuryHistory({
  injuries,
  profileId,
  onChanged,
}: {
  injuries: Injury[]
  profileId?: string
  onChanged?: () => void
}) {
  const [items, setItems] = useState(injuries)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setItems(injuries)
  }, [injuries])

  if (!profileId) {
    return (
      <ul className="divide-y text-sm">
        {items.map((injury) => (
          <li className="flex flex-wrap gap-x-2 py-2" key={injury.id}>
            <strong className="font-semibold">
              {displayDay(injury.startedOn)} –{" "}
              {injury.endedOn ? displayDay(injury.endedOn) : "in corso"}
            </strong>
            {injury.note && (
              <span className="text-muted-foreground">{injury.note}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  const ownerId = profileId

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      // La scheda resta aperta: la storia si rilegge qui, la tabella sotto.
      setItems(await fetchInjuries(supabaseBrowser, [ownerId]))
      toast.success(done)
      onChanged?.()
      return true
    } catch (error) {
      toast.error("Infortunio non salvato", {
        description: error instanceof Error ? error.message : undefined,
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {items.map((injury) => (
        <InjuryRow
          busy={busy}
          injury={injury}
          // Dopo un salvataggio la riga riparte dai valori nuovi.
          key={`${injury.id}:${injury.startedOn}:${injury.endedOn}:${injury.note}`}
          onDelete={() =>
            void run(
              () => deleteInjury(supabaseBrowser, injury.id),
              "Infortunio eliminato",
            )
          }
          onSave={(next) =>
            run(() => saveInjury(supabaseBrowser, next), "Infortunio aggiornato")
          }
          profileId={ownerId}
        />
      ))}
      <InjuryRow
        busy={busy}
        injury={null}
        onSave={(next) =>
          run(() => saveInjury(supabaseBrowser, next), "KO registrato")
        }
        profileId={ownerId}
      />
    </div>
  )
}
