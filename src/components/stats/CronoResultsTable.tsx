"use client"

import { useState } from "react"
import { saveAs } from "file-saver"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cronoAthlete, cronoCsv, cronoNumber, sortCronoRows, type CronoResult, type CronoSortKey, type CronoProfile } from "@/lib/crono-chigio"
import type { SeasonPlayerDirectoryEntry } from "@/lib/season-statistics"

const columns: { key: CronoSortKey; label: string; unit?: string }[] = [
  { key: "order", label: "Partenza" },
  { key: "name", label: "Atleta" },
  { key: "first", label: "Totale G1", unit: "s" },
  { key: "firstSpeed", label: "Media G1", unit: "km/h" },
  { key: "total", label: "Totale G2", unit: "s" },
  { key: "totalSpeed", label: "Media G2", unit: "km/h" },
  { key: "split", label: "1° tratto G2", unit: "s" },
  { key: "splitSpeed", label: "Media 1° tratto G2", unit: "km/h" },
  { key: "second", label: "2° tratto G2", unit: "s" },
  { key: "secondSpeed", label: "Media 2° tratto G2", unit: "km/h" },
  { key: "best", label: "Miglior totale", unit: "s" },
  { key: "delta", label: "Differenza", unit: "s" },
  { key: "timeChange", label: "Variazione tempo", unit: "%" },
  { key: "speedChange", label: "Variazione velocità", unit: "%" },
]
const groupStart = (key: CronoSortKey) => ["first", "total", "best"].includes(key) ? "border-l-2 border-border" : ""

export function CronoResultsTable({ rows, players = [] }: { rows: CronoResult[]; players?: SeasonPlayerDirectoryEntry[] }) {
  const [sort, setSort] = useState<CronoSortKey>("order")
  const [direction, setDirection] = useState<"asc" | "desc">("asc")
  const [profile, setProfile] = useState<CronoProfile>("all")
  const sorted = sortCronoRows(rows, sort, direction, profile)
  if (sort === "name") sorted.sort((left, right) => (direction === "asc" ? 1 : -1) * cronoAthlete(left, players).name.localeCompare(cronoAthlete(right, players).name, "it") || left.order - right.order)
  const selectClass = "mt-1 block min-h-11 w-full rounded-md border bg-background px-3 text-sm"

  function sortColumn(key: CronoSortKey) {
    setDirection(sort === key && direction === "asc" ? "desc" : "asc")
    setSort(key)
  }

  return <section aria-labelledby="crono-table-title" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="crono-table-title" className="text-lg font-bold">Tutti i risultati</h2><Button variant="outline" onClick={() => saveAs(new Blob([cronoCsv(sorted, players)], { type: "text/csv;charset=utf-8" }), "CronoChigio-2026-11-12.csv")}>Esporta CSV</Button></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <label className="text-xs font-bold">Ordina per<select aria-label="Ordina per" className={selectClass} value={sort} onChange={(event) => setSort(event.target.value as CronoSortKey)}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <label className="text-xs font-bold">Direzione<select aria-label="Direzione" className={selectClass} value={direction} onChange={(event) => setDirection(event.target.value as "asc" | "desc")}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
      <label className="col-span-2 text-xs font-bold sm:col-span-1">Profilo<select aria-label="Profilo" className={selectClass} value={profile} onChange={(event) => setProfile(event.target.value as CronoProfile)}><option value="all">Tutti</option><option value="🚀">🚀 Razzo</option><option value="🚆">🚆 Treno</option></select></label>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{sorted.length} atleti · CSV con filtro e ordine attuali. Tocca le intestazioni per ordinare; scorri per tutte le colonne.</p>
    <div role="region" aria-label="Tabella risultati CronoChigio" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
        <caption className="sr-only">CronoChigio, test del 12 novembre 2026. Tempi in secondi e velocità medie in km/h.</caption>
        <thead className="bg-muted">
          <tr className="border-b"><th scope="colgroup" colSpan={3} className="px-3 py-2">Partecipanti</th><th scope="colgroup" colSpan={2} className="border-l-2 border-border px-3 py-2">Giro 1 · 43,35 m</th><th scope="colgroup" colSpan={6} className="border-l-2 border-border px-3 py-2">Giro 2 · Totale e tratti</th><th scope="colgroup" colSpan={4} className="border-l-2 border-border px-3 py-2">Confronto</th></tr>
          <tr><th scope="col" className="px-3">Profilo G2</th>{columns.map((column) => <th key={column.key} scope="col" aria-sort={sort === column.key ? direction === "asc" ? "ascending" : "descending" : "none"} className={`px-3 ${groupStart(column.key)}`}><button className="min-h-11 text-left font-bold" onClick={() => sortColumn(column.key)}>{column.label}{column.unit ? ` (${column.unit})` : ""}{sort === column.key ? direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}</tr>
        </thead>
        <tbody>{sorted.map((row) => {
          const athlete = cronoAthlete(row, players)
          return <tr key={row.name} className="border-t even:bg-muted/30">
            <td className="px-3 py-3"><span aria-hidden="true">{row.emoji}</span> {row.emoji === "🚀" ? "Razzo" : "Treno"}</td>
            {columns.map((column) => {
              if (column.key === "name") return <td key={column.key} className="px-3 py-3"><div className="flex items-center gap-2"><Avatar className="size-10 shrink-0"><AvatarImage src={athlete.avatarUrl} alt="" className="object-cover" /><AvatarFallback>{athlete.initials}</AvatarFallback></Avatar><span>{athlete.name}{row.incompleteWarmup ? "*" : ""}</span></div></td>
              const value = row[column.key] as number
              const sign = value > 0 && ["delta", "timeChange", "speedChange"].includes(column.key) ? "+" : ""
              const formatted = column.unit === "s" ? cronoNumber(value / 100) : cronoNumber(value, column.unit === "km/h" ? 1 : column.key === "order" ? 0 : 2)
              const rank = column.key === "first" ? row.firstRank : column.key === "total" ? row.totalRank : column.key === "best" ? row.bestRank : null
              const best = column.key === "best" || (column.key === "first" && row.first === row.best) || (column.key === "total" && row.total === row.best)
              return <td key={column.key} className={`px-3 py-3 ${groupStart(column.key)} ${column.key === "delta" ? row.delta < 0 ? "text-emerald-700 dark:text-emerald-400" : row.delta > 0 ? "text-red-700 dark:text-red-400" : "" : ""}`}>{best ? <strong>{sign}{formatted}</strong> : <span>{sign}{formatted}</span>}{rank !== null && <span className="ml-2 text-xs text-muted-foreground">{rank}°</span>}</td>
            })}
          </tr>
        })}</tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">Grassetto: miglior tempo personale fra i due giri, entrambi in caso di parità. * {rows.filter((row) => row.incompleteWarmup).map((row) => cronoAthlete(row, players).name).join(", ")}: riscaldamento incompleto perché arrivato in ritardo. Posizioni e profili riferiti all’intero gruppo.</p>
  </section>
}
