"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { ChevronRight, Radio, Users } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { fetchNextChigiMatch } from "@/lib/api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import type { Event } from "@/lib/types"

type FormationPlayer = {
  id: string
  is_starter: boolean
  sort_order: number
  player_snapshot: {
    nome?: string
    cognome?: string
    avatar_url?: string | null
  }
}

type Formation = {
  id: string
  formation_module: string
  published_at: string
  official_formation_players: FormationPlayer[]
}

export function OfficialFormationCard() {
  const { isManager } = useAppSession()
  const [event, setEvent] = useState<Event | null>(null)
  const [formation, setFormation] = useState<Formation | null>(null)

  useEffect(() => {
    let active = true
    void fetchNextChigiMatch(supabaseBrowser).then(async (nextEvent) => {
      if (!active || !nextEvent) return
      setEvent(nextEvent)
      const { data } = await supabaseBrowser
        .from("official_formations")
        .select(
          "id, formation_module, published_at, official_formation_players(id, is_starter, sort_order, player_snapshot)",
        )
        .eq("event_id", nextEvent.id)
        .eq("status", "PUBLISHED")
        .maybeSingle()
      if (active) setFormation((data as Formation | null) ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  if (!event) return null

  const opponent =
    event.avversario ??
    (event.squadra_casa?.toLocaleLowerCase("it").includes("chigi")
      ? event.squadra_ospite
      : event.squadra_casa) ??
    "Avversario da definire"
  const starters =
    formation?.official_formation_players
      .filter(({ is_starter }) => is_starter)
      .sort((left, right) => left.sort_order - right.sort_order) ?? []

  return (
    <Link
      className="group flex min-h-24 items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 outline-none transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
      href={`/evento/${event.id}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {formation ? (
          <Radio aria-hidden="true" className="size-5" />
        ) : (
          <Users aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm">{opponent}</strong>
          <Badge variant={formation ? "default" : "outline"}>
            {formation
              ? `Ufficiale · ${formation.formation_module}`
              : isManager
                ? "Da pubblicare"
                : "In attesa"}
          </Badge>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {event.data_ora
            ? format(new Date(event.data_ora), "EEEE d MMMM · HH:mm", {
                locale: it,
              })
            : "Data da definire"}
        </span>
        {formation && (
          <span className="mt-2 flex -space-x-2">
            {starters.slice(0, 8).map(({ id, player_snapshot: player }) => (
              <Avatar className="size-6 border-2 border-background" key={id}>
                <AvatarImage
                  alt=""
                  className="object-cover"
                  src={player.avatar_url ?? undefined}
                />
                <AvatarFallback className="text-[8px]">
                  {player.nome?.[0]}
                  {player.cognome?.[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}
