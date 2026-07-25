"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BarChart3, LockKeyhole, Medal, Sparkles, Target } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { AttendanceRing } from "@/components/stats/AttendanceRing"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PlayerRow = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  role: string | null
  jersey_number: number | null
}

type StatsRow = {
  profile_id: string
  goals: number
  assists: number
  player_of_match: number
}

type AttendanceStat = PlayerRow & {
  present: number
  total: number
  percentage: number
}

export default function StatisticsPage() {
  const { isAssociated, loading: sessionLoading, user } = useAppSession()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [stats, setStats] = useState<StatsRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void Promise.all([
      supabaseBrowser
        .from("public_active_roster")
        .select("id, nome, cognome, avatar_url, role, jersey_number")
        .eq("category", "PLAYER"),
      supabaseBrowser.from("public_player_statistics").select("*"),
    ]).then(([playersResult, statsResult]) => {
      if (!active) return
      setPlayers((playersResult.data ?? []) as PlayerRow[])
      setStats((statsResult.data ?? []) as StatsRow[])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isAssociated) {
      setAttendance([])
      return
    }
    let active = true
    const now = new Date().toISOString()
    void Promise.all([
      supabaseBrowser
        .from("events")
        .select("id")
        .eq("tipo", "ALLENAMENTO")
        .lte("data_ora", now),
      supabaseBrowser
        .from("event_checkins")
        .select("event_id, profile_id, status"),
    ]).then(([eventsResult, checkinsResult]) => {
      if (!active) return
      const eventIds = new Set((eventsResult.data ?? []).map(({ id }) => id))
      const total = eventIds.size
      const presentByProfile = new Map<string, number>()
      for (const checkin of checkinsResult.data ?? []) {
        if (checkin.status !== "PRESENT" || !eventIds.has(checkin.event_id)) {
          continue
        }
        presentByProfile.set(
          checkin.profile_id,
          (presentByProfile.get(checkin.profile_id) ?? 0) + 1,
        )
      }
      setAttendance(
        players
          .map((player) => {
            const present = presentByProfile.get(player.id) ?? 0
            return {
              ...player,
              present,
              total,
              percentage: total ? (present / total) * 100 : 0,
            }
          })
          .sort((left, right) => right.percentage - left.percentage),
      )
    })
    return () => {
      active = false
    }
  }, [isAssociated, players])

  const combined = useMemo(() => {
    const statsById = new Map(stats.map((row) => [row.profile_id, row]))
    return players
      .map((player) => ({
        ...player,
        goals: statsById.get(player.id)?.goals ?? 0,
        assists: statsById.get(player.id)?.assists ?? 0,
        playerOfMatch: statsById.get(player.id)?.player_of_match ?? 0,
      }))
      .sort(
        (left, right) =>
          right.goals - left.goals ||
          right.assists - left.assists ||
          left.cognome.localeCompare(right.cognome, "it"),
      )
  }, [players, stats])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-3 py-4 pb-24 sm:px-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Numeri della stagione
        </p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Statistiche
        </h1>
      </header>

      <section aria-labelledby="tournament-stats-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 aria-hidden="true" className="size-4 text-primary" />
          <h2 className="font-bold" id="tournament-stats-title">
            Torneo
          </h2>
          <Badge variant="outline">Pubbliche</Badge>
        </div>
        {loading ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-14" key={index} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[32px_1fr_48px_48px_56px] items-center gap-2 border-b bg-muted/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>#</span>
              <span>Giocatore</span>
              <span className="text-center">Goal</span>
              <span className="text-center">Assist</span>
              <span className="text-center">MVP</span>
            </div>
            {combined.map((player, index) => {
              const content = (
                <>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-8 shrink-0">
                      <AvatarImage
                        alt=""
                        className="object-cover"
                        src={player.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="text-[9px]">
                        {player.nome[0]}
                        {player.cognome[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {player.cognome} {player.nome}
                      </strong>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {player.role ?? "—"} · #{player.jersey_number ?? "—"}
                      </span>
                    </span>
                  </span>
                  <strong className="text-center tabular-nums">
                    {player.goals}
                  </strong>
                  <strong className="text-center tabular-nums">
                    {player.assists}
                  </strong>
                  <strong className="inline-flex items-center justify-center gap-1 tabular-nums">
                    <Sparkles
                      aria-hidden="true"
                      className="size-3 text-amber-500"
                    />
                    {player.playerOfMatch}
                  </strong>
                </>
              )
              return isAssociated ? (
                <Link
                  className="grid min-h-14 grid-cols-[32px_1fr_48px_48px_56px] items-center gap-2 border-b px-3 transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  href={`/giocatore/${player.id}`}
                  key={player.id}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className="grid min-h-14 grid-cols-[32px_1fr_48px_48px_56px] items-center gap-2 border-b px-3 last:border-b-0"
                  key={player.id}
                >
                  {content}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="training-stats-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <Target aria-hidden="true" className="size-4 text-primary" />
          <h2 className="font-bold" id="training-stats-title">
            Presenze allenamenti
          </h2>
          <Badge variant="outline">Login</Badge>
        </div>
        {!sessionLoading && !isAssociated ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center">
            <LockKeyhole
              aria-hidden="true"
              className="mx-auto size-6 text-muted-foreground"
            />
            <h3 className="mt-3 font-bold">Accedi per vedere le presenze</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Le statistiche di partecipazione sono visibili a tutti i
              giocatori con account approvato.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href={user ? "/profilo" : "/login"}>
                {user ? "Controlla associazione" : "Accedi"}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {attendance.map((player, index) => (
              <Link
                className="flex min-h-28 flex-col items-center justify-center rounded-xl border bg-card p-3 text-center shadow-xs transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
                href={`/giocatore/${player.id}`}
                key={player.id}
              >
                <AttendanceRing
                  avatarUrl={player.avatar_url}
                  name={`${player.nome} ${player.cognome}`}
                  percentage={player.percentage}
                />
                <strong className="mt-2 max-w-full truncate text-xs">
                  {player.cognome} {player.nome}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  {player.present}/{player.total} allenamenti
                </span>
                {index < 3 && player.total > 0 && (
                  <Medal
                    aria-label={`Posizione ${index + 1}`}
                    className="mt-1 size-3 text-amber-500"
                  />
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
