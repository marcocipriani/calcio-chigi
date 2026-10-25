import { ArrowLeftRight } from "lucide-react"

import type { TimelineKind } from "@/lib/match"
import { cn } from "@/lib/utils"

/** Cartellino: il colore è lo stato, come in campo. */
export function CardIcon({ red = false, className }: { red?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-3.5 w-2.5 shrink-0 rounded-[2px] shadow-sm",
        red ? "bg-red-600" : "bg-yellow-400",
        className,
      )}
    />
  )
}

/** Fischietto dell'arbitro, disegnato come le icone lucide (che non lo hanno). */
export function WhistleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx="8" cy="15" r="5" />
      <path d="M8 10h13v4h-8" />
      <path d="M3 7l2 2" />
    </svg>
  )
}

/** Doppio fischio a fine primo tempo, triplice al fischio finale. */
export function Whistles({ count }: { count: 2 | 3 }) {
  return (
    <span aria-hidden="true" className="inline-flex gap-px">
      {Array.from({ length: count }, (_, index) => (
        <WhistleIcon key={index} />
      ))}
    </span>
  )
}

export function TimelineIcon({ kind }: { kind: TimelineKind }) {
  if (kind === "YELLOW") return <CardIcon />
  if (kind === "RED") return <CardIcon red />
  if (kind === "SUB") return <ArrowLeftRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
  return (
    <span aria-hidden="true" className="text-sm leading-none">
      ⚽
    </span>
  )
}

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  PERIOD_START: "Inizio tempo",
  PERIOD_END: "Fine tempo",
  GOAL: "Goal",
  OWN_GOAL_FOR: "Autogol avversario",
  UNATTRIBUTED_GOAL: "Goal",
  GOAL_AGAINST: "Goal avversario",
  YELLOW: "Ammonizione",
  RED: "Espulsione",
  SUB: "Cambio",
}
