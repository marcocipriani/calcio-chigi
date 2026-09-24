import { format } from "date-fns"
import { it } from "date-fns/locale"
import { CheckCircle2, FileClock } from "lucide-react"

import { playerShortName } from "@/components/jersey/JerseyBoard"
import type { JerseyBoardRow, JerseyDraft } from "@/lib/jersey-api"
import { cn } from "@/lib/utils"

export function formatJerseyTimestamp(value: string) {
  return format(new Date(value), "d MMM yyyy, HH:mm", { locale: it })
}

/** Riepilogo pubblicato dal manager, in ordine di numero. */
export function JerseyDraftTable({
  draft,
  rows,
  highlightMembershipId,
}: {
  draft: JerseyDraft
  rows: JerseyBoardRow[]
  highlightMembershipId?: string | null
}) {
  const entries = rows
    .map((row) => ({
      row,
      number: draft.assignment[row.membershipId] ?? null,
    }))
    .sort(
      (left, right) =>
        (left.number ?? 100) - (right.number ?? 100) ||
        left.row.cognome.localeCompare(right.row.cognome),
    )

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {draft.confirmedAt ? (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="size-3.5 text-emerald-600"
            />
            Definitivo dal {formatJerseyTimestamp(draft.confirmedAt)}
          </>
        ) : (
          <>
            <FileClock aria-hidden="true" className="size-3.5 text-amber-600" />
            Bozza pubblicata il {formatJerseyTimestamp(draft.publishedAt)}
          </>
        )}
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(({ row, number }) => (
          <li
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
              row.membershipId === highlightMembershipId &&
                "border-operative/50 bg-operative/10",
            )}
            key={row.membershipId}
          >
            <span className="w-8 text-right font-black tabular-nums">
              {number ?? "—"}
            </span>
            <span className="truncate">{playerShortName(row)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
