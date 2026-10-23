"use client"

import { useState } from "react"
import { Hand } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  formatCountdown,
  periodClock,
  RECOVERY_CHIPS_FROM_MINUTE,
  type MatchSession,
} from "@/lib/match"
import { cn } from "@/lib/utils"

const TIMEOUT_SECONDS = 60
const RECOVERY_OPTIONS = [1, 2, 3, 4, 5]

/** Timer della partita: tempo, recupero annunciato, time-out e chiusura del tempo. */
export function MatchClock({
  session,
  now,
  busy,
  onAddedMinutes,
  onTimeout,
  onEndFirstHalf,
  onStartSecondHalf,
  onFinalWhistle,
}: {
  session: MatchSession
  now: Date
  busy: boolean
  onAddedMinutes: (minutes: number) => void
  onTimeout: () => void
  onEndFirstHalf: () => void
  onStartSecondHalf: () => void
  onFinalWhistle: () => void
}) {
  const clock = periodClock(session, now)
  const [timeoutStartedAt, setTimeoutStartedAt] = useState<number | null>(null)
  const timeoutLeft = timeoutStartedAt
    ? Math.max(0, TIMEOUT_SECONDS - Math.floor((now.getTime() - timeoutStartedAt) / 1000))
    : 0

  if (session.status === "HALFTIME") {
    return (
      <section aria-label="Timer" className="rounded-xl border bg-card p-4 text-center">
        <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Intervallo</p>
        <p className="font-mono text-5xl font-black tabular-nums">{formatCountdown(clock.halftimeRemaining ?? 0)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Cambi illimitati durante l’intervallo</p>
        <Button className="mt-3 h-14 w-full text-base font-black" disabled={busy} onClick={onStartSecondHalf}>
          Inizio 2° tempo
        </Button>
      </section>
    )
  }

  const minuteInPeriod = (clock.period === 2 ? clock.minute - session.periodMinutes : clock.minute) + clock.stoppage
  const showRecovery = minuteInPeriod >= RECOVERY_CHIPS_FROM_MINUTE

  return (
    <section aria-label="Timer" className="relative rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{clock.period}° tempo</p>
        {session.addedMinutes > 0 && (
          <p className="text-sm font-black text-secondary">Recupero +{session.addedMinutes}</p>
        )}
      </div>
      <p className="text-center font-mono text-6xl font-black tabular-nums" role="timer">
        {clock.display}
      </p>

      {showRecovery && (
        <div aria-label="Recupero annunciato" className="mt-3 flex items-center gap-1.5" role="group">
          <span className="mr-1 text-xs font-bold text-muted-foreground">Recupero</span>
          {RECOVERY_OPTIONS.map((minutes) => (
            <Button
              aria-pressed={session.addedMinutes === minutes}
              className={cn("h-11 min-w-11 flex-1 px-0 font-black", session.addedMinutes === minutes && "bg-secondary text-secondary-foreground hover:bg-secondary/90")}
              disabled={busy}
              key={minutes}
              onClick={() => onAddedMinutes(session.addedMinutes === minutes ? 0 : minutes)}
              variant={session.addedMinutes === minutes ? "default" : "outline"}
            >
              +{minutes}
            </Button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          className="h-12 flex-1 font-bold"
          disabled={busy || session.timeoutUsed}
          onClick={() => {
            setTimeoutStartedAt(Date.now())
            onTimeout()
          }}
          variant="outline"
        >
          <Hand aria-hidden="true" /> {session.timeoutUsed ? "Time-out usato" : "Time-out 60\""}
        </Button>
        {clock.period === 1 ? (
          <Button className="h-12 flex-1 font-bold" disabled={busy} onClick={onEndFirstHalf} variant="outline">
            Fine 1° tempo
          </Button>
        ) : (
          <Button className="h-12 flex-1 font-black" disabled={busy} onClick={onFinalWhistle}>
            Fischio finale
          </Button>
        )}
      </div>

      {timeoutStartedAt !== null && timeoutLeft > 0 && (
        <button
          aria-label="Chiudi time-out"
          className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/95 text-center"
          onClick={() => setTimeoutStartedAt(null)}
          type="button"
        >
          <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">Time-out</span>
          <span className="font-mono text-6xl font-black tabular-nums">{formatCountdown(timeoutLeft)}</span>
          <span className="text-xs text-muted-foreground">Tocca per chiudere</span>
        </button>
      )}
    </section>
  )
}
