"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, Shield, Sparkles, UsersRound } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type PublicMember = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  category: "PLAYER" | "STAFF"
  role: string | null
  staff_function: string | null
  jersey_number: number | null
  status: "YES" | "MAYBE"
}

type PublicStats = {
  profile_id: string
  goals: number
  assists: number
  player_of_match: number
}

export function PublicTeam() {
  const [members, setMembers] = useState<PublicMember[]>([])
  const [stats, setStats] = useState<PublicStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void Promise.all([
      supabaseBrowser
        .from("public_active_roster")
        .select("*")
        .order("cognome"),
      supabaseBrowser.from("public_player_statistics").select("*"),
    ]).then(([rosterResult, statsResult]) => {
      if (!active) return
      setMembers((rosterResult.data ?? []) as PublicMember[])
      setStats((statsResult.data ?? []) as PublicStats[])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const statsByProfile = useMemo(
    () => new Map(stats.map((row) => [row.profile_id, row])),
    [stats],
  )
  const players = members.filter(({ category }) => category === "PLAYER")
  const staff = members.filter(({ category }) => category === "STAFF")

  return (
    <section aria-labelledby="team-title" className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Stagione in corso
          </p>
          <h1
            className="text-2xl font-black tracking-tight sm:text-3xl"
            id="team-title"
          >
            Squadra
          </h1>
        </div>
        {!loading && (
          <span className="text-xs font-medium text-muted-foreground">
            {players.length} giocatori · {staff.length} staff
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton className="h-36 rounded-xl" key={index} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {players.map((player) => {
              const playerStats = statsByProfile.get(player.id)
              return (
                <article
                  className="group relative overflow-hidden rounded-xl border bg-card p-3 shadow-xs transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm motion-reduce:transform-none"
                  key={player.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Avatar className="size-12 border-2 border-background shadow-sm ring-1 ring-border">
                      <AvatarImage
                        alt={`${player.nome} ${player.cognome}`}
                        className="object-cover"
                        src={player.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="text-xs font-black">
                        {player.nome[0]}
                        {player.cognome[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="relative flex size-7 items-center justify-center">
                      <Shield
                        aria-hidden="true"
                        className="size-7 fill-primary/10 text-primary/30"
                      />
                      <strong className="absolute text-[10px]">
                        {player.jersey_number ?? "—"}
                      </strong>
                    </span>
                  </div>
                  <h2 className="mt-3 truncate text-sm font-black">
                    {player.cognome}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {player.nome} · {player.role ?? "Ruolo da definire"}
                  </p>
                  <div className="mt-3 flex items-center gap-2 border-t pt-2 text-[11px] tabular-nums text-muted-foreground">
                    <span title="Goal">
                      <strong className="text-foreground">
                        {playerStats?.goals ?? 0}
                      </strong>{" "}
                      G
                    </span>
                    <span title="Assist">
                      <strong className="text-foreground">
                        {playerStats?.assists ?? 0}
                      </strong>{" "}
                      A
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1" title="Player of the match">
                      <Sparkles aria-hidden="true" className="size-3" />
                      <strong className="text-foreground">
                        {playerStats?.player_of_match ?? 0}
                      </strong>
                    </span>
                  </div>
                  {player.status === "MAYBE" && (
                    <Badge
                      className="absolute right-2 top-2 border-amber-200 bg-amber-50 text-amber-800"
                      variant="outline"
                    >
                      Forse
                    </Badge>
                  )}
                </article>
              )
            })}
          </div>

          <div className="space-y-2 border-t pt-5">
            <div className="flex items-center gap-2">
              <UsersRound
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Staff
              </h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {staff.map((member) => (
                <details
                  className="group overflow-hidden rounded-xl border bg-muted/25 open:bg-card"
                  key={member.id}
                >
                  <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <Avatar
                      className={cn(
                        "size-11 shrink-0 rounded-lg border-2 border-primary/20",
                        "[&_[data-slot=avatar-fallback]]:rounded-lg [&_[data-slot=avatar-image]]:rounded-lg",
                      )}
                    >
                      <AvatarImage
                        alt={`${member.nome} ${member.cognome}`}
                        className="object-cover"
                        src={member.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="rounded-lg text-xs font-bold">
                        {member.nome[0]}
                        {member.cognome[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {member.nome} {member.cognome}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.staff_function ?? "Staff"}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                    <span>Staff · stagione in corso</span>
                    {member.status === "MAYBE" && (
                      <Badge variant="outline">Forse</Badge>
                    )}
                  </div>
                </details>
              ))}
              {staff.length === 0 && (
                <p className="col-span-full rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Staff non ancora confermato.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
