"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CloudOff, MoreHorizontal, Undo2, X } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchAttendanceForEvent, fetchEventById, fetchRosterForEvent } from "@/lib/api"
import { disciplineByPlayer, type DisciplineStatus } from "@/lib/discipline"
import { u35Quota, U35_FIELD_MAX } from "@/lib/formations"
import {
  buildMatchReport,
  buildSummary,
  eventMoment,
  fieldState,
  minuteLabel,
  scoreOf,
  substitutionLimit,
  substitutionsInPeriod,
  type MatchLineup,
  type MatchSummary,
  type TimelineEntry,
} from "@/lib/match"
import {
  advancePeriod,
  finishMatch,
  matchErrorMessage,
  startMatch,
  takeControl,
  updateClock,
  voidEntry,
  type RecordAction,
} from "@/lib/match-api"
import { dropQueued, enqueue, flushQueue, readQueue } from "@/lib/match-queue"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import type { Event } from "@/lib/types"
import { isU35At } from "@/lib/utils"

import { LiveScore, MatchChronicle } from "./LiveMatchBlock"
import { MatchBench } from "./MatchBench"
import { MatchClock } from "./MatchClock"
import { TIMELINE_LABEL } from "./MatchIcons"
import { MatchPitch } from "./MatchPitch"
import type { AvatarBadges } from "./MatchPlayerAvatar"
import { MatchSetup } from "./MatchSetup"
import { MatchSummaryDialog } from "./MatchSummaryDialog"
import { PlayerActionDialog } from "./PlayerActionDialog"
import { toMatchPlayer, type MatchPlayer } from "./players"
import { useLiveMatch, useNow } from "./useLiveMatch"

type FormationRow = {
  profile_id: string | null
  is_starter: boolean
  position_key: string | null
  sort_order: number
  player_snapshot: { nome?: string; cognome?: string; avatar_url?: string | null; role?: string | null; birth_date?: string | null }
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16),
  )

function opponentOf(event: Event) {
  if (event.avversario) return event.avversario
  return event.squadra_casa?.toLowerCase().includes("chigi") ? event.squadra_ospite ?? "Avversario" : event.squadra_casa ?? "Avversario"
}

function queuedEntry(action: RecordAction, players: Map<string, MatchPlayer>): TimelineEntry {
  const name = (id: string | null) => (id ? players.get(id)?.cognome ?? null : null)
  return {
    ...action,
    playerName: name(action.profileId),
    assistName: name(action.assistProfileId),
    subInName: name(action.subInProfileId),
  }
}

/** Schermata a tutto schermo del segnapunti: campo, panchina, timer. */
export function MatchMode({ eventId }: { eventId: string }) {
  const { isManager, profile, loading: sessionLoading } = useAppSession()
  const myProfileId = profile?.id ?? null
  const [event, setEvent] = useState<Event | null>(null)
  const [players, setPlayers] = useState<Map<string, MatchPlayer>>(new Map())
  const [formation, setFormation] = useState<MatchLineup | null>(null)
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set())
  const [discipline, setDiscipline] = useState<Map<string, DisciplineStatus>>(new Map())
  const [loadError, setLoadError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [queueVersion, setQueueVersion] = useState(0)
  const [voidedLocally, setVoidedLocally] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<{ positionKey: string; profileId: string } | null>(null)
  const [benchPick, setBenchPick] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<"END_FIRST_HALF" | "TAKE_CONTROL" | null>(null)
  const [summary, setSummary] = useState<MatchSummary | null>(null)
  const [chronicleOpen, setChronicleOpen] = useState(false)

  const live = useLiveMatch(eventId)
  const session = live.session
  const isOperator = Boolean(session && myProfileId && session.operatorProfileId === myProfileId)
  const now = useNow(1000, Boolean(session && session.status !== "FINISHED"))

  // ─── Dati di partenza ────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionLoading || !isManager) return
    let active = true
    Promise.all([
      fetchEventById(supabaseBrowser, eventId),
      fetchRosterForEvent(supabaseBrowser, eventId),
      fetchAttendanceForEvent(supabaseBrowser, eventId),
      supabaseBrowser
        .from("official_formations")
        .select("formation_module, official_formation_players(profile_id, is_starter, position_key, sort_order, player_snapshot)")
        .eq("event_id", eventId)
        .eq("status", "PUBLISHED")
        .maybeSingle(),
    ])
      .then(([loadedEvent, roster, attendance, formationResult]) => {
        if (!active) return
        setEvent(loadedEvent)
        const isLeague = loadedEvent?.tipo === "PARTITA"
        const map = new Map(
          roster
            .filter((person) => !person.is_staff && !(isLeague && person.training_only))
            .map((person) => [person.id, toMatchPlayer(person)]),
        )
        const rows = ((formationResult.data?.official_formation_players ?? []) as FormationRow[]).filter(
          (row): row is FormationRow & { profile_id: string } => Boolean(row.profile_id),
        )
        // Chi è in formazione ma non più in rosa resta riconoscibile dallo snapshot.
        for (const row of rows) {
          if (!map.has(row.profile_id!)) {
            map.set(row.profile_id!, {
              id: row.profile_id!,
              nome: row.player_snapshot.nome ?? "",
              cognome: row.player_snapshot.cognome ?? "?",
              avatarUrl: row.player_snapshot.avatar_url ?? null,
              role: row.player_snapshot.role ?? null,
              birthDate: row.player_snapshot.birth_date ?? null,
              trainingOnly: false,
            })
          }
        }
        setPlayers(map)
        setFormation(
          rows.length > 0
            ? {
                module: formationResult.data?.formation_module ?? "4-4-2",
                starters: rows
                  .filter((row) => row.is_starter && row.position_key)
                  .map((row) => ({ profileId: row.profile_id!, positionKey: row.position_key! })),
                bench: rows
                  .filter((row) => !row.is_starter)
                  .sort((left, right) => left.sort_order - right.sort_order)
                  .map((row) => row.profile_id!),
              }
            : null,
        )
        setPresentIds(new Set(attendance.filter(({ status }) => status === "PRESENTE").map(({ profile_id }) => profile_id)))
        setLoaded(true)
        if (loadedEvent?.tipo === "PARTITA" && loadedEvent.season_id && loadedEvent.data_ora) {
          void loadDiscipline(loadedEvent.season_id, loadedEvent.data_ora).then((value) => {
            if (active) setDiscipline(value)
          })
        }
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [eventId, isManager, sessionLoading])

  // ─── Cronaca: server + tocchi ancora in coda ─────────────────────────────
  const timeline = useMemo(() => {
    void queueVersion
    const serverIds = new Set(live.timeline.map(({ id }) => id))
    const pending = readQueue(eventId)
      .filter(({ id }) => !serverIds.has(id))
      .map((action) => queuedEntry(action, players))
    return [...live.timeline, ...pending]
      .filter(({ id }) => !voidedLocally.has(id))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
  }, [eventId, live.timeline, players, queueVersion, voidedLocally])
  const pendingCount = useMemo(() => {
    void queueVersion
    return readQueue(eventId).length
  }, [eventId, queueVersion])

  const state = useMemo(() => (session ? fieldState(session.lineup, timeline) : null), [session, timeline])
  const score = scoreOf(timeline)
  const opponent = event ? opponentOf(event) : "Avversario"
  const eventDate = event?.data_ora ?? null
  const matchDate = useMemo(() => (eventDate ? new Date(eventDate) : new Date()), [eventDate])

  // ─── Invio della coda ────────────────────────────────────────────────────
  // Stabile: con un'identità nuova a ogni render, offline riproverebbe a raffica.
  const { reload } = live
  const flush = useCallback(async () => {
    if (readQueue(eventId).length === 0) return
    const { sent, rejected } = await flushQueue(supabaseBrowser, eventId)
    if (sent.length === 0 && rejected.length === 0) return
    // Prima il server, poi la coda: la cronaca (memo su queueVersion) non perde
    // per un attimo l'evento appena inviato.
    await reload()
    setQueueVersion((version) => version + 1)
    if (rejected.length > 0) {
      toast.error(`${rejected.length} eventi non registrati`, {
        description: rejected
          .map((action) => `${minuteLabel(action.minute, action.stoppage)} ${TIMELINE_LABEL[action.kind]}`)
          .join(", "),
      })
    }
  }, [eventId, reload])

  useEffect(() => {
    void flush()
    const timer = window.setInterval(() => void flush(), 5000)
    const onOnline = () => void flush()
    window.addEventListener("online", onOnline)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", onOnline)
    }
  }, [flush])

  // ─── Passaggio di controllo ──────────────────────────────────────────────
  const wasOperator = useRef(false)
  useEffect(() => {
    if (wasOperator.current && session && !isOperator && session.status !== "FINISHED") {
      toast.info(`Ora la partita la segue ${session.operatorName ?? "un altro manager"}`)
    }
    wasOperator.current = isOperator
  }, [isOperator, session])

  // Schermo sempre acceso finché si registra.
  const liveStatus = session?.status ?? null
  useEffect(() => {
    if (!isOperator || !liveStatus || liveStatus === "FINISHED") return
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null
      } catch {
        // Non supportato o negato: lo schermo segue le impostazioni del telefono.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void request()
    }
    void request()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      void lock?.release().catch(() => {})
    }
  }, [isOperator, liveStatus])

  // ─── Azioni ──────────────────────────────────────────────────────────────
  function record(
    kind: RecordAction["kind"],
    fields: { profileId?: string | null; assistProfileId?: string | null; subInProfileId?: string | null } = {},
  ) {
    if (!session) return
    const at = new Date()
    enqueue({
      id: newId(),
      eventId,
      kind,
      ...eventMoment(session, at),
      occurredAt: at.toISOString(),
      profileId: fields.profileId ?? null,
      assistProfileId: fields.assistProfileId ?? null,
      subInProfileId: fields.subInProfileId ?? null,
    })
    navigator.vibrate?.(30)
    setQueueVersion((version) => version + 1)
    void flush()
  }

  async function run(action: () => Promise<unknown>, offlineMessage: string) {
    setBusy(true)
    try {
      await action()
      await live.reload()
    } catch (error) {
      const message = matchErrorMessage(error)
      toast.error(message.includes("fetch") ? offlineMessage : message)
      await live.reload()
    } finally {
      setBusy(false)
    }
  }

  function substitute(outId: string, inId: string) {
    if (!session || !state || !event) return
    const limit = substitutionLimit(event.tipo, session.status)
    const done = substitutionsInPeriod(timeline, session.status)
    if (limit !== null && done >= limit) {
      toast.warning(`Limite di cambi raggiunto (${done}/${limit}): registrato comunque`)
    }
    if (event.tipo === "PARTITA") {
      const after = Object.entries(state.onField).map(([positionKey, id]) => ({
        positionKey,
        id: id === outId ? inId : id,
      }))
      const quota = u35Quota(
        after
          .filter(({ id }) => id)
          .map(({ positionKey, id }) => ({
            positionKey,
            birthDate: players.get(id!)?.birthDate,
            role: players.get(id!)?.role,
          })),
        matchDate,
      )
      if (quota.fieldExceeded) toast.warning(`U35 in campo oltre il limite (${quota.field}/${U35_FIELD_MAX})`)
    }
    record("SUB", { profileId: outId, subInProfileId: inId })
  }

  const lastEntry = [...timeline].reverse().find(({ kind }) => kind !== "PERIOD_START" && kind !== "PERIOD_END")

  async function undoLast() {
    if (!lastEntry) return
    if (readQueue(eventId).some(({ id }) => id === lastEntry.id)) {
      dropQueued(eventId, lastEntry.id)
      setQueueVersion((version) => version + 1)
      return
    }
    setVoidedLocally((current) => new Set(current).add(lastEntry.id))
    try {
      await voidEntry(supabaseBrowser, eventId, lastEntry.id)
      await live.reload()
    } catch (error) {
      setVoidedLocally((current) => {
        const next = new Set(current)
        next.delete(lastEntry.id)
        return next
      })
      toast.error(matchErrorMessage(error))
    }
  }

  async function save(final: MatchSummary) {
    setBusy(true)
    try {
      await flush()
      if (readQueue(eventId).length > 0) {
        toast.error("Ci sono eventi non ancora inviati: serve la rete per chiudere la partita.")
        return
      }
      await finishMatch(supabaseBrowser, eventId, final)
      toast.success("Partita salvata")
      setSummary(null)
      await live.reload()
    } catch (error) {
      toast.error(matchErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const badgesFor = (profileId: string): AvatarBadges => ({
    goals: state?.goals.get(profileId),
    yellows: state?.yellows.get(profileId),
    expelled: state?.expelled.has(profileId),
    u35: event?.tipo === "PARTITA" && isU35At(players.get(profileId)?.birthDate, matchDate) && players.get(profileId)?.role?.toUpperCase() !== "PORTIERE",
    discipline: discipline.get(profileId) ?? null,
    subbedIn: state?.subbedIn.get(profileId) ?? null,
    subbedOut: state?.subbedOut.get(profileId) ?? null,
  })

  const shell = (children: React.ReactNode) => (
    // z-50 come l'header: viene dopo nel DOM e lo copre, mentre i dialog (portal
    // in fondo al body, sempre z-50) restano sopra.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-lg space-y-3 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  )

  const header = (
    <header className="flex items-center gap-2">
      <Button asChild aria-label="Esci dalla modalità partita" size="icon" variant="ghost">
        <Link href={`/evento/${eventId}`}>
          <X aria-hidden="true" />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-center text-base font-black uppercase">
        Chigi {score.ours}–{score.theirs} {opponent}
      </h1>
      {isOperator && session && session.status !== "FINISHED" ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button aria-label="Altre azioni" size="icon" variant="ghost">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-56 gap-1 p-1">
            <Button className="justify-start" onClick={() => record("OWN_GOAL_FOR")} variant="ghost">
              Autogol avversario
            </Button>
            <Button className="justify-start" onClick={() => record("UNATTRIBUTED_GOAL")} variant="ghost">
              Goal non attribuito
            </Button>
            <Button
              className="justify-start"
              disabled={busy}
              onClick={() => void run(() => updateClock(supabaseBrowser, eventId, { startShiftSeconds: -60 }), "Serve la rete per correggere il timer.")}
              variant="ghost"
            >
              Timer +1′
            </Button>
            <Button
              className="justify-start"
              disabled={busy}
              onClick={() => void run(() => updateClock(supabaseBrowser, eventId, { startShiftSeconds: 60 }), "Serve la rete per correggere il timer.")}
              variant="ghost"
            >
              Timer −1′
            </Button>
            <Button className="justify-start" onClick={() => setChronicleOpen(true)} variant="ghost">
              Cronaca completa
            </Button>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="size-9" />
      )}
    </header>
  )

  if (sessionLoading || (isManager && !loaded && !loadError) || !live.loaded) {
    return shell(
      <>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="aspect-[3/4] w-full" />
      </>,
    )
  }

  if (!isManager) {
    return shell(
      <div className="space-y-3 rounded-xl border bg-card p-6 text-center">
        <p className="font-bold">La modalità partita è riservata ai manager.</p>
        <Button asChild variant="outline">
          <Link href={`/evento/${eventId}`}>Segui la diretta</Link>
        </Button>
      </div>,
    )
  }

  if (loadError || !event) {
    return shell(
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-card p-6 text-center" role="alert">
        <p className="font-bold">Partita non disponibile.</p>
        <Button asChild variant="outline">
          <Link href={`/evento/${eventId}`}>Torna all’evento</Link>
        </Button>
      </div>,
    )
  }

  if (!session) {
    return shell(
      <>
        {header}
        <MatchSetup
          busy={busy}
          formation={formation}
          onStart={(lineup, periodMinutes) =>
            void run(() => startMatch(supabaseBrowser, eventId, periodMinutes, lineup), "Serve la rete per il calcio d’inizio.")
          }
          players={players}
          presentIds={presentIds}
          tipo={event.tipo}
        />
      </>,
    )
  }

  if (session.status === "FINISHED" || !isOperator) {
    return shell(
      <>
        {header}
        <section className="rounded-xl border bg-card p-4">
          <LiveScore opponent={opponent} session={session} />
          {session.status === "FINISHED" && <p className="mt-2 text-center text-sm font-bold">Partita chiusa e salvata.</p>}
        </section>
        {session.status !== "FINISHED" && (
          <Button
            className="h-14 w-full bg-operative text-base font-black text-operative-foreground hover:bg-operative/90"
            disabled={busy}
            onClick={() => setConfirm("TAKE_CONTROL")}
          >
            Prendi il controllo
          </Button>
        )}
        <MatchChronicle opponent={opponent} timeline={timeline} />
        <Button asChild className="w-full" variant="outline">
          <Link href={`/evento/${eventId}`}>Torna all’evento</Link>
        </Button>
        <AlertDialog open={confirm === "TAKE_CONTROL"} onOpenChange={(open) => !open && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Prendere il controllo?</AlertDialogTitle>
              <AlertDialogDescription>
                {session.operatorName ?? "Un altro manager"} sta registrando la partita. Se prendi il controllo, il suo telefono passa alla sola lettura.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-operative text-operative-foreground hover:bg-operative/90"
                onClick={() => void run(() => takeControl(supabaseBrowser, eventId), "Serve la rete per prendere il controllo.")}
              >
                Prendi il controllo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    )
  }

  const selectedPlayer = selected ? players.get(selected.profileId) ?? null : null
  const onFieldPlayers = Object.values(state!.onField)
    .filter((id): id is string => Boolean(id))
    .map((id) => players.get(id))
    .filter((player): player is MatchPlayer => Boolean(player))
  const benchPlayers = state!.bench.map((id) => players.get(id)).filter((player): player is MatchPlayer => Boolean(player))
  const limit = substitutionLimit(event.tipo, session.status)
  const subsDone = substitutionsInPeriod(timeline, session.status)
  const quota = u35Quota(
    Object.entries(state!.onField)
      .filter(([, id]) => id)
      .map(([positionKey, id]) => ({ positionKey, birthDate: players.get(id!)?.birthDate, role: players.get(id!)?.role })),
    matchDate,
  )
  const moment = eventMoment(session, now)
  const minuteText = minuteLabel(moment.minute, moment.stoppage)

  return shell(
    <>
      {header}
      {pendingCount > 0 && (
        <p className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          <CloudOff aria-hidden="true" className="size-4" />
          {pendingCount === 1 ? "1 evento da inviare" : `${pendingCount} eventi da inviare`}
        </p>
      )}

      <MatchClock
        busy={busy}
        now={now}
        onAddedMinutes={(minutes) => void run(() => updateClock(supabaseBrowser, eventId, { addedMinutes: minutes }), "Serve la rete per il recupero.")}
        onEndFirstHalf={() => setConfirm("END_FIRST_HALF")}
        onFinalWhistle={() => setSummary(buildSummary(session.lineup, timeline, new Date()))}
        onStartSecondHalf={() => void run(() => advancePeriod(supabaseBrowser, eventId), "Serve la rete per iniziare il secondo tempo.")}
        onTimeout={() => void run(() => updateClock(supabaseBrowser, eventId, { timeoutUsed: true }), "Serve la rete per il time-out.")}
        session={session}
      />

      <MatchPitch
        badgesFor={badgesFor}
        module={session.lineup.module}
        onField={state!.onField}
        onSelect={(positionKey, profileId) => {
          if (benchPick) {
            substitute(profileId, benchPick)
            setBenchPick(null)
            return
          }
          setSelected({ positionKey, profileId })
        }}
        players={players}
      />
      {benchPick && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-bold text-primary" role="status">
          Tocca in campo chi esce per {players.get(benchPick)?.cognome}
          <button className="ml-2 underline" onClick={() => setBenchPick(null)} type="button">
            Annulla
          </button>
        </p>
      )}

      <MatchBench
        badgesFor={badgesFor}
        bench={state!.bench}
        counters={
          <span className="flex gap-3 text-xs font-bold text-muted-foreground">
            <span>
              {session.status === "HALFTIME" ? "Cambi liberi" : `Cambi ${subsDone}${limit !== null ? `/${limit}` : ""}`}
            </span>
            {event.tipo === "PARTITA" && (
              <span className={quota.fieldExceeded ? "text-red-700 dark:text-red-300" : undefined}>
                U35 {quota.field}/{U35_FIELD_MAX}
              </span>
            )}
          </span>
        }
        expelled={[...state!.expelled]}
        onSelect={(profileId) => setBenchPick((current) => (current === profileId ? null : profileId))}
        players={players}
      />

      <div className="sticky bottom-0 -mx-3 space-y-2 border-t bg-background/95 p-3 backdrop-blur">
        <Button className="h-14 w-full text-base font-black" onClick={() => record("GOAL_AGAINST")} variant="outline">
          <span aria-hidden="true">⚽</span> Goal {opponent}
        </Button>
        {lastEntry && (
          <Button className="h-11 w-full justify-start" onClick={() => void undoLast()} variant="ghost">
            <Undo2 aria-hidden="true" />
            <span className="truncate">
              Annulla: {TIMELINE_LABEL[lastEntry.kind]} {lastEntry.playerName ?? ""} {minuteLabel(lastEntry.minute, lastEntry.stoppage)}
            </span>
          </Button>
        )}
      </div>

      <PlayerActionDialog
        bench={benchPlayers}
        fieldMates={onFieldPlayers.filter(({ id }) => id !== selected?.profileId)}
        minute={minuteText}
        onClose={() => setSelected(null)}
        onGoal={(assistId) => record("GOAL", { profileId: selected!.profileId, assistProfileId: assistId })}
        onRed={() => record("RED", { profileId: selected!.profileId })}
        onSub={(inId) => substitute(selected!.profileId, inId)}
        onYellow={(expel) => {
          record("YELLOW", { profileId: selected!.profileId })
          if (expel) record("RED", { profileId: selected!.profileId })
        }}
        player={selectedPlayer}
        yellows={selected ? state!.yellows.get(selected.profileId) ?? 0 : 0}
      />

      <AlertDialog open={confirm === "END_FIRST_HALF"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fine del primo tempo?</AlertDialogTitle>
            <AlertDialogDescription>Parte l’intervallo da 15 minuti.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run(() => advancePeriod(supabaseBrowser, eventId), "Serve la rete per chiudere il tempo.")}>
              Fine 1° tempo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MatchSummaryDialog
        onClose={() => setSummary(null)}
        onSave={(final) => void save(final)}
        players={players}
        report={buildMatchReport(opponent, timeline)}
        saving={busy}
        summary={summary}
      />

      <AlertDialog open={chronicleOpen} onOpenChange={setChronicleOpen}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Cronaca completa</AlertDialogTitle>
            <AlertDialogDescription>Goal, cartellini e cambi in ordine di gioco.</AlertDialogDescription>
          </AlertDialogHeader>
          <ol className="space-y-1 text-sm">
            {timeline
              .filter(({ kind }) => kind !== "PERIOD_START" && kind !== "PERIOD_END")
              .map((entry) => (
                <li className="flex gap-2" key={entry.id}>
                  <span className="w-12 font-mono text-xs font-bold text-muted-foreground">{minuteLabel(entry.minute, entry.stoppage)}</span>
                  <span>
                    {TIMELINE_LABEL[entry.kind]}
                    {entry.kind === "SUB"
                      ? `: ${entry.subInName ?? "?"} per ${entry.playerName ?? "?"}`
                      : entry.playerName
                        ? `: ${entry.playerName}`
                        : ""}
                  </span>
                </li>
              ))}
          </ol>
          <AlertDialogFooter>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
  )
}

async function loadDiscipline(seasonId: string, beforeDate: string) {
  const { data, error } = await supabaseBrowser
    .from("match_player_stats")
    .select("profile_id, yellow_cards, red_cards, event:events!inner(data_ora, tipo, season_id)")
    .eq("event.tipo", "PARTITA")
    .eq("event.season_id", seasonId)
    .lt("event.data_ora", beforeDate)
  if (error) return new Map<string, DisciplineStatus>()
  return disciplineByPlayer(
    ((data ?? []) as unknown as { profile_id: string; yellow_cards: number; red_cards: number; event: { data_ora: string } }[]).map(
      (row) => ({
        profileId: row.profile_id,
        eventDate: row.event.data_ora,
        yellow: row.yellow_cards,
        red: row.red_cards,
      }),
    ),
  )
}
