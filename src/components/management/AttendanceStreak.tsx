import { format } from "date-fns"
import { it } from "date-fns/locale"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { AttendanceSummary } from "@/lib/management-attendance"
import { cn } from "@/lib/utils"

const statusLabel = {
  PRESENT: "presente",
  ABSENT: "assente",
  MISSING: "non registrato",
}

const statusClass = {
  PRESENT: "bg-emerald-500",
  ABSENT: "bg-rose-500",
  MISSING: "bg-slate-300",
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
    <span className="inline-flex items-end gap-1">
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
              "inline-flex flex-col items-center gap-1",
              week !== previousWeek && "ml-1 border-l pl-2",
            )}
            data-testid={
              week !== previousWeek ? "week-separator" : undefined
            }
            key={item.eventId}
          >
            <span className="text-[9px] text-muted-foreground">{shortDay}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${accessibleDay}: ${statusLabel[item.status]}`}
                  className={cn(
                    "size-3 rounded-sm border-0 p-0",
                    statusClass[item.status],
                  )}
                  tabIndex={0}
                  type="button"
                />
              </TooltipTrigger>
              <TooltipContent>
                {accessibleDay}: {statusLabel[item.status]}
              </TooltipContent>
            </Tooltip>
          </span>
        )
      })}
    </span>
  )
}
