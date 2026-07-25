"use client"

import { useEffect, useState } from "react"
import { Radio, ShieldCheck } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { isUnderPlayer } from "@/lib/formations"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PlayerRow = {
  id: string
  is_starter: boolean
  position_key: string | null
  sort_order: number
  player_snapshot: {
    nome?: string
    cognome?: string
    avatar_url?: string | null
    role?: string | null
    jersey_number?: number | null
    birth_date?: string | null
  }
}

type OfficialFormation = {
  id: string
  formation_module: string
  shirt_color: string | null
  published_at: string
  official_formation_players: PlayerRow[]
}

function PlayerChip({
  eventDate,
  row,
}: {
  eventDate: Date
  row: PlayerRow
}) {
  const player = row.player_snapshot
  const under = isUnderPlayer(player.birth_date, eventDate)
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg border bg-background p-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          alt=""
          className="object-cover"
          src={player.avatar_url ?? undefined}
        />
        <AvatarFallback className="text-[9px] font-bold">
          {player.nome?.[0]}
          {player.cognome?.[0]}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">
          {player.nome} {player.cognome}
        </strong>
        <span className="text-[10px] text-muted-foreground">
          {player.role ?? row.position_key ?? "—"}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {player.role === "PORTIERE" && (
          <Badge className="text-[9px]" variant="outline">
            POR
          </Badge>
        )}
        {under && (
          <Badge className="text-[9px]" variant="secondary">
            UNDER
          </Badge>
        )}
      </span>
    </div>
  )
}

export function OfficialFormationPanel({
  eventDate,
  eventId,
}: {
  eventDate: string | null
  eventId: string
}) {
  const { isManager } = useAppSession()
  const [formation, setFormation] = useState<OfficialFormation | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void supabaseBrowser
      .from("official_formations")
      .select(
        "id, formation_module, shirt_color, published_at, official_formation_players(id, is_starter, position_key, sort_order, player_snapshot)",
      )
      .eq("event_id", eventId)
      .eq("status", "PUBLISHED")
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setFormation((data as OfficialFormation | null) ?? null)
        setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [eventId])

  if (!loaded) return null
  if (!formation) {
    return isManager ? (
      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        La formazione ufficiale non è ancora pubblicata. Creala dalla pagina
        Squadra.
      </div>
    ) : null
  }

  const players = [...formation.official_formation_players].sort(
    (left, right) => left.sort_order - right.sort_order,
  )
  const starters = players.filter(({ is_starter }) => is_starter)
  const bench = players.filter(({ is_starter }) => !is_starter)
  const matchDate = eventDate ? new Date(eventDate) : new Date()

  return (
    <section
      aria-labelledby="official-formation-title"
      className="overflow-hidden rounded-xl border border-primary/25 bg-primary/5"
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Radio aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold" id="official-formation-title">
              Formazione ufficiale
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Modulo {formation.formation_module} · maglia{" "}
              {formation.shirt_color?.toLowerCase() ?? "da definire"}
            </p>
          </div>
        </div>
        <Badge className="gap-1">
          <ShieldCheck aria-hidden="true" />
          Pubblicata
        </Badge>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Titolari
          </h4>
          <div className="grid gap-1.5">
            {starters.map((row) => (
              <PlayerChip eventDate={matchDate} key={row.id} row={row} />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Panchina
          </h4>
          <div className="grid gap-1.5">
            {bench.map((row) => (
              <PlayerChip eventDate={matchDate} key={row.id} row={row} />
            ))}
            {bench.length === 0 && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Nessuna riserva.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
