"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, Eye, Lock, Radio, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copyOfficialFormationMessage } from "@/lib/formationClipboard"
import {
  buildMatchMessage,
  bySurname,
  isUnderPlayer,
  type MatchMessageEvent,
  type MatchMessagePlayer,
} from "@/lib/formations"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PlayerSnapshot = {
  nome?: string | null
  cognome?: string | null
  avatar_url?: string | null
  role?: string | null
  jersey_number?: number | null
  birth_date?: string | null
}

type PlayerRow = {
  id: string
  is_starter: boolean
  position_key: string | null
  sort_order: number
  player_snapshot: PlayerSnapshot
}

type Visibility = "PRIVATE" | "PUBLIC"

type OfficialFormation = {
  id: string
  formation_module: string
  shirt_color: string | null
  visibility: Visibility
  published_at: string
  official_formation_players: PlayerRow[]
}

// Riga di get_event_callups: i campi dello snapshot più il colore maglia.
type Callup = PlayerSnapshot & { shirt_color: string | null }

export type PublishedCallups = {
  players: MatchMessagePlayer[]
  shirtColor: string | null
}

const toMessagePlayer = (row: PlayerRow): MatchMessagePlayer => ({
  nome: row.player_snapshot.nome ?? "",
  cognome: row.player_snapshot.cognome ?? "",
  role: row.player_snapshot.role,
  birthDate: row.player_snapshot.birth_date,
  isStarter: row.is_starter,
})

function PlayerChip({
  eventDate,
  player,
  positionKey,
}: {
  eventDate: Date
  player: PlayerSnapshot
  positionKey?: string | null
}) {
  const under = isUnderPlayer(player.birth_date, eventDate)
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg border bg-background p-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          alt=""
          className="object-cover"
          src={player.avatar_url ?? undefined}
        />
        <AvatarFallback className="text-[10px] font-bold">
          {player.nome?.[0]}
          {player.cognome?.[0]}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">
          {player.nome} {player.cognome}
        </strong>
        <span className="text-[10px] text-muted-foreground">
          {player.role ?? positionKey ?? "—"}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {player.role === "PORTIERE" && (
          <Badge className="text-[10px]" variant="outline">
            POR
          </Badge>
        )}
        {under && (
          <Badge className="text-[10px]" variant="secondary">
            UNDER
          </Badge>
        )}
      </span>
    </div>
  )
}

export function OfficialFormationPanel({
  event,
  eventId,
  onCallups,
}: {
  event: MatchMessageEvent
  eventId: string
  /** Convocati della formazione pubblicata, per il messaggio della pagina evento. */
  onCallups?: (callups: PublishedCallups | null) => void
}) {
  const { isManager } = useAppSession()
  const [formation, setFormation] = useState<OfficialFormation | null>(null)
  const [callups, setCallups] = useState<Callup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabaseBrowser
        .from("official_formations")
        .select(
          "id, formation_module, shirt_color, visibility, published_at, official_formation_players(id, is_starter, position_key, sort_order, player_snapshot)",
        )
        .eq("event_id", eventId)
        .eq("status", "PUBLISHED")
        .maybeSingle()
      // Formazione privata: RLS la nasconde ai giocatori, che leggono solo i convocati.
      const rows =
        (data || isManager)
          ? null
          : (
              await supabaseBrowser.rpc("get_event_callups", {
                p_event_id: eventId,
              })
            ).data
      if (!active) return
      setFormation((data as OfficialFormation | null) ?? null)
      setCallups([...((rows as Callup[] | null) ?? [])].sort(bySurname))
      setLoaded(true)
    }
    void load()
    return () => {
      active = false
    }
  }, [eventId, isManager])

  useEffect(() => {
    onCallups?.(
      formation
        ? {
            players: formation.official_formation_players.map(toMessagePlayer),
            shirtColor: formation.shirt_color,
          }
        : null,
    )
  }, [formation, onCallups])

  if (!loaded) return null

  const matchDate = event.data_ora ? new Date(event.data_ora) : new Date()

  if (!formation) {
    if (callups.length > 0) {
      const shirt = callups[0].shirt_color
      return (
        <section
          aria-labelledby="official-formation-title"
          className="overflow-hidden rounded-xl border border-primary/25 bg-primary/5"
        >
          <div className="flex items-center gap-2 border-b border-primary/15 p-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Users aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold" id="official-formation-title">
                Convocati
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {callups.length} convocati
                {shirt ? ` · maglia ${shirt.toLowerCase()}` : ""}
              </p>
            </div>
          </div>
          <div className="grid gap-1.5 p-3 sm:grid-cols-2">
            {callups.map((callup, index) => (
              <PlayerChip eventDate={matchDate} key={index} player={callup} />
            ))}
          </div>
        </section>
      )
    }
    return isManager ? (
      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        <p>La formazione ufficiale non è ancora pubblicata.</p>
        <Button
          asChild
          className="mt-3 bg-operative text-operative-foreground hover:bg-operative/90"
          size="sm"
        >
          <Link href={`/squadra?formazione=${eventId}`}>Crea formazione</Link>
        </Button>
      </div>
    ) : null
  }

  const players = [...formation.official_formation_players].sort(
    (left, right) => left.sort_order - right.sort_order,
  )
  const starters = players.filter(({ is_starter }) => is_starter)
  const bench = players.filter(({ is_starter }) => !is_starter)
  const isPublic = formation.visibility === "PUBLIC"

  const toggleVisibility = async () => {
    const next: Visibility = isPublic ? "PRIVATE" : "PUBLIC"
    setSaving(true)
    const { error } = await supabaseBrowser.rpc(
      "set_official_formation_visibility",
      { p_event_id: eventId, p_visibility: next },
    )
    setSaving(false)
    if (error) {
      toast.error("Visibilità non aggiornata", { description: error.message })
      return
    }
    setFormation({ ...formation, visibility: next })
    toast.success(
      next === "PUBLIC"
        ? "Formazione resa pubblica e notificata"
        : "Formazione di nuovo privata",
    )
  }

  const copyMessage = (lineup: boolean) =>
    copyOfficialFormationMessage(
      buildMatchMessage(event, players.map(toMessagePlayer), {
        lineup,
        shirtColor: formation.shirt_color,
      }),
    )

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
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="gap-1">
            <ShieldCheck aria-hidden="true" />
            Pubblicata
          </Badge>
          {isManager && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/squadra?formazione=${eventId}`}>Modifica</Link>
            </Button>
          )}
        </div>
      </div>
      {isManager && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 p-3">
          <Badge className="gap-1" variant="outline">
            {isPublic ? (
              <Eye aria-hidden="true" />
            ) : (
              <Lock aria-hidden="true" />
            )}
            {isPublic ? "Pubblica" : "Privata"}
          </Badge>
          <Button
            className="bg-operative text-operative-foreground hover:bg-operative/90"
            disabled={saving}
            onClick={() => void toggleVisibility()}
            size="sm"
          >
            {isPublic ? "Rendi privata" : "Rendi pubblica"}
          </Button>
          <Button onClick={() => void copyMessage(false)} size="sm" variant="outline">
            <Users aria-hidden="true" />
            Copia convocati
          </Button>
          <Button onClick={() => void copyMessage(true)} size="sm" variant="outline">
            <Copy aria-hidden="true" />
            Copia formazione
          </Button>
        </div>
      )}
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Titolari
          </h4>
          <div className="grid gap-1.5">
            {starters.map((row) => (
              <PlayerChip
                eventDate={matchDate}
                key={row.id}
                player={row.player_snapshot}
                positionKey={row.position_key}
              />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Panchina
          </h4>
          <div className="grid gap-1.5">
            {bench.map((row) => (
              <PlayerChip
                eventDate={matchDate}
                key={row.id}
                player={row.player_snapshot}
                positionKey={row.position_key}
              />
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
