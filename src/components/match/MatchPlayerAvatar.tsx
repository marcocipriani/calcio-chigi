"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

import { CardIcon } from "./MatchIcons"
import type { MatchPlayer } from "./players"

export type AvatarBadges = {
  goals?: number
  yellows?: number
  expelled?: boolean
  u35?: boolean
  discipline?: "DIFFIDATO" | "SQUALIFICATO" | null
  subbedIn?: string | null
  subbedOut?: string | null
}

/** Avatar toccabile, in campo o in panchina, con goal, cartellini e cambi. */
export function MatchPlayerAvatar({
  player,
  badges = {},
  onField = false,
  onClick,
  disabled = false,
  selected = false,
}: {
  player: MatchPlayer
  badges?: AvatarBadges
  onField?: boolean
  onClick?: () => void
  disabled?: boolean
  selected?: boolean
}) {
  const label = [
    `${player.nome} ${player.cognome}`,
    badges.goals ? `${badges.goals} goal` : null,
    badges.yellows ? `${badges.yellows} giallo` : null,
    badges.expelled ? "espulso" : null,
    badges.discipline === "DIFFIDATO" ? "diffidato" : null,
    badges.discipline === "SQUALIFICATO" ? "squalificato" : null,
    badges.subbedIn ? `entrato al ${badges.subbedIn}` : null,
    badges.subbedOut ? `uscito al ${badges.subbedOut}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      aria-label={label}
      aria-pressed={selected || undefined}
      className={cn(
        "group flex w-16 flex-col items-center gap-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        badges.expelled && "opacity-50",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="relative">
        <Avatar
          className={cn(
            "size-12 border-2 bg-white shadow-md",
            onField ? "border-white" : "border-border",
            selected && "ring-4 ring-primary",
          )}
        >
          <AvatarImage alt="" className="object-cover" src={player.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs font-black text-slate-700">
            {player.nome[0]}
            {player.cognome[0]}
          </AvatarFallback>
        </Avatar>
        {Boolean(badges.goals) && (
          <span className="absolute -right-2 -top-1 rounded-full bg-white px-1 text-[10px] font-black leading-4 text-slate-900 shadow">
            ⚽{badges.goals! > 1 ? badges.goals : ""}
          </span>
        )}
        {(badges.expelled || Boolean(badges.yellows)) && (
          <span className="absolute -left-1 -top-1 flex gap-0.5">
            {badges.expelled ? <CardIcon red /> : <CardIcon />}
          </span>
        )}
        {badges.u35 && (
          <span className="absolute -bottom-0.5 -right-2 rounded bg-sky-100 px-1 text-[10px] font-black leading-4 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
            U35
          </span>
        )}
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-bold leading-tight",
          onField ? "text-white drop-shadow" : "text-foreground",
        )}
      >
        {player.cognome}
      </span>
      {(badges.subbedIn || badges.subbedOut || badges.discipline) && (
        <span
          className={cn(
            "text-[10px] font-bold leading-tight",
            onField ? "text-white/90" : "text-muted-foreground",
            badges.discipline &&
              "rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
          )}
        >
          {badges.discipline === "SQUALIFICATO"
            ? "Squalif."
            : badges.discipline === "DIFFIDATO"
              ? "Diffidato"
              : badges.subbedIn
                ? `↪${badges.subbedIn}`
                : `↩${badges.subbedOut}`}
        </span>
      )}
    </button>
  )
}
