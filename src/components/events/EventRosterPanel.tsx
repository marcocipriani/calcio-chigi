"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { CheckCircle2, Save, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { isU35At } from "@/lib/utils"

export type EventRosterEntry = {
  id: string
  nome: string
  cognome: string
  ruolo?: string | null
  avatar_url?: string | null
  data_nascita?: string | null
  is_staff?: boolean
  training_only?: boolean
  status: string | null
  vote_time: string | null
  modified_by: string | null
}

type CheckinStatus = "PRESENT" | "ABSENT"

type MatchStatDraft = {
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
}

const emptyStats: MatchStatDraft = {
  goals: 0,
  assists: 0,
  yellow_cards: 0,
  red_cards: 0,
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

function availabilityTone(status: string | null, isMatch: boolean) {
  if (status === "PRESENTE") {
    return {
      border: "border-l-green-500",
      text: "PRESENTE",
      color: "text-green-600 dark:text-green-400",
    }
  }
  if (status === "ASSENTE") {
    return {
      border: "border-l-red-500 opacity-60",
      text: "ASSENTE",
      color: "text-red-600 dark:text-red-400",
    }
  }
  if (status === "INFORTUNATO_PRESENTE") {
    return isMatch
      ? {
          border: "border-l-slate-500 bg-slate-50 dark:bg-slate-900/50",
          text: "SPETTATORE",
          color: "text-slate-600 dark:text-slate-400",
        }
      : {
          border: "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10",
          text: "PRESENTE (KO)",
          color: "text-yellow-600 dark:text-yellow-400",
        }
  }
  return {
    border: "border-l-slate-300 dark:border-l-slate-600",
    text: "Non ha votato",
    color: "text-muted-foreground",
  }
}

/**
 * Lista unica dell'evento: disponibilità dichiarata dal giocatore e check-in
 * ufficiale del manager sulla stessa riga. Nessuna seconda lista.
 */
export function EventRosterPanel({
  eventDate,
  eventId,
  isManager,
  isMatch,
  managerProfileId,
  namesByProfileId,
  roster,
}: {
  eventDate: Date
  eventId: string
  isManager: boolean
  isMatch: boolean
  managerProfileId: string | null
  namesByProfileId: Record<string, string>
  roster: EventRosterEntry[]
}) {
  const [checkins, setCheckins] = useState<Record<string, CheckinStatus>>({})
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [stats, setStats] = useState<Record<string, MatchStatDraft>>({})
  const [playerOfMatch, setPlayerOfMatch] = useState("")
  const [bulkPresent, setBulkPresent] = useState(false)
  const [saving, setSaving] = useState(false)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    setCheckins({})
    setSelected(new Set())
    setStats({})
    setPlayerOfMatch("")

    void Promise.all([
      supabaseBrowser
        .from("event_checkins")
        .select("profile_id, status")
        .eq("event_id", eventId),
      isMatch && isManager
        ? supabaseBrowser
            .from("match_player_stats")
            .select("profile_id, goals, assists, yellow_cards, red_cards")
            .eq("event_id", eventId)
        : Promise.resolve({ data: [], error: null }),
      isMatch && isManager
        ? supabaseBrowser
            .from("match_awards")
            .select("profile_id")
            .eq("event_id", eventId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]).then(([checkinResult, statsResult, awardResult]) => {
      if (generationRef.current !== generation) return
      if (checkinResult.error) {
        toast.error("Check-in non caricati")
        return
      }
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
            {
              goals: row.goals,
              assists: row.assists,
              yellow_cards: row.yellow_cards,
              red_cards: row.red_cards,
            },
          ]),
        ),
      )
      setPlayerOfMatch(awardResult.data?.profile_id ?? "")
    })
  }, [eventId, isManager, isMatch])

  const checkable = useMemo(
    () =>
      roster.filter(
        (player) =>
          !player.is_staff && !(isMatch && player.training_only),
      ),
    [isMatch, roster],
  )
  const present = useMemo(
    () => checkable.filter(({ id }) => checkins[id] === "PRESENT"),
    [checkable, checkins],
  )
  const available = useMemo(
    () => checkable.filter(({ status }) => status === "PRESENTE"),
    [checkable],
  )

  async function applyCheckin(profileIds: string[], status: CheckinStatus) {
    if (!profileIds.length) return
    const generation = generationRef.current
    const previous = checkins
    setPending((current) => new Set([...current, ...profileIds]))
    setCheckins((current) => ({
      ...current,
      ...Object.fromEntries(profileIds.map((id) => [id, status])),
    }))
    if (status === "ABSENT" && profileIds.includes(playerOfMatch)) {
      setPlayerOfMatch("")
    }

    const results = await Promise.all(
      profileIds.map((profileId) =>
        supabaseBrowser.rpc("set_event_checkin", {
          p_event_id: eventId,
          p_profile_id: profileId,
          p_status: status,
        }),
      ),
    )
    if (generationRef.current !== generation) return

    setPending((current) => {
      const next = new Set(current)
      for (const id of profileIds) next.delete(id)
      return next
    })

    const failed = results.filter(({ error }) => error)
    if (failed.length) {
      setCheckins(previous)
      toast.error("Check-in non salvato", {
        description: failed[0].error?.message,
      })
      return
    }
    toast.success(
      profileIds.length === 1
        ? status === "PRESENT"
          ? "Check-in registrato"
          : "Segnato assente"
        : `${profileIds.length} aggiornati`,
    )
  }

  function toggleSelection(profileId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  function updateStat(
    profileId: string,
    field: keyof MatchStatDraft,
    value: string,
  ) {
    if (saving) return
    setStats((current) => ({
      ...current,
      [profileId]: {
        ...(current[profileId] ?? emptyStats),
        [field]: nonNegativeInteger(value),
      },
    }))
  }

  async function saveStats() {
    if (!managerProfileId || !isMatch || saving || pending.size > 0) return
    const generation = generationRef.current
    setSaving(true)
    try {
      const rows = present.map((player) => ({
        event_id: eventId,
        profile_id: player.id,
        goals: nonNegativeInteger(stats[player.id]?.goals),
        assists: nonNegativeInteger(stats[player.id]?.assists),
        yellow_cards: nonNegativeInteger(stats[player.id]?.yellow_cards),
        red_cards: nonNegativeInteger(stats[player.id]?.red_cards),
        updated_by: managerProfileId,
      }))
      const { error: statsError } = rows.length
        ? await supabaseBrowser
            .from("match_player_stats")
            .upsert(rows, { onConflict: "event_id,profile_id" })
        : { error: null }
      if (generationRef.current !== generation) return
      if (statsError) {
        toast.error("Statistiche non salvate", {
          description: statsError.message,
        })
        return
      }

      const { error: awardError } = playerOfMatch
        ? await supabaseBrowser.from("match_awards").upsert(
            {
              event_id: eventId,
              profile_id: playerOfMatch,
              updated_by: managerProfileId,
            },
            { onConflict: "event_id" },
          )
        : await supabaseBrowser
            .from("match_awards")
            .delete()
            .eq("event_id", eventId)
      if (generationRef.current !== generation) return
      if (awardError) {
        toast.error("Statistiche non salvate", {
          description: awardError.message,
        })
        return
      }
      toast.success("Statistiche salvate")
    } finally {
      if (generationRef.current === generation) setSaving(false)
    }
  }

  const selectedIds = checkable
    .filter(({ id }) => selected.has(id))
    .map(({ id }) => id)

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 border-b pb-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-lg">Rosa e check-in</h3>
          <span className="text-xs text-muted-foreground">
            {present.length} check-in
          </span>
        </div>

        {isManager && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 p-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              <Switch
                aria-label="Check-in dei selezionati"
                checked={bulkPresent}
                disabled={!selectedIds.length || pending.size > 0}
                onCheckedChange={(next) => {
                  setBulkPresent(next)
                  void applyCheckin(selectedIds, next ? "PRESENT" : "ABSENT")
                }}
              />
              {bulkPresent ? "Presenti" : "Assenti"}
            </label>
            <span className="text-[11px] text-muted-foreground">
              {selectedIds.length} selezionati
            </span>
            <div className="ml-auto flex gap-3 text-[11px] font-semibold">
              <button
                className="underline-offset-4 hover:underline"
                onClick={() =>
                  setSelected(new Set(available.map(({ id }) => id)))
                }
                type="button"
              >
                Seleziona disponibili
              </button>
              <button
                className="underline-offset-4 hover:underline"
                onClick={() =>
                  setSelected(new Set(checkable.map(({ id }) => id)))
                }
                type="button"
              >
                Tutti
              </button>
              {selectedIds.length > 0 && (
                <button
                  className="underline-offset-4 hover:underline"
                  onClick={() => setSelected(new Set())}
                  type="button"
                >
                  Deseleziona
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {roster.map((player) => {
          const tone = availabilityTone(player.status, isMatch)
          const checkin = checkins[player.id]
          const canCheckin =
            !player.is_staff && !(isMatch && player.training_only)
          const voteTime = player.vote_time
            ? format(new Date(player.vote_time), "dd/MM HH:mm")
            : ""
          const managerEdit =
            player.modified_by && player.modified_by !== player.id
          const managerName = managerEdit
            ? namesByProfileId[player.modified_by ?? ""]?.split(" ")[0]
            : null

          return (
            <div
              className={`rounded-lg border border-slate-100 bg-card shadow-sm transition-[border-color,background-color,opacity] duration-300 dark:border-slate-800 border-l-4 ${tone.border}`}
              key={player.id}
            >
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="flex min-w-0 items-center gap-3">
                  {isManager && canCheckin && (
                    <input
                      aria-label={`Seleziona ${player.nome} ${player.cognome}`}
                      checked={selected.has(player.id)}
                      className="size-4 shrink-0 accent-violet-600"
                      onChange={() => toggleSelection(player.id)}
                      type="checkbox"
                    />
                  )}
                  <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                    <AvatarImage
                      alt={`${player.nome} ${player.cognome}`}
                      src={player.avatar_url ?? undefined}
                    />
                    <AvatarFallback>
                      {player.nome[0]}
                      {player.cognome[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="flex items-center gap-1 truncate text-sm font-bold leading-none">
                        {player.cognome} {player.nome}
                        {player.is_staff && (
                          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                        )}
                      </p>
                      {isU35At(player.data_nascita, eventDate) && (
                        <Badge className="h-4 border-0 bg-blue-100 px-1 text-[8px] text-blue-700 hover:bg-blue-100">
                          U35
                        </Badge>
                      )}
                      {player.ruolo === "PORTIERE" && (
                        <Badge className="h-4 border-0 bg-yellow-100 px-1 text-[8px] text-yellow-700 hover:bg-yellow-100">
                          POR
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="rounded bg-slate-100 px-1 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                        {player.ruolo?.substring(0, 3)}
                      </p>
                      <p className={`text-[10px] font-bold ${tone.color}`}>
                        {tone.text}
                      </p>
                      {voteTime && (
                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                          {managerEdit
                            ? `(Modificato da ${managerName} ${voteTime})`
                            : `(Votato ${voteTime})`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isManager && canCheckin ? (
                  <label className="flex shrink-0 flex-col items-center gap-1">
                    <Switch
                      aria-label={`Check-in ${player.nome} ${player.cognome}`}
                      checked={checkin === "PRESENT"}
                      disabled={pending.has(player.id)}
                      onCheckedChange={(next) =>
                        void applyCheckin(
                          [player.id],
                          next ? "PRESENT" : "ABSENT",
                        )
                      }
                    />
                    <span className="text-[9px] font-bold uppercase text-muted-foreground">
                      {checkin === "PRESENT"
                        ? "Presente"
                        : checkin === "ABSENT"
                          ? "Assente"
                          : "Da fare"}
                    </span>
                  </label>
                ) : (
                  checkin === "PRESENT" && (
                    <CheckCircle2
                      aria-label="Check-in registrato"
                      className="h-5 w-5 shrink-0 text-green-500"
                    />
                  )
                )}
              </div>

              {isManager && isMatch && checkin === "PRESENT" && (
                <div className="grid grid-cols-4 gap-1 border-t px-2 py-1.5">
                  {(
                    [
                      ["goals", "Goal", "Goal"],
                      ["assists", "Assist", "Assist"],
                      ["yellow_cards", "Amm.", "Ammonizioni"],
                      ["red_cards", "Esp.", "Espulsioni"],
                    ] as Array<[keyof MatchStatDraft, string, string]>
                  ).map(([field, label, ariaLabel]) => (
                    <label
                      className="flex items-center gap-1 text-[10px]"
                      key={field}
                    >
                      {label}
                      <Input
                        aria-label={`${ariaLabel} di ${player.nome} ${player.cognome}`}
                        className="h-8 w-12 px-1 text-center"
                        disabled={saving}
                        min="0"
                        onChange={(event) =>
                          updateStat(player.id, field, event.target.value)
                        }
                        step="1"
                        type="number"
                        value={stats[player.id]?.[field] ?? 0}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {roster.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nessun giocatore in rosa.
          </p>
        )}
      </div>

      {isManager && isMatch && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border p-2">
          <label className="text-xs font-semibold" htmlFor="player-of-match">
            MVP
          </label>
          <select
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
            disabled={saving || pending.size > 0}
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
          <Button
            disabled={saving || pending.size > 0}
            onClick={saveStats}
            size="sm"
          >
            <Save aria-hidden="true" />
            Salva statistiche
          </Button>
        </div>
      )}
    </div>
  )
}
