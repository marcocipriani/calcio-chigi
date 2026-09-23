import { History } from "lucide-react"

import type { JerseyHistoryEntry } from "@/lib/jersey-api"

export function JerseyHistory({
  entries,
}: {
  entries: JerseyHistoryEntry[]
}) {
  return (
    <section
      aria-labelledby="jersey-history-title"
      className="rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h2 className="font-bold" id="jersey-history-title">
          Storico maglie
        </h2>
      </div>
      {entries.length ? (
        <ol className="mt-3 divide-y text-sm">
          {entries.map((entry) => (
            <li
              className="flex items-center justify-between gap-3 py-2"
              key={entry.seasonId}
            >
              <span className="text-muted-foreground">{entry.seasonName}</span>
              <span className="font-black tabular-nums">
                {entry.jerseyNumber !== null ? `#${entry.jerseyNumber}` : "—"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Nessuna maglia registrata.
        </p>
      )}
    </section>
  )
}
