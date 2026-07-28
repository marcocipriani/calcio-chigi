import { Shirt, Sparkles } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

type PlayerRosterCardProps = {
  player: {
    id: string
    nome: string
    cognome: string
    avatar_url: string | null
    role: string | null
    jersey_number: number | null
    status: "YES" | "MAYBE"
  }
  stats?: {
    goals: number
    assists: number
    player_of_match: number
  }
}

export function PlayerRosterCard({ player, stats }: PlayerRosterCardProps) {
  return (
    <article
      aria-label={`${player.nome} ${player.cognome}`}
      className="relative min-w-0 overflow-hidden rounded-xl border bg-card px-1.5 py-2 text-center shadow-xs"
      data-player-card
    >
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
      <span
        aria-label={`Numero ${player.jersey_number ?? "non assegnato"}`}
        className="relative mx-auto mt-0.5 block size-5 text-primary"
        data-testid="player-shirt"
      >
        <Shirt
          aria-hidden="true"
          className="size-5 fill-current opacity-15"
        />
        <strong className="absolute inset-0 grid place-items-center text-[8px]">
          {player.jersey_number ?? "—"}
        </strong>
      </span>
      <p
        className="truncate text-center text-[8px] uppercase tracking-wide text-muted-foreground"
        data-testid="player-role"
      >
        {player.role ?? "Ruolo da definire"}
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
