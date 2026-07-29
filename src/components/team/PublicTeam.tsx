"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, UsersRound } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PlayerRosterCard } from "@/components/team/PlayerRosterCard"
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

export function PublicTeam({
  canViewProfiles = false,
}: {
  canViewProfiles?: boolean
}) {
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
    <section className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton className="h-36 rounded-xl" key={index} />
          ))}
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
            data-player-grid
          >
            {players.map((player) => {
              const playerStats = statsByProfile.get(player.id)
              return (
                <PlayerRosterCard
                  canViewProfile={canViewProfiles}
                  key={player.id}
                  player={player}
                  stats={playerStats}
                />
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
