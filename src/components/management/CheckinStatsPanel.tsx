"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ClipboardCheck, Save, X } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type RosterRow = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  role: string | null
}

type CheckinStatus = "PRESENT" | "ABSENT"

type EventRosterRow = {
  profile_id: string
  nome: string
  cognome: string
  avatar_url: string | null
  role: string | null
  category: "PLAYER" | "STAFF"
  training_only: boolean
}

export function CheckinStatsPanel({
  eventId,
  isMatch,
}: {
  eventId: string
  isMatch: boolean
}) {
  const { isManager, profile } = useAppSession()
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [checkins, setCheckins] = useState<Record<string, CheckinStatus>>({})
  const [stats, setStats] = useState<
    Record<string, { goals: number; assists: number }>
  >({})
  const [playerOfMatch, setPlayerOfMatch] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isManager) return
    let active = true
    void Promise.all([
      supabaseBrowser.rpc("get_event_roster", {
        p_event_id: eventId,
      }),
      supabaseBrowser
        .from("event_checkins")
        .select("profile_id, status")
        .eq("event_id", eventId),
      isMatch
        ? supabaseBrowser
            .from("match_player_stats")
            .select("profile_id, goals, assists")
            .eq("event_id", eventId)
        : Promise.resolve({ data: [] }),
      isMatch
        ? supabaseBrowser
            .from("match_awards")
            .select("profile_id")
            .eq("event_id", eventId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([rosterResult, checkinResult, statsResult, awardResult]) => {
      if (!active) return
      const eventRoster = (rosterResult.data ?? []) as EventRosterRow[]
      setRoster(
        eventRoster
          .filter(({ category, training_only }) =>
            category === "PLAYER" && !training_only,
          )
          .map((row): RosterRow => ({
            id: row.profile_id,
            nome: row.nome,
            cognome: row.cognome,
            avatar_url: row.avatar_url,
            role: row.role,
          })),
      )
      setCheckins(
        Object.fromEntries(
          (checkinResult.data ?? []).map((row) => [
            row.profile_id,
            row.status as CheckinStatus,
          ]),
        ),
      )
      setStats(
        Object.fromEntries(
          (statsResult.data ?? []).map((row) => [
            row.profile_id,
            { goals: row.goals, assists: row.assists },
          ]),
        ),
      )
      setPlayerOfMatch(awardResult.data?.profile_id ?? "")
    })
    return () => {
      active = false
    }
  }, [eventId, isManager, isMatch])

  const present = useMemo(
    () => roster.filter(({ id }) => checkins[id] === "PRESENT"),
    [checkins, roster],
  )

  if (!isManager) return null

  async function setCheckin(profileId: string, status: CheckinStatus) {
    const previous = checkins[profileId]
    setCheckins((current) => ({ ...current, [profileId]: status }))
    const { error } = await supabaseBrowser.rpc("set_event_checkin", {
      p_event_id: eventId,
      p_profile_id: profileId,
      p_status: status,
    })
    if (error) {
      setCheckins((current) => {
        const next = { ...current }
        if (previous) next[profileId] = previous
        else delete next[profileId]
        return next
      })
      toast.error("Check-in non salvato", { description: error.message })
    }
  }

  async function saveStats() {
    if (!profile || !isMatch) return
    setSaving(true)
    const statsRows = present.map((player) => ({
      event_id: eventId,
      profile_id: player.id,
      goals: stats[player.id]?.goals ?? 0,
      assists: stats[player.id]?.assists ?? 0,
      updated_by: profile.id,
    }))
    const { error: statsError } = statsRows.length
      ? await supabaseBrowser
          .from("match_player_stats")
          .upsert(statsRows, { onConflict: "event_id,profile_id" })
      : { error: null }

    let awardError = null
    if (playerOfMatch) {
      const result = await supabaseBrowser.from("match_awards").upsert(
        {
          event_id: eventId,
          profile_id: playerOfMatch,
          updated_by: profile.id,
        },
        { onConflict: "event_id" },
      )
      awardError = result.error
    } else {
      const result = await supabaseBrowser
        .from("match_awards")
        .delete()
        .eq("event_id", eventId)
      awardError = result.error
    }
    setSaving(false)

    if (statsError || awardError) {
      toast.error("Statistiche non salvate", {
        description: statsError?.message ?? awardError?.message,
      })
      return
    }
    toast.success("Check-in e statistiche salvati")
  }

  return (
    <section className="overflow-hidden rounded-xl border border-violet-200 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/15">
      <div className="flex items-center justify-between border-b border-violet-200 p-3 dark:border-violet-900">
        <div className="flex items-center gap-2">
          <ClipboardCheck
            aria-hidden="true"
            className="size-4 text-violet-700 dark:text-violet-300"
          />
          <div>
            <h3 className="text-sm font-bold">Check-in ufficiale</h3>
            <p className="text-[11px] text-muted-foreground">
              {present.length} presenti · il check-in conferma anche la
              disponibilità
            </p>
          </div>
        </div>
        {isMatch && (
          <Button disabled={saving} onClick={saveStats} size="sm">
            <Save aria-hidden="true" />
            Salva statistiche
          </Button>
        )}
      </div>
      <div className="max-h-96 divide-y overflow-y-auto">
        {roster.map((player) => {
          const status = checkins[player.id]
          const isPresent = status === "PRESENT"
          return (
            <div
              className="grid min-h-12 grid-cols-[1fr_auto] items-center gap-2 px-3 py-1.5 sm:grid-cols-[minmax(180px,1fr)_auto_140px]"
              key={player.id}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="size-7 shrink-0">
                  <AvatarImage
                    alt=""
                    className="object-cover"
                    src={player.avatar_url ?? undefined}
                  />
                  <AvatarFallback className="text-[8px]">
                    {player.nome[0]}
                    {player.cognome[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs font-semibold">
                  {player.cognome} {player.nome}
                </span>
                {player.role === "PORTIERE" && (
                  <Badge className="text-[8px]" variant="outline">
                    POR
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  aria-label={`Segna presente ${player.nome} ${player.cognome}`}
                  className={cn(
                    "size-8",
                    isPresent && "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                  onClick={() => setCheckin(player.id, "PRESENT")}
                  size="icon-sm"
                  variant={isPresent ? "default" : "outline"}
                >
                  <Check aria-hidden="true" />
                </Button>
                <Button
                  aria-label={`Segna assente ${player.nome} ${player.cognome}`}
                  className={cn(
                    "size-8",
                    status === "ABSENT" &&
                      "bg-rose-600 text-white hover:bg-rose-700",
                  )}
                  onClick={() => setCheckin(player.id, "ABSENT")}
                  size="icon-sm"
                  variant={status === "ABSENT" ? "default" : "outline"}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              {isMatch && isPresent && (
                <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                  <label className="flex items-center gap-1 text-[10px]">
                    G
                    <Input
                      aria-label={`Goal di ${player.nome} ${player.cognome}`}
                      className="h-8 w-12 px-1 text-center"
                      min="0"
                      onChange={(event) =>
                        setStats((current) => ({
                          ...current,
                          [player.id]: {
                            goals: Number(event.target.value),
                            assists: current[player.id]?.assists ?? 0,
                          },
                        }))
                      }
                      type="number"
                      value={stats[player.id]?.goals ?? 0}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px]">
                    A
                    <Input
                      aria-label={`Assist di ${player.nome} ${player.cognome}`}
                      className="h-8 w-12 px-1 text-center"
                      min="0"
                      onChange={(event) =>
                        setStats((current) => ({
                          ...current,
                          [player.id]: {
                            goals: current[player.id]?.goals ?? 0,
                            assists: Number(event.target.value),
                          },
                        }))
                      }
                      type="number"
                      value={stats[player.id]?.assists ?? 0}
                    />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {isMatch && (
        <div className="flex items-center gap-2 border-t border-violet-200 p-3 dark:border-violet-900">
          <label className="text-xs font-semibold" htmlFor="player-of-match">
            Player of the match
          </label>
          <select
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
            id="player-of-match"
            onChange={(event) => setPlayerOfMatch(event.target.value)}
            value={playerOfMatch}
          >
            <option value="">Non assegnato</option>
            {present.map((player) => (
              <option key={player.id} value={player.id}>
                {player.cognome} {player.nome}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  )
}
