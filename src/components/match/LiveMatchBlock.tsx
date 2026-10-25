"use client"

import { describeEntry, formatCountdown, minuteLabel, periodClock, type MatchSession, type TimelineEntry } from "@/lib/match"

import { TIMELINE_LABEL, TimelineIcon } from "./MatchIcons"
import { useNow } from "./useLiveMatch"

const CHRONICLE_KINDS = new Set(["GOAL", "OWN_GOAL_FOR", "UNATTRIBUTED_GOAL", "GOAL_AGAINST", "YELLOW", "RED"])

export function liveStatusText(session: MatchSession, now: Date) {
  if (session.status === "FINISHED") return "Finale"
  const clock = periodClock(session, now)
  if (session.status === "HALFTIME") {
    return `Intervallo · riprende tra ${formatCountdown(clock.halftimeRemaining ?? 0)}`
  }
  const added = session.addedMinutes > 0 ? ` (recupero +${session.addedMinutes})` : ""
  return `${clock.period}° tempo · ${minuteLabel(clock.minute, clock.stoppage)}${added}`
}

/** Risultato in diretta: punteggio, minuto e chi segue la partita. */
export function LiveScore({ session, opponent }: { session: MatchSession; opponent: string }) {
  const finished = session.status === "FINISHED"
  const now = useNow(1000, !finished)
  return (
    <div className="flex flex-col items-center gap-1.5" data-testid="live-score">
      {finished ? (
        <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Finale</p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-secondary">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
          Live · {liveStatusText(session, now)}
        </p>
      )}
      <p aria-live="polite" className="flex items-center gap-3 text-center">
        <span className="text-sm font-black uppercase">Chigi</span>
        <span className="rounded-2xl bg-muted px-4 py-1.5 font-mono text-4xl font-black tracking-tighter">
          {session.scoreOurs} – {session.scoreTheirs}
        </span>
        <span className="max-w-32 truncate text-sm font-black uppercase">{opponent}</span>
      </p>
      {session.operatorName && !finished && (
        <p className="text-xs text-muted-foreground">Segue la partita: {session.operatorName}</p>
      )}
    </div>
  )
}

/** Cronaca pubblica: goal e cartellini, dal più recente. I cambi restano in panchina. */
export function MatchChronicle({ timeline, opponent }: { timeline: TimelineEntry[]; opponent: string }) {
  const rows = timeline.filter(({ kind }) => CHRONICLE_KINDS.has(kind))
  let ours = 0
  let theirs = 0
  const withScore = rows.map((entry) => {
    if (entry.kind === "GOAL_AGAINST") theirs += 1
    else if (entry.kind !== "YELLOW" && entry.kind !== "RED") ours += 1
    return { entry, score: entry.kind === "YELLOW" || entry.kind === "RED" ? null : `${ours}-${theirs}` }
  })

  return (
    <section aria-labelledby="match-chronicle-title" className="rounded-xl border bg-card">
      <h3 className="border-b px-4 py-3 text-sm font-black" id="match-chronicle-title">
        Cronaca
      </h3>
      {withScore.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Ancora nessun goal o cartellino.</p>
      ) : (
        <ol className="divide-y">
          {[...withScore].reverse().map(({ entry, score }) => (
            <li className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm" key={entry.id}>
              <span className="flex w-5 justify-center">
                <TimelineIcon kind={entry.kind} />
              </span>
              <span className="w-12 shrink-0 font-mono text-xs font-bold text-muted-foreground">
                {minuteLabel(entry.minute, entry.stoppage)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="sr-only">{TIMELINE_LABEL[entry.kind]}: </span>
                {describeEntry(entry, opponent) || TIMELINE_LABEL[entry.kind]}
              </span>
              {score && <span className="shrink-0 font-mono text-xs font-black">{score}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
