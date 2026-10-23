"use client"

import { useState } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { MatchSummary, MatchSummaryPlayer } from "@/lib/match"

import type { MatchPlayer } from "./players"

type NumberField = Exclude<keyof MatchSummaryPlayer, "profileId">

const COLUMNS: { field: NumberField; label: string; short: string }[] = [
  { field: "goals", label: "Goal", short: "G" },
  { field: "assists", label: "Assist", short: "A" },
  { field: "yellowCards", label: "Gialli", short: "🟨" },
  { field: "redCards", label: "Rossi", short: "🟥" },
  { field: "minutesPlayed", label: "Minuti", short: "Min" },
]

const toCount = (value: string) => Math.max(0, Number.parseInt(value, 10) || 0)

/** Riepilogo modificabile prima del salvataggio definitivo. */
export function MatchSummaryDialog({
  summary,
  players,
  report,
  saving,
  onClose,
  onSave,
}: {
  summary: MatchSummary | null
  players: Map<string, MatchPlayer>
  report: string
  saving: boolean
  onClose: () => void
  onSave: (summary: MatchSummary) => void
}) {
  return (
    <Dialog open={summary !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-xl">
        {summary && (
          <SummaryForm
            initial={summary}
            onClose={onClose}
            onSave={onSave}
            players={players}
            report={report}
            saving={saving}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SummaryForm({
  initial,
  players,
  report,
  saving,
  onClose,
  onSave,
}: {
  initial: MatchSummary
  players: Map<string, MatchPlayer>
  report: string
  saving: boolean
  onClose: () => void
  onSave: (summary: MatchSummary) => void
}) {
  const [summary, setSummary] = useState(initial)

  const setPlayer = (profileId: string, field: NumberField, value: string) =>
    setSummary((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.profileId === profileId ? { ...player, [field]: toCount(value) } : player,
      ),
    }))

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      toast.success("Cronaca copiata")
    } catch {
      toast.error("Copia non riuscita")
    }
  }

  const rows = [...summary.players].sort(
    (left, right) =>
      (players.get(left.profileId)?.cognome ?? "").localeCompare(players.get(right.profileId)?.cognome ?? "", "it"),
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fischio finale</DialogTitle>
        <DialogDescription>
          Controlla e correggi prima di salvare: risultato e statistiche vanno nella partita, chi ha giocato viene segnato presente.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-end justify-center gap-3">
        <label className="grid gap-1 text-center text-xs font-bold">
          Chigi
          <Input
            className="h-12 w-16 text-center text-2xl font-black"
            inputMode="numeric"
            min={0}
            onChange={(event) => setSummary((current) => ({ ...current, golNostri: toCount(event.target.value) }))}
            type="number"
            value={summary.golNostri}
          />
        </label>
        <span className="pb-3 text-2xl font-black">–</span>
        <label className="grid gap-1 text-center text-xs font-bold">
          Avversari
          <Input
            className="h-12 w-16 text-center text-2xl font-black"
            inputMode="numeric"
            min={0}
            onChange={(event) => setSummary((current) => ({ ...current, golAvversario: toCount(event.target.value) }))}
            type="number"
            value={summary.golAvversario}
          />
        </label>
      </div>

      <div className="flex justify-center gap-4 text-xs font-bold">
        <label className="flex items-center gap-2">
          Autogol avversari
          <Input
            className="h-10 w-14 text-center"
            inputMode="numeric"
            min={0}
            onChange={(event) => setSummary((current) => ({ ...current, opponentOwnGoals: toCount(event.target.value) }))}
            type="number"
            value={summary.opponentOwnGoals}
          />
        </label>
        <label className="flex items-center gap-2">
          Non attribuiti
          <Input
            className="h-10 w-14 text-center"
            inputMode="numeric"
            min={0}
            onChange={(event) => setSummary((current) => ({ ...current, unattributedGoals: toCount(event.target.value) }))}
            type="number"
            value={summary.unattributedGoals}
          />
        </label>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Statistiche per giocatore</caption>
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="text-left font-bold" scope="col">
              Giocatore
            </th>
            {COLUMNS.map(({ field, label, short }) => (
              <th className="w-11 text-center font-bold" key={field} scope="col">
                <span aria-hidden="true">{short}</span>
                <span className="sr-only">{label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = players.get(row.profileId)?.cognome ?? "?"
            return (
              <tr className="border-t" key={row.profileId}>
                <th className="max-w-24 truncate py-1 text-left font-bold" scope="row">
                  {name}
                </th>
                {COLUMNS.map(({ field, label }) => (
                  <td className="p-0.5" key={field}>
                    <Input
                      aria-label={`${label} ${name}`}
                      className="h-10 w-11 px-1 text-center"
                      inputMode="numeric"
                      min={0}
                      onChange={(event) => setPlayer(row.profileId, field, event.target.value)}
                      type="number"
                      value={row[field]}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button onClick={copyReport} variant="outline">
          <Copy aria-hidden="true" /> Copia cronaca
        </Button>
        <div className="flex gap-2">
          <Button disabled={saving} onClick={onClose} variant="ghost">
            Annulla
          </Button>
          <Button className="font-black" disabled={saving} onClick={() => onSave(summary)}>
            Salva
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
