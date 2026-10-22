"use client"

import { useCallback, useEffect, useState } from "react"
import { format, formatDistanceToNowStrict } from "date-fns"
import { it } from "date-fns/locale"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  closeChigioPoll,
  cyclePick,
  EMPTY_BALLOT,
  fetchChigioEventState,
  isPollOpen,
  submitChigioVote,
  type ChigioBallot,
  type ChigioEventState,
  type ChigioResult,
} from "@/lib/chigio"
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

export type ChigioPlayer = {
  id: string
  nome: string
  cognome: string
  avatar_url?: string | null
}

function PlayerAvatar({ player, className }: { player?: ChigioPlayer; className?: string }) {
  return (
    <Avatar className={cn("size-10", className)}>
      <AvatarImage alt="" className="object-cover" src={player?.avatar_url ?? undefined} />
      <AvatarFallback className="text-xs font-bold">
        {player ? `${player.nome[0]}${player.cognome[0]}` : "?"}
      </AvatarFallback>
    </Avatar>
  )
}

const PODIUM = [
  { place: 2, block: "h-20 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100", ring: "ring-zinc-300" },
  { place: 1, block: "h-24 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", ring: "ring-amber-400" },
  { place: 3, block: "h-16 bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100", ring: "ring-orange-300" },
] as const

function Results({ results, players }: { results: ChigioResult[]; players: Map<string, ChigioPlayer> }) {
  const podium = PODIUM.map(slot => ({ ...slot, result: results[slot.place - 1] }))
  const nameOf = (id: string) => {
    const player = players.get(id)
    return player ? `${player.nome} ${player.cognome}` : "Giocatore"
  }

  return (
    <>
      <div className="flex items-end gap-2">
        {podium.map(({ place, block, ring, result }) => (
          <div className="flex-1 text-center" key={place}>
            {result && (
              <>
                <PlayerAvatar
                  className={cn("mx-auto mb-1 ring-2", ring, place === 1 && "size-14")}
                  player={players.get(result.profile_id)}
                />
                <p className="truncate text-xs font-semibold">
                  {result.is_winner && "🏆 "}
                  {players.get(result.profile_id)?.cognome ?? "—"}
                </p>
                <div className={cn("mt-1 rounded-t-lg pt-1 text-xs font-semibold leading-5", block)}>
                  <span className="block text-base font-black">{result.rank}</span>
                  {result.tops > 0 && <span className="block">🔝 {result.tops}</span>}
                  <span className="block">👏 {result.applause}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <ol className="divide-y border-t">
        {results.map(result => (
          <li className="flex items-center gap-2 py-2 text-sm" key={result.profile_id}>
            <span className="w-4 text-right tabular-nums text-muted-foreground">{result.rank}</span>
            <PlayerAvatar className="size-7" player={players.get(result.profile_id)} />
            <span className="min-w-0 flex-1 truncate">{nameOf(result.profile_id)}</span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {result.tops > 0 && `🔝 ${result.tops}`}
            </span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">👏 {result.applause}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

// Slide nativo: arrivati in fondo si chiude, rilasciato prima torna a zero.
function SlideToClose({ onConfirm }: { onConfirm: () => void }) {
  const [value, setValue] = useState(0)
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-operative">
        Scorri per chiudere la votazione
      </span>
      <input
        aria-label="Scorri per chiudere la votazione"
        className="h-11 w-full cursor-pointer appearance-none rounded-full bg-operative/10 px-1 accent-operative [&::-moz-range-thumb]:size-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-operative [&::-webkit-slider-thumb]:size-9 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-operative"
        max={100}
        min={0}
        onChange={event => setValue(Number(event.target.value))}
        onKeyUp={() => { if (value >= 100) onConfirm() }}
        onPointerUp={() => {
          if (value >= 95) onConfirm()
          else setValue(0)
        }}
        type="range"
        value={value}
      />
    </label>
  )
}

export function ChigioDoroCard({
  eventId,
  isManager,
  myProfileId,
  players,
}: {
  eventId: string
  isManager: boolean
  myProfileId: string | null
  players: ChigioPlayer[]
}) {
  const [state, setState] = useState<ChigioEventState | null>(null)
  const [draft, setDraft] = useState<ChigioBallot>(EMPTY_BALLOT)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetchChigioEventState(supabase, eventId, myProfileId)
      .then(next => {
        setState(next)
        setDraft(next.ballot)
      })
      .catch(error => console.error("Errore caricamento Chigio d'Oro:", error))
  }, [eventId, myProfileId])

  useEffect(load, [load])

  // Prima dell'apertura la card non c'è.
  if (!state?.poll) return null

  const { poll } = state
  const byId = new Map(players.map(player => [player.id, player]))
  const open = isPollOpen(poll)
  const closesAt = new Date(poll.closes_at)
  const candidates = state.candidates
    .filter(id => id !== myProfileId)
    .map(id => byId.get(id) ?? { id, nome: "?", cognome: "Giocatore" })
    .sort((a, b) => a.cognome.localeCompare(b.cognome, "it"))
  const changed = draft.top !== state.ballot.top || draft.applause.join() !== state.ballot.applause.join()

  const submit = async () => {
    setSaving(true)
    try {
      await submitChigioVote(supabase, eventId, draft)
      toast.success("Voto registrato!")
      load()
    } catch (error) {
      console.error("Errore voto Chigio d'Oro:", error)
      toast.error("Voto non salvato", { description: (error as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const close = async () => {
    try {
      await closeChigioPoll(supabase, eventId)
      toast.success("Votazione chiusa")
      load()
    } catch (error) {
      toast.error("Chiusura non riuscita", { description: (error as Error).message })
    }
  }

  const nameOf = (id: string) => byId.get(id)?.cognome ?? "Giocatore"

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="font-bold">🏆 Chigio d&apos;Oro</h3>

        {open ? (
          <>
            <div className="flex justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
              <span>
                Chiude <strong>{format(closesAt, "EEE d/M 'alle' HH:mm", { locale: it })}</strong>
              </span>
              <span className="text-muted-foreground">
                tra {formatDistanceToNowStrict(closesAt, { locale: it })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {state.canVote ? "Scegli 1 🔝 e fino a 2 👏 · " : ""}
              {poll.ballots_count}/{poll.voters_total} hanno votato
            </p>

            {state.canVote && (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {candidates.map(player => {
                    const pick = draft.top === player.id ? "🔝" : draft.applause.includes(player.id) ? "👏" : null
                    return (
                      <button
                        aria-label={`${player.nome} ${player.cognome}${pick === "🔝" ? ": Er Mejo" : pick ? ": applauso" : ""}`}
                        aria-pressed={!!pick}
                        className={cn(
                          "relative rounded-lg border p-2 text-center text-xs transition-colors",
                          pick === "🔝" && "border-primary bg-primary/10",
                          pick === "👏" && "border-primary/50",
                        )}
                        key={player.id}
                        onClick={() => setDraft(prev => cyclePick(prev, player.id))}
                        type="button"
                      >
                        {pick && <span className="absolute right-1 top-1" aria-hidden="true">{pick}</span>}
                        <PlayerAvatar className="mx-auto mb-1" player={player} />
                        <span className="block truncate">{player.cognome}</span>
                      </button>
                    )
                  })}
                </div>
                {(draft.top || draft.applause.length > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      draft.top && `🔝 ${nameOf(draft.top)}`,
                      draft.applause.length > 0 && `👏 ${draft.applause.map(nameOf).join(", ")}`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
                <Button className="w-full" disabled={!draft.top || !changed || saving} onClick={submit}>
                  {state.ballot.top ? "Aggiorna voto" : "Invia voto"}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Il voto è anonimo: nessuno, nemmeno i manager, vede chi hai votato. Puoi cambiarlo fino alla chiusura.
                </p>
              </>
            )}

            {isManager && <SlideToClose onConfirm={close} />}
          </>
        ) : poll.closed_at ? (
          <>
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>Votazione chiusa</span>
              <span>{poll.ballots_count}/{poll.voters_total} votanti</span>
            </p>
            {state.results.length > 0
              ? <Results players={byId} results={state.results} />
              : <p className="text-sm text-muted-foreground">Nessun voto.</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Votazione in chiusura…</p>
        )}
      </CardContent>
    </Card>
  )
}
