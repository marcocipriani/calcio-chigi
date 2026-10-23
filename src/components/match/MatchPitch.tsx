"use client"

import { Pitch } from "@/components/formations/Pitch"
import { FORMATIONS } from "@/lib/constants"

import { MatchPlayerAvatar, type AvatarBadges } from "./MatchPlayerAvatar"
import type { MatchPlayer } from "./players"

/** Campo con gli avatar nelle posizioni del modulo; un tocco apre le azioni. */
export function MatchPitch({
  module,
  onField,
  players,
  badgesFor,
  onSelect,
  disabled = false,
}: {
  module: string
  onField: Record<string, string | null>
  players: Map<string, MatchPlayer>
  badgesFor: (profileId: string) => AvatarBadges
  onSelect: (positionKey: string, profileId: string) => void
  disabled?: boolean
}) {
  const slots = FORMATIONS[module] ?? FORMATIONS["4-4-2"]
  return (
    <Pitch>
      {slots.map((slot) => {
        const profileId = onField[slot.id] ?? null
        const player = profileId ? players.get(profileId) : undefined
        return (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            key={slot.id}
            style={{ top: slot.top, left: slot.left }}
          >
            {player ? (
              <MatchPlayerAvatar
                badges={badgesFor(player.id)}
                disabled={disabled}
                onClick={() => onSelect(slot.id, player.id)}
                onField
                player={player}
              />
            ) : (
              // Posto vuoto: espulsione, si gioca in inferiorità.
              <span
                aria-label="Posto vuoto"
                className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-white/70 text-xs font-black text-white/80"
                role="img"
              >
                —
              </span>
            )}
          </div>
        )
      })}
    </Pitch>
  )
}
