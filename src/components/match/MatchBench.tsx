"use client"

import type { ReactNode } from "react"

import { MatchPlayerAvatar, type AvatarBadges } from "./MatchPlayerAvatar"
import { byRole, type MatchPlayer } from "./players"

/** Panchina in riga sotto il campo: va a capo, niente scroll interno. */
export function MatchBench({
  bench,
  expelled,
  players,
  badgesFor,
  onSelect,
  counters,
  disabled = false,
}: {
  bench: string[]
  expelled: string[]
  players: Map<string, MatchPlayer>
  badgesFor: (profileId: string) => AvatarBadges
  onSelect?: (profileId: string) => void
  counters?: ReactNode
  disabled?: boolean
}) {
  const available = bench
    .map((id) => players.get(id))
    .filter((player): player is MatchPlayer => Boolean(player))
    .sort(byRole)
  const sentOff = expelled
    .map((id) => players.get(id))
    .filter((player): player is MatchPlayer => Boolean(player))

  return (
    <section aria-labelledby="match-bench-title" className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black" id="match-bench-title">
          Panchina
        </h2>
        {counters}
      </div>
      {available.length + sentOff.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuno in panchina.</p>
      ) : (
        <div className="flex flex-wrap gap-x-1 gap-y-2">
          {available.map((player) => (
            <MatchPlayerAvatar
              badges={badgesFor(player.id)}
              disabled={disabled || !onSelect}
              key={player.id}
              onClick={() => onSelect?.(player.id)}
              player={player}
            />
          ))}
          {sentOff.map((player) => (
            <MatchPlayerAvatar badges={{ ...badgesFor(player.id), expelled: true }} disabled key={player.id} player={player} />
          ))}
        </div>
      )}
    </section>
  )
}
