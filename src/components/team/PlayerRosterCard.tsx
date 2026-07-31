import Link from "next/link"
import { Info, Shirt, Sparkles } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PlayerRosterCardProps = {
  canViewProfile?: boolean
  muted?: boolean
  player: {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    role: string | null
    jersey_number: number | null
    is_u35: boolean
    status: "YES" | "MAYBE"
  }
  stats?: {
    goals: number
    assists: number
    player_of_match: number
  }
}

export function PlayerRosterCard({
  canViewProfile = false,
  muted = false,
  player,
  stats,
}: PlayerRosterCardProps) {
  return (
    <article
      aria-label={`${player.nome} ${player.cognome}`}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border bg-card px-1.5 py-2 text-center shadow-xs",
        muted && "opacity-40 grayscale",
      )}
      data-player-card
    >
      {canViewProfile && !muted && (
        <Link
          aria-label={`Profilo di ${player.nome} ${player.cognome}`}
          className="absolute right-1 top-1 grid size-7 place-items-center rounded-full border bg-background/90 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/giocatore/${player.id}`}
        >
          <Info aria-hidden="true" className="size-3.5" />
        </Link>
      )}
      <Avatar className="mx-auto size-10 ring-1 ring-border">
        <AvatarImage
          alt={`${player.nome} ${player.cognome}`}
          src={player.avatar_url ?? undefined}
        />
        <AvatarFallback>
          {player.nome[0]}
          {player.cognome[0]}
        </AvatarFallback>
      </Avatar>
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
        className="mt-0.5 flex items-center justify-center gap-1 truncate text-[8px] uppercase tracking-wide text-muted-foreground"
        data-testid="player-role-row"
      >
        <span>{player.role ?? "Ruolo da definire"}</span>
        {player.is_u35 && (
          <Badge className="h-4 border-0 bg-sky-100 px-1 text-[8px] text-sky-700 hover:bg-sky-100">
            U35
          </Badge>
        )}
        <span aria-label={`Numero ${player.jersey_number ?? "non assegnato"}`}>
          <Shirt aria-hidden="true" className="inline size-3" />
          {player.jersey_number ?? "—"}
        </span>
      </p>
      <div
        className="mt-1 flex justify-center gap-2 border-t pt-1 text-[9px] tabular-nums"
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
      {player.status === "MAYBE" && (
        <Badge
          className="absolute right-1 top-1 h-4 border-amber-200 bg-amber-50 px-1 text-[8px] text-amber-800"
          variant="outline"
        >
          Forse
        </Badge>
      )}
    </article>
  )
}
