"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pitch } from "@/components/formations/Pitch"
import { FORMATIONS } from "@/lib/constants"
import type { MatchLineup } from "@/lib/match"
import type { EventType } from "@/lib/types"

import { MatchBench } from "./MatchBench"
import { MatchPlayerAvatar } from "./MatchPlayerAvatar"
import { byRole, type MatchPlayer } from "./players"

const DEFAULT_PERIOD_MINUTES = 35

/**
 * Prima del via: titolari dalla formazione pubblicata (con scambi dell'ultimo
 * momento) oppure scelti tra chi ha risposto presente.
 */
export function MatchSetup({
  tipo,
  formation,
  players,
  presentIds,
  busy,
  onStart,
}: {
  tipo: EventType
  formation: MatchLineup | null
  players: Map<string, MatchPlayer>
  presentIds: Set<string>
  busy: boolean
  onStart: (lineup: MatchLineup, periodMinutes: number) => void
}) {
  const [module, setModule] = useState(formation?.module && FORMATIONS[formation.module] ? formation.module : "4-4-2")
  const [onField, setOnField] = useState<Record<string, string | null>>(() =>
    Object.fromEntries((formation?.starters ?? []).map(({ positionKey, profileId }) => [positionKey, profileId])),
  )
  const [bench, setBench] = useState<string[]>(() =>
    formation
      ? formation.bench
      : [...presentIds].filter((id) => players.has(id)),
  )
  // Testo libero mentre si scrive: si valida al calcio d'inizio.
  const [periodText, setPeriodText] = useState(String(DEFAULT_PERIOD_MINUTES))
  const [slotToFill, setSlotToFill] = useState<string | null>(null)

  const slots = FORMATIONS[module] ?? FORMATIONS["4-4-2"]
  const starters = slots.filter(({ id }) => onField[id])
  const assigned = new Set(Object.values(onField).filter(Boolean) as string[])

  // Senza formazione si può scegliere chiunque sia convocabile, chi è presente per primo.
  const candidates = (formation ? bench : [...players.keys()])
    .filter((id) => !assigned.has(id))
    .map((id) => players.get(id))
    .filter((player): player is MatchPlayer => Boolean(player))
    .sort((left, right) => Number(presentIds.has(right.id)) - Number(presentIds.has(left.id)) || byRole(left, right))

  function place(positionKey: string, profileId: string | null) {
    const previous = onField[positionKey] ?? null
    setOnField((current) => ({ ...current, [positionKey]: profileId }))
    setBench((current) => {
      const next = current.filter((id) => id !== profileId)
      return previous && previous !== profileId ? [...next, previous] : next
    })
    setSlotToFill(null)
  }

  function changeModule(next: string) {
    // Si tengono i giocatori nell'ordine delle posizioni: il portiere resta in porta.
    const ordered = slots.map(({ id }) => onField[id]).filter(Boolean) as string[]
    const nextSlots = FORMATIONS[next]
    setModule(next)
    setOnField(Object.fromEntries(nextSlots.map(({ id }, index) => [id, ordered[index] ?? null])))
  }

  function start() {
    onStart(
      {
        module,
        starters: slots.flatMap(({ id }) => (onField[id] ? [{ profileId: onField[id]!, positionKey: id }] : [])),
        bench: bench.filter((id) => !assigned.has(id)),
      },
      tipo === "AMICHEVOLE"
        ? Math.min(60, Math.max(10, Number.parseInt(periodText, 10) || DEFAULT_PERIOD_MINUTES))
        : DEFAULT_PERIOD_MINUTES,
    )
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-lg font-black">Prima del via</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formation
            ? "Titolari dalla formazione ufficiale: tocca un giocatore per scambiarlo con la panchina."
            : "Nessuna formazione pubblicata: tocca le posizioni e scegli i titolari."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {!formation && (
            <div className="grid gap-1">
              <Label htmlFor="match-module">Modulo</Label>
              <select
                className="h-11 rounded-md border bg-background px-3 text-sm"
                id="match-module"
                onChange={(event) => changeModule(event.target.value)}
                value={module}
              >
                {Object.keys(FORMATIONS).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tipo === "AMICHEVOLE" ? (
            <div className="grid gap-1">
              <Label htmlFor="match-period">Minuti per tempo</Label>
              <Input
                className="h-11 w-24"
                id="match-period"
                inputMode="numeric"
                max={60}
                min={10}
                onChange={(event) => setPeriodText(event.target.value)}
                type="number"
                value={periodText}
              />
            </div>
          ) : (
            <p className="text-sm font-bold">2 tempi da 35′ · intervallo 15′</p>
          )}
        </div>
      </section>

      <Pitch>
        {slots.map((slot) => {
          const player = onField[slot.id] ? players.get(onField[slot.id]!) : undefined
          return (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              key={slot.id}
              style={{ top: slot.top, left: slot.left }}
            >
              {player ? (
                <MatchPlayerAvatar onClick={() => setSlotToFill(slot.id)} onField player={player} />
              ) : (
                <button
                  aria-label={`Scegli il giocatore per ${slot.role}`}
                  className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-white bg-white/10 text-xl font-black text-white"
                  onClick={() => setSlotToFill(slot.id)}
                  type="button"
                >
                  +
                </button>
              )}
            </div>
          )
        })}
      </Pitch>

      <MatchBench
        badgesFor={() => ({})}
        bench={bench.filter((id) => !assigned.has(id))}
        counters={<span className="text-xs font-bold text-muted-foreground">{starters.length}/11 titolari</span>}
        expelled={[]}
        players={players}
      />

      <Button className="h-14 w-full text-base font-black" disabled={busy || starters.length === 0} onClick={start}>
        Calcio d’inizio
      </Button>

      <Dialog open={slotToFill !== null} onOpenChange={(open) => !open && setSlotToFill(null)}>
        <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Scegli il giocatore</DialogTitle>
            <DialogDescription>{slotToFill && onField[slotToFill] ? "Chi entra al suo posto?" : "Chi gioca in questa posizione?"}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-center gap-x-1 gap-y-2">
            {candidates.map((player) => (
              <MatchPlayerAvatar key={player.id} onClick={() => slotToFill && place(slotToFill, player.id)} player={player} />
            ))}
          </div>
          {candidates.length === 0 && <p className="text-center text-sm text-muted-foreground">Nessun altro giocatore disponibile.</p>}
          {slotToFill && onField[slotToFill] && (
            <Button onClick={() => place(slotToFill, null)} variant="outline">
              Libera la posizione
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
