import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Plus } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  AttendanceRate,
  AttendanceSummary,
} from "@/lib/management-attendance"
import { cn } from "@/lib/utils"

type Status = AttendanceSummary["recentTraining"][number]["status"]

const statusLabel: Record<Status, string> = {
  PRESENT: "presente",
  ABSENT: "assente",
  NOT_JOINED: "non ancora in squadra",
  KO: "KO",
}

const statusClass: Record<Status, string> = {
  PRESENT: "border-0 bg-emerald-500",
  ABSENT: "border-0 bg-slate-300",
  // Fuori dal conteggio: vuoto tratteggiato, tiene solo la colonna.
  NOT_JOINED: "border border-dashed border-muted-foreground/40",
  // Infermeria: croce rossa su bianco.
  KO: "grid place-items-center border border-rose-300 bg-white text-rose-600",
}

/** Percentuale su sfondo da rosso (0%) a giallo (50%) a verde (100%). */
export function AttendancePercentage({ rate }: { rate?: AttendanceRate }) {
  if (!rate?.total) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span
      className="rounded px-1.5 py-0.5 font-semibold tabular-nums"
      style={{
        backgroundColor: `hsl(${Math.round(rate.percentage * 1.2)} 85% 50% / 0.3)`,
      }}
    >
      {Math.round(rate.percentage)}%
    </span>
  )
}

export function AttendanceStreak({
  items,
}: {
  items: AttendanceSummary["recentTraining"]
}) {
  if (!items.length) {
    return <span className="text-xs text-muted-foreground">Nessun allenamento</span>
  }

  return (
    // row-reverse: la vista parte dagli ultimi 8 (w-8 × 8), i precedenti si
    // raggiungono scorrendo a sinistra.
    // ponytail: scroll indipendente per riga, sincronizzarle se dà fastidio.
    <span className="inline-flex max-w-64 flex-row-reverse overflow-x-auto [scrollbar-width:none]">
      <span className="inline-flex shrink-0 items-end">
        {items.map((item, index) => {
          const date = new Date(item.startsAt)
          const day = format(date, "EEEE d MMMM yyyy", { locale: it })
          const shortDay = format(date, "EE d", { locale: it })
          const week = format(date, "RRRR-II")
          const previousWeek =
            index > 0
              ? format(new Date(items[index - 1].startsAt), "RRRR-II")
              : week
          const accessibleDay =
            day[0].toLocaleUpperCase("it") + day.slice(1)

          return (
            <span
              className={cn(
                "inline-flex w-8 flex-col items-center gap-1",
                week !== previousWeek && "border-l",
              )}
              data-testid={
                week !== previousWeek ? "week-separator" : undefined
              }
              key={item.eventId}
            >
              <span className="text-[10px] text-muted-foreground">{shortDay}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label={`${accessibleDay}: ${statusLabel[item.status]}`}
                    className={cn(
                      "size-3 rounded-sm p-0",
                      statusClass[item.status],
                    )}
                    // Riga e scheda aprono la persona: il pallino mostra solo il dettaglio.
                    onClick={(event) => event.stopPropagation()}
                    tabIndex={0}
                    type="button"
                  >
                    {item.status === "KO" && (
                      <Plus
                        aria-hidden="true"
                        className="size-2.5"
                        strokeWidth={5}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {accessibleDay}: {statusLabel[item.status]}
                </TooltipContent>
              </Tooltip>
            </span>
          )
        })}
      </span>
    </span>
  )
}
