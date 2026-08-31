"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BarChart3, LockKeyhole, Medal, Target } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { AttendanceRing } from "@/components/stats/AttendanceRing"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchPlayerStatisticsByPhase,
  fetchSeasonPlayerDirectory,
} from "@/lib/api"
import {
  aggregateSeasonStats,
  phaseOptionsForSeason,
  SEASON_OPTIONS,
  type PhaseFilter,
  type PlayerSeasonStat,
  medalPercentages,
  type SeasonPlayerDirectoryEntry,
} from "@/lib/season-statistics"
import { fetchSeasonAttendance } from "@/lib/management-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type SeasonSlug = (typeof SEASON_OPTIONS)[number]["slug"]
type SeasonIds = Record<SeasonSlug, string>

type RankedPlayer = SeasonPlayerDirectoryEntry &
  ReturnType<typeof aggregateSeasonStats>

type AttendanceStat = SeasonPlayerDirectoryEntry & {
  present: number
  total: number
  percentage: number
}

type RankingKey =
  | "goals"
  | "assists"
  | "mvp"
  | "yellow_cards"
  | "red_cards"

const RANKINGS: readonly { key: RankingKey; label: string }[] = [
  { key: "goals", label: "Goal" },
  { key: "assists", label: "Assist" },
  { key: "mvp", label: "MVP" },
  { key: "yellow_cards", label: "Ammonizioni" },
  { key: "red_cards", label: "Espulsioni" },
]

function editionLabel(slug: SeasonSlug) {
  return `${slug.slice(0, 4)}/${slug.slice(-2)}`
}

function playerName(player: SeasonPlayerDirectoryEntry) {
  return `${player.nome} ${player.cognome}`
}

function compareItalianNames(
  left: SeasonPlayerDirectoryEntry,
  right: SeasonPlayerDirectoryEntry,
) {
  return (
    left.cognome.localeCompare(right.cognome, "it") ||
    left.nome.localeCompare(right.nome, "it") ||
    left.profile_id.localeCompare(right.profile_id)
  )
}

function PlayerIdentity({
  player,
  canLink,
  seasonSlug,
}: {
  player: SeasonPlayerDirectoryEntry
  canLink: boolean
  seasonSlug: SeasonSlug
}) {
  const content = (
    <>
      <Avatar className="size-6 shrink-0">
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
      <span className="min-w-0 truncate">{playerName(player)}</span>
    </>
  )

  return canLink ? (
    <Link
      className="flex min-w-0 items-center gap-2 rounded-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={`/giocatore/${player.profile_id}?season=${seasonSlug}`}
    >
      {content}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2 font-semibold">
      {content}
    </span>
  )
}

function RankingCard({
  canLink,
  label,
  metric,
  players,
  seasonSlug,
}: {
  canLink: boolean
  label: string
  metric: RankingKey
  players: readonly RankedPlayer[]
  seasonSlug: SeasonSlug
}) {
  const ranked = [...players].sort((left, right) => {
    const leftValue = left[metric] ?? -1
    const rightValue = right[metric] ?? -1
    return rightValue - leftValue || compareItalianNames(left, right)
  })
  const headingId = `ranking-${metric}`

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <h3
        className="border-b bg-muted/50 px-3 py-2 text-xs font-black uppercase tracking-wide"
        id={headingId}
      >
        {label}
      </h3>
      <ol className="max-h-72 divide-y overflow-y-auto" tabIndex={0}>
        {ranked.map((player, index) => (
          <li
            className="grid grid-cols-[24px_minmax(0,1fr)_36px] items-center gap-2 px-3 py-2 text-xs"
            key={player.profile_id}
          >
            <span className="font-bold tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <PlayerIdentity
              canLink={canLink}
              player={player}
              seasonSlug={seasonSlug}
            />
            <strong className="text-right text-sm tabular-nums">
              {player[metric] ?? "—"}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function StatisticsPage() {
  const { isAssociated, loading: sessionLoading, user } = useAppSession()
  const [selectedSeasonSlug, setSelectedSeasonSlug] =
    useState<SeasonSlug>("2026-2027")
  const [phase, setPhase] = useState<PhaseFilter>("ALL")
  const [seasonIds, setSeasonIds] = useState<SeasonIds | null>(null)
  const [players, setPlayers] = useState<SeasonPlayerDirectoryEntry[]>([])
  const [stats, setStats] = useState<PlayerSeasonStat[]>([])
  const [allStats, setAllStats] = useState<PlayerSeasonStat[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<AttendanceStat[]>([])
  const [attendanceState, setAttendanceState] = useState<
    "idle" | "loading" | "error"
  >("idle")

  const medalRates = useMemo(
    () => medalPercentages(attendance),
    [attendance],
  )

  const selectedSeason = SEASON_OPTIONS.find(
    ({ slug }) => slug === selectedSeasonSlug,
  )!
  const selectedSeasonId = seasonIds?.[selectedSeasonSlug]
  const shortEdition = editionLabel(selectedSeasonSlug)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error: seasonsError } = await supabaseBrowser
        .from("seasons")
        .select("id, slug")
        .in(
          "slug",
          SEASON_OPTIONS.map(({ slug }) => slug),
        )
      if (!active) return

      const rows = (data ?? []) as Array<{ id: string; slug: string }>
      const resolved = new Map(rows.map(({ id, slug }) => [slug, id]))
      if (
        seasonsError ||
        rows.length !== SEASON_OPTIONS.length ||
        SEASON_OPTIONS.some(({ slug }) => !resolved.has(slug))
      ) {
        setSeasonIds(null)
        setPlayers([])
        setStats([])
        setAllStats([])
        setDirectoryLoading(false)
        setStatsLoading(false)
        setError(
          `Impossibile caricare le statistiche ${editionLabel("2026-2027")}.`,
        )
        return
      }

      setSeasonIds(
        Object.fromEntries(resolved) as SeasonIds,
      )
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedSeasonId) return
    let active = true
    setDirectoryLoading(true)
    setStatsLoading(true)
    setError(null)
    setPlayers([])
    setStats([])
    setAllStats([])

    void Promise.all([
      fetchSeasonPlayerDirectory(supabaseBrowser, selectedSeasonId),
      fetchPlayerStatisticsByPhase(supabaseBrowser, selectedSeasonId, "ALL"),
    ])
      .then(([directory, statistics]) => {
        if (!active) return
        setPlayers(directory)
        setStats(statistics)
        setAllStats(statistics)
        setDirectoryLoading(false)
        setStatsLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPlayers([])
        setStats([])
        setAllStats([])
        setDirectoryLoading(false)
        setStatsLoading(false)
        setError(
          `Impossibile caricare le statistiche ${shortEdition}.`,
        )
      })

    return () => {
      active = false
    }
  }, [selectedSeasonId, shortEdition])

  useEffect(() => {
    if (phase === "ALL" || !selectedSeasonId) return
    let active = true
    setStatsLoading(true)
    setError(null)
    setStats([])

    void fetchPlayerStatisticsByPhase(
      supabaseBrowser,
      selectedSeasonId,
      phase,
    )
      .then((statistics) => {
        if (!active) return
        setStats(statistics)
        setStatsLoading(false)
      })
      .catch(() => {
        if (!active) return
        setStats([])
        setStatsLoading(false)
        setError(
          `Impossibile caricare le statistiche ${shortEdition}.`,
        )
      })

    return () => {
      active = false
    }
  }, [phase, selectedSeasonId, shortEdition])

  const phaseOptions = useMemo(
    () =>
      selectedSeasonId
        ? phaseOptionsForSeason(selectedSeasonId, allStats)
        : [{ value: "ALL" as const, label: "Tutte le fasi" }],
    [allStats, selectedSeasonId],
  )

  const rankedPlayers = useMemo(() => {
    const rowsByPlayer = new Map<string, PlayerSeasonStat[]>()
    for (const row of stats) {
      const rows = rowsByPlayer.get(row.profile_id) ?? []
      rows.push(row)
      rowsByPlayer.set(row.profile_id, rows)
    }

    return players.map((player): RankedPlayer => {
      const rows = rowsByPlayer.get(player.profile_id) ?? []
      const totals = aggregateSeasonStats(rows)
      return {
        ...player,
        ...totals,
        assists:
          rows.length === 0 && !selectedSeason.attendanceAvailable
            ? null
            : totals.assists,
      }
    })
  }, [players, selectedSeason.attendanceAvailable, stats])

  useEffect(() => {
    let active = true
    setAttendance([])

    if (!selectedSeason.attendanceAvailable) {
      setAttendanceState("idle")
      return () => {
        active = false
      }
    }
    if (
      sessionLoading ||
      !isAssociated ||
      !selectedSeasonId ||
      directoryLoading
    ) {
      setAttendanceState(
        sessionLoading || directoryLoading ? "loading" : "idle",
      )
      return () => {
        active = false
      }
    }

    setAttendanceState("loading")
    void (async () => {
      try {
        const { data: joinDates, error: joinDatesError } = await supabaseBrowser
          .from("authenticated_season_join_dates")
          .select("profile_id, joined_on")
          .eq("season_id", selectedSeasonId)
        if (joinDatesError) throw joinDatesError
        if (!active) return

        const joinedByPlayer = new Map(
          (joinDates ?? []).map((row) => [
            row.profile_id as string,
            (row.joined_on as string | null) ?? null,
          ]),
        )
        const summaries = await fetchSeasonAttendance(
          supabaseBrowser,
          selectedSeasonId,
          players.map(({ profile_id }) => ({
            profileId: profile_id,
            joinedOn: joinedByPlayer.get(profile_id) ?? null,
          })),
        )
        if (!active) return

        setAttendance(
          players
            .map((player) => {
              const training = summaries.get(player.profile_id)?.training
              return {
                ...player,
                present: training?.present ?? 0,
                total: training?.total ?? 0,
                percentage: training?.percentage ?? 0,
              }
            })
            .sort(
              (left, right) =>
                right.percentage - left.percentage ||
                compareItalianNames(left, right),
            ),
        )
        setAttendanceState("idle")
      } catch {
        if (!active) return
        setAttendance([])
        setAttendanceState("error")
      }
    })()

    return () => {
      active = false
    }
  }, [
    directoryLoading,
    isAssociated,
    players,
    selectedSeason.attendanceAvailable,
    selectedSeasonId,
    sessionLoading,
  ])

  const filters = (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 text-[10px] font-bold uppercase tracking-wider sm:w-64">
        Stagione
        <select
          aria-label="Stagione"
          className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => {
            setSelectedSeasonSlug(event.target.value as SeasonSlug)
            setPhase("ALL")
            setPlayers([])
            setStats([])
            setAllStats([])
            setAttendance([])
            setDirectoryLoading(true)
            setStatsLoading(true)
          }}
          value={selectedSeasonSlug}
        >
          {SEASON_OPTIONS.map(({ slug }) => (
            <option key={slug} value={slug}>
              {editionLabel(slug)}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 text-[10px] font-bold uppercase tracking-wider sm:w-56">
        Fase
        <select
          aria-label="Fase"
          className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => {
            const nextPhase = event.target.value as PhaseFilter
            setPhase(nextPhase)
            if (nextPhase === "ALL") {
              setStats(allStats)
              setStatsLoading(false)
              setError(null)
            }
          }}
          value={phase}
        >
          {phaseOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  const canViewPlayerLinks = isAssociated && !sessionLoading

  return (
    <PageContainer contentClassName="mx-auto max-w-7xl space-y-6 pb-24">
      <PageTitleBar
        filters={filters}
        subtitle="Numeri ufficiali per stagione e fase"
        title="Statistiche"
      />

      {error ? (
        <p className="rounded-xl border border-destructive/30 p-6 text-center" role="alert">
          {error}
        </p>
      ) : (
        <div
          className="grid gap-6 lg:grid-cols-2"
          data-statistics-layout
        >
          <section
            aria-labelledby="tournament-stats-title"
            className="min-w-0 space-y-3"
          >
            <div className="flex items-center gap-2">
              <BarChart3 aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold" id="tournament-stats-title">
                Torneo
              </h2>
            </div>

            {directoryLoading || statsLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton className="h-28 rounded-xl" key={index} />
                ))}
              </div>
            ) : rankedPlayers.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                Nessun dato disponibile per l&apos;edizione {shortEdition}.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {RANKINGS.map(({ key, label }) => (
                  <RankingCard
                    canLink={canViewPlayerLinks}
                    key={key}
                    label={label}
                    metric={key}
                    players={rankedPlayers}
                    seasonSlug={selectedSeasonSlug}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            aria-labelledby="training-stats-title"
            className="min-w-0 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Target aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold" id="training-stats-title">
                Presenze allenamenti
              </h2>
            </div>

            {!selectedSeason.attendanceAvailable ? (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center font-semibold text-muted-foreground">
                Dati non disponibili
              </p>
            ) : sessionLoading || attendanceState === "loading" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton className="h-28 rounded-xl" key={index} />
                ))}
              </div>
            ) : !isAssociated ? (
              <div className="rounded-xl border border-dashed bg-card p-6 text-center">
                <LockKeyhole
                  aria-hidden="true"
                  className="mx-auto size-6 text-muted-foreground"
                />
                <h3 className="mt-3 font-bold">
                  Accedi per vedere le presenze
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Disponibili solo agli account associati e approvati.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link href={user ? "/profilo" : "/login"}>
                    {user ? "Controlla associazione" : "Accedi"}
                  </Link>
                </Button>
              </div>
            ) : attendanceState === "error" ? (
              <p className="rounded-xl border border-destructive/30 p-6 text-center" role="alert">
                Impossibile caricare le presenze.
              </p>
            ) : attendance.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                Nessun giocatore disponibile per questa stagione.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {attendance.map((player) => {
                  const medalRank =
                    player.present > 0
                      ? medalRates.indexOf(player.percentage)
                      : -1
                  return (
                    <Link
                      aria-label={`Presenze di ${playerName(player)}`}
                      className="flex min-h-28 flex-col items-center justify-center rounded-xl border bg-card p-3 text-center shadow-xs transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
                      href={`/giocatore/${player.profile_id}?season=${selectedSeasonSlug}`}
                      key={player.profile_id}
                    >
                      <AttendanceRing
                        avatarUrl={player.avatar_url}
                        name={playerName(player)}
                        percentage={player.percentage}
                      />
                      <strong className="mt-2 max-w-full truncate text-xs">
                        {playerName(player)}
                      </strong>
                      <span className="text-[10px] text-muted-foreground">
                        {player.present}/{player.total} allenamenti
                      </span>
                      {medalRank >= 0 && (
                        <Medal
                          aria-label={`Posizione ${medalRank + 1}`}
                          className="mt-1 size-3 text-amber-500"
                        />
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  )
}
