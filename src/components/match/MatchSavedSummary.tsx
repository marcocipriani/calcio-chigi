"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { MatchSummary } from "@/lib/match"
import { fetchSavedSummary, matchErrorMessage, updateSummary } from "@/lib/match-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

import { MatchSummaryDialog } from "./MatchSummaryDialog"
import type { MatchPlayer } from "./players"

const COLUMNS = [
  { field: "minutesPlayed", short: "Min", label: "Minuti" },
  { field: "goals", short: "G", label: "Goal" },
  { field: "assists", short: "A", label: "Assist" },
  { field: "yellowCards", short: "🟨", label: "Gialli" },
  { field: "redCards", short: "🟥", label: "Rossi" },
] as const

/** Dopo il fischio finale: minuti e statistiche salvati, con la correzione. */
export function MatchSavedSummary({
  eventId,
  players,
  report,
}: {
  eventId: string
  players: Map<string, MatchPlayer>
  report: string
}) {
  const [summary, setSummary] = useState<MatchSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setSummary(await fetchSavedSummary(supabaseBrowser, eventId))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(next: MatchSummary) {
    setSaving(true)
    try {
      await updateSummary(supabaseBrowser, eventId, next)
      toast.success("Riepilogo corretto")
      setEditing(false)
      await load()
    } catch (error) {
      toast.error(matchErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      toast.success("Cronaca copiata")
    } catch {
      toast.error("Copia non riuscita")
    }
  }

  if (failed) {
    return (
      <p className="rounded-xl border bg-card p-4 text-center text-sm" role="alert">
        Riepilogo non disponibile.{" "}
        <button className="font-bold underline" onClick={() => void load()} type="button">
          Riprova
        </button>
      </p>
    )
  }
  if (!summary) return <Skeleton className="h-48 w-full rounded-xl" />

  const name = (profileId: string) => players.get(profileId)?.cognome ?? "?"
  const rows = [...summary.players].sort(
    (left, right) => right.minutesPlayed - left.minutesPlayed || name(left.profileId).localeCompare(name(right.profileId), "it"),
  )

  return (
    <section aria-labelledby="match-saved-summary" className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="flex-1 text-sm font-black" id="match-saved-summary">
          Riepilogo
        </h2>
        <Button onClick={() => void copyReport()} size="sm" variant="ghost">
          <Copy aria-hidden="true" /> Cronaca
        </Button>
        <Button onClick={() => setEditing(true)} size="sm" variant="outline">
          <Pencil aria-hidden="true" /> Correggi
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nessuna statistica salvata.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Minuti e statistiche per giocatore</caption>
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="px-4 py-2 text-left font-bold" scope="col">
                Giocatore
              </th>
              {COLUMNS.map(({ field, short, label }) => (
                <th className="w-10 text-center font-bold" key={field} scope="col">
                  <span aria-hidden="true">{short}</span>
                  <span className="sr-only">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t" key={row.profileId}>
                <th className="max-w-32 truncate px-4 py-2 text-left font-bold" scope="row">
                  {name(row.profileId)}
                </th>
                {COLUMNS.map(({ field }) => (
                  <td className="text-center tabular-nums" key={field}>
                    {row[field] || (field === "minutesPlayed" ? "0" : "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(summary.opponentOwnGoals > 0 || summary.unattributedGoals > 0) && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {[
            summary.opponentOwnGoals > 0 && `Autogol avversari: ${summary.opponentOwnGoals}`,
            summary.unattributedGoals > 0 && `Goal non attribuiti: ${summary.unattributedGoals}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <MatchSummaryDialog
        mode="correct"
        onClose={() => setEditing(false)}
        onSave={(next) => void save(next)}
        players={players}
        report={report}
        saving={saving}
        summary={editing ? summary : null}
      />
    </section>
  )
}
