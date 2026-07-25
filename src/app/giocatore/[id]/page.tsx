"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import {
  ArrowLeft,
  CalendarCheck,
  LockKeyhole,
  Sparkles,
  Target,
} from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { AttendanceRing } from "@/components/stats/AttendanceRing"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type Player = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  role: string | null
  jersey_number: number | null
}

type EventRow = {
  id: string
  tipo: "ALLENAMENTO" | "PARTITA"
  data_ora: string | null
  avversario: string | null
}

export default function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { isAssociated, loading: sessionLoading, user } = useAppSession()
  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState({
    goals: 0,
    assists: 0,
    player_of_match: 0,
  })
  const [events, setEvents] = useState<EventRow[]>([])
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAssociated) return
    let active = true
    void Promise.all([
      supabaseBrowser
        .from("authenticated_active_roster")
        .select("id, nome, cognome, avatar_url, role, jersey_number")
        .eq("id", id)
        .maybeSingle(),
      supabaseBrowser
        .from("public_player_statistics")
        .select("goals, assists, player_of_match")
        .eq("profile_id", id)
        .maybeSingle(),
      supabaseBrowser
        .from("events")
        .select("id, tipo, data_ora, avversario")
        .lte("data_ora", new Date().toISOString())
        .order("data_ora", { ascending: false }),
      supabaseBrowser
        .from("event_checkins")
        .select("event_id")
        .eq("profile_id", id)
        .eq("status", "PRESENT"),
    ]).then(([playerResult, statsResult, eventsResult, checkinsResult]) => {
      if (!active) return
      setPlayer((playerResult.data as Player | null) ?? null)
      if (statsResult.data) setStats(statsResult.data)
      setEvents((eventsResult.data ?? []) as EventRow[])
      setPresentIds(
        new Set((checkinsResult.data ?? []).map(({ event_id }) => event_id)),
      )
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id, isAssociated])

  const training = useMemo(
    () => events.filter(({ tipo }) => tipo === "ALLENAMENTO"),
    [events],
  )
  const trainingPresent = training.filter(({ id: eventId }) =>
    presentIds.has(eventId),
  ).length
  const percentage = training.length
    ? (trainingPresent / training.length) * 100
    : 0

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  if (!isAssociated) {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md items-center p-4 text-center">
        <div className="rounded-xl border bg-card p-6">
          <LockKeyhole
            aria-hidden="true"
            className="mx-auto size-7 text-muted-foreground"
          />
          <h1 className="mt-3 text-xl font-bold">Scheda giocatore riservata</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accedi con un profilo approvato per consultare presenze e
            statistiche personali.
          </p>
          <Button asChild className="mt-4">
            <Link href={user ? "/profilo" : "/login"}>
              {user ? "Controlla associazione" : "Accedi"}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!player) {
    return <p className="p-10 text-center">Giocatore non trovato.</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 pb-24 sm:px-5">
      <Button asChild size="sm" variant="ghost">
        <Link href="/statistiche">
          <ArrowLeft aria-hidden="true" />
          Statistiche
        </Link>
      </Button>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="size-20 border-2 border-background shadow-md ring-1 ring-border">
            <AvatarImage
              alt={`${player.nome} ${player.cognome}`}
              className="object-cover"
              src={player.avatar_url ?? undefined}
            />
            <AvatarFallback className="text-lg font-black">
              {player.nome[0]}
              {player.cognome[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black">
              {player.nome} {player.cognome}
            </h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline">{player.role ?? "Ruolo da definire"}</Badge>
              <Badge variant="secondary">#{player.jersey_number ?? "—"}</Badge>
            </div>
          </div>
          <AttendanceRing
            avatarUrl={player.avatar_url}
            name={`${player.nome} ${player.cognome}`}
            percentage={percentage}
            size={72}
          />
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 border-t pt-4 text-center">
          {[
            ["Goal", stats.goals],
            ["Assist", stats.assists],
            ["MVP", stats.player_of_match],
            ["Presenze", trainingPresent],
          ].map(([label, value]) => (
            <div className="rounded-lg bg-muted/55 p-2" key={String(label)}>
              <strong className="block text-xl tabular-nums">{value}</strong>
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-3">
          <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
          <h2 className="font-bold">Storico eventi</h2>
        </div>
        <div className="divide-y">
          {events.slice(0, 30).map((event) => {
            const present = presentIds.has(event.id)
            return (
              <div
                className="flex min-h-12 items-center gap-3 px-3 py-2"
                key={event.id}
              >
                {event.tipo === "PARTITA" ? (
                  <Target
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                ) : (
                  <Sparkles
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">
                    {event.tipo === "PARTITA"
                      ? event.avversario ?? "Partita"
                      : "Allenamento"}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">
                    {event.data_ora
                      ? format(new Date(event.data_ora), "d MMM yyyy", {
                          locale: it,
                        })
                      : "Data non definita"}
                  </span>
                </span>
                <Badge variant={present ? "default" : "outline"}>
                  {present ? "Presente" : "Assente"}
                </Badge>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
