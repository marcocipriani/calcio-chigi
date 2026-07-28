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
import { PageContainer } from "@/components/layout/PageContainer"
import { romeDateKey } from "@/lib/season"
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

const emptyStats = {
  goals: 0,
  assists: 0,
  player_of_match: 0,
}

export default function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { isAssociated, loading: sessionLoading, user } = useAppSession()
  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState(emptyStats)
  const [events, setEvents] = useState<EventRow[]>([])
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([
      supabaseBrowser
        .from("public_active_roster")
        .select("id, nome, cognome, avatar_url, role, jersey_number")
        .eq("category", "PLAYER")
        .eq("id", id)
        .maybeSingle(),
      supabaseBrowser
        .from("public_player_statistics")
        .select("goals, assists, player_of_match")
        .eq("profile_id", id)
        .maybeSingle(),
    ]).then(([playerResult, statsResult]) => {
      if (!active) return
      setPlayer((playerResult.data as Player | null) ?? null)
      setStats(statsResult.data ?? emptyStats)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!isAssociated) {
      setEvents([])
      setPresentIds(new Set())
      return
    }

    let active = true
    setAttendanceLoading(true)
    void (async () => {
      const today = romeDateKey(new Date())
      const { data: season } = await supabaseBrowser
        .from("seasons")
        .select("id")
        .lte("starts_on", today)
        .gte("ends_on", today)
        .maybeSingle()

      if (!season || !active) {
        if (active) setAttendanceLoading(false)
        return
      }

      const { data: eventRows } = await supabaseBrowser
        .from("events")
        .select("id, tipo, data_ora, avversario")
        .eq("season_id", season.id)
        .lte("data_ora", new Date().toISOString())
        .order("data_ora", { ascending: false })

      if (!active) return
      const currentEvents = (eventRows ?? []) as EventRow[]
      const eventIds = currentEvents.map(({ id: eventId }) => eventId)
      const checkinsResult = eventIds.length
        ? await supabaseBrowser
            .from("event_checkins")
            .select("event_id")
            .eq("profile_id", id)
            .eq("status", "PRESENT")
            .in("event_id", eventIds)
        : { data: [] }

      if (!active) return
      setEvents(currentEvents)
      setPresentIds(
        new Set((checkinsResult.data ?? []).map(({ event_id }) => event_id)),
      )
      setAttendanceLoading(false)
    })()

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

  if (loading) {
    return (
      <PageContainer contentClassName="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </PageContainer>
    )
  }

  if (!player) {
    return (
      <PageContainer contentClassName="mx-auto max-w-2xl">
        <p className="py-10 text-center">Giocatore non trovato.</p>
      </PageContainer>
    )
  }

  const publicMetrics = [
    ["Goal", stats.goals],
    ["Assist", stats.assists],
    ["MVP", stats.player_of_match],
  ] as const

  return (
    <PageContainer contentClassName="mx-auto max-w-2xl pb-24">
      <main className="space-y-4">
      <Button asChild size="sm" variant="ghost">
        <Link href="/statistiche">
          <ArrowLeft aria-hidden="true" />
          Statistiche
        </Link>
      </Button>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-4 p-4">
          <Avatar className="size-20 border-2 border-background ring-1 ring-border">
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
            <h1 className="truncate text-2xl font-black tracking-tight">
              {player.nome} {player.cognome}
            </h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline">{player.role ?? "Ruolo da definire"}</Badge>
              <Badge variant="secondary">#{player.jersey_number ?? "—"}</Badge>
            </div>
          </div>
          {isAssociated && !attendanceLoading && (
            <AttendanceRing
              avatarUrl={player.avatar_url}
              name={`${player.nome} ${player.cognome}`}
              percentage={percentage}
              size={72}
            />
          )}
        </div>
        <dl
          className={`grid border-t bg-muted/25 ${
            isAssociated ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {publicMetrics.map(([label, value]) => (
            <div
              className="border-r px-2 py-3 text-center last:border-r-0"
              key={label}
            >
              <dd className="text-xl font-black tabular-nums">{value}</dd>
              <dt className="text-[10px] font-bold uppercase text-muted-foreground">
                {label}
              </dt>
            </div>
          ))}
          {isAssociated && (
            <div className="px-2 py-3 text-center">
              <dd className="text-xl font-black tabular-nums">
                {trainingPresent}
              </dd>
              <dt className="text-[10px] font-bold uppercase text-muted-foreground">
                Presenze
              </dt>
            </div>
          )}
        </dl>
      </section>

      {sessionLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !isAssociated ? (
        <section className="rounded-xl border border-dashed bg-card p-6 text-center">
          <LockKeyhole
            aria-hidden="true"
            className="mx-auto size-6 text-muted-foreground"
          />
          <h2 className="mt-3 font-bold">Accedi per vedere le presenze</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Frequenza agli allenamenti e storico personale sono riservati agli
            account approvati.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href={user ? "/profilo" : "/login"}>
              {user ? "Controlla associazione" : "Accedi"}
            </Link>
          </Button>
        </section>
      ) : attendanceLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : (
        <section
          aria-labelledby="player-events-title"
          className="overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex items-center gap-2 border-b p-3">
            <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
            <h2 className="font-bold" id="player-events-title">
              Storico eventi
            </h2>
            <Badge className="ml-auto" variant="outline">
              Stagione in corso
            </Badge>
          </div>
          <div className="divide-y">
            {events.slice(0, 30).map((event) => {
              const present = presentIds.has(event.id)
              return (
                <div
                  className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/35"
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
            {events.length === 0 && (
              <p className="p-5 text-center text-sm text-muted-foreground">
                Nessun evento concluso in questa stagione.
              </p>
            )}
          </div>
        </section>
      )}
      </main>
    </PageContainer>
  )
}
