import Link from "next/link"
import { Info, Shirt, Sparkles } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

type PlayerRosterCardProps = {
  canViewProfile?: boolean
  player: {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    role: string | null
    jersey_number: number | null
    is_u35: boolean
  }
  stats?: {
    goals: number
    assists: number
    player_of_match: number
  }
}

export function PlayerRosterCard({
  canViewProfile = false,
  player,
  stats,
}: PlayerRosterCardProps) {
  return (
    <article
      aria-label={`${player.nome} ${player.cognome}`}
      className="relative min-w-0 overflow-hidden rounded-xl border bg-card px-1.5 py-2 text-center shadow-xs"
      data-player-card
    >
      {canViewProfile && (
        <Link
          aria-label={`Profilo di ${player.nome} ${player.cognome}`}
          className="absolute right-1 top-1 grid size-7 place-items-center rounded-full border bg-background/90 text-muted-foreground transition-colors after:absolute after:-inset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/giocatore/${player.id}`}
        >
          <Info aria-hidden="true" className="size-3.5" />
        </Link>
      )}
      <div className="relative mx-auto size-10">
        <Avatar className="size-10 ring-1 ring-border">
          <AvatarImage
            alt={`${player.nome} ${player.cognome}`}
            src={player.avatar_url ?? undefined}
          />
          <AvatarFallback>
            {player.nome[0]}
            {player.cognome[0]}
          </AvatarFallback>
        </Avatar>
        {player.jersey_number !== null && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-background bg-primary text-[9px] font-black leading-none text-primary-foreground"
          >
            {player.jersey_number}
          </span>
        )}
      </div>
      <p
        className="mt-1 truncate text-[10px] text-muted-foreground"
        data-testid="player-first-name"
      >
        {player.nome}
      </p>
      <h2
        className="truncate text-xs font-black"
        data-testid="player-surname"
      >
        {player.cognome}
      </h2>
      <p
        className="mt-0.5 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
        data-testid="player-role-row"
      >
        {/* Sigla visibile: il ruolo intero a 10px non entra con U35 e maglia. */}
        <span title={player.role ?? "Ruolo da definire"}>
          <span aria-hidden="true">{player.role?.slice(0, 3) ?? "—"}</span>
          <span className="sr-only">{player.role ?? "Ruolo da definire"}</span>
        </span>
        {player.is_u35 && (
          <Badge className="h-4 border-0 bg-sky-100 px-1 text-[10px] text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-200">
            U35
          </Badge>
        )}
        <span aria-label={`Numero ${player.jersey_number ?? "non assegnato"}`}>
          <Shirt aria-hidden="true" className="inline size-3" />
          {player.jersey_number ?? "—"}
        </span>
      </p>
      <div
        className="mt-1 flex justify-center gap-2 border-t pt-1 text-[11px] tabular-nums"
        data-testid="player-stats"
      >
        <span>
          <strong>{stats?.goals ?? 0}</strong> G
        </span>
        <span>
          <strong>{stats?.assists ?? 0}</strong> A
        </span>
        <span>
          <Sparkles aria-label="MVP" className="inline size-2.5" />{" "}
          <strong>{stats?.player_of_match ?? 0}</strong>
        </span>
      </div>
    </article>
  )
}
