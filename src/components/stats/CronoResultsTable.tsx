"use client"

import { useState } from "react"
import { cronoNumber, sortCronoRows, type CronoResult, type CronoSortKey, type CronoProfile } from "@/lib/crono-chigio"

const columns: { key: CronoSortKey; label: string; unit?: string }[] = [
  { key: "order", label: "Partenza" },
  { key: "name", label: "Atleta" },
  { key: "first", label: "Giro 1", unit: "s" },
  { key: "total", label: "Giro 2", unit: "s" },
  { key: "best", label: "Miglior totale", unit: "s" },
  { key: "split", label: "1° tratto G2", unit: "s" },
  { key: "second", label: "2° tratto G2", unit: "s" },
  { key: "delta", label: "Differenza", unit: "s" },
  { key: "timeChange", label: "Variazione tempo", unit: "%" },
  { key: "firstSpeed", label: "Media Giro 1", unit: "km/h" },
  { key: "totalSpeed", label: "Media Giro 2", unit: "km/h" },
  { key: "splitSpeed", label: "Media 1° tratto G2", unit: "km/h" },
  { key: "secondSpeed", label: "Media 2° tratto G2", unit: "km/h" },
  { key: "speedChange", label: "Variazione velocità", unit: "%" },
]

export function CronoResultsTable({ rows }: { rows: CronoResult[] }) {
  const [sort, setSort] = useState<CronoSortKey>("order")
  const [direction, setDirection] = useState<"asc" | "desc">("asc")
  const [profile, setProfile] = useState<CronoProfile>("all")
  const sorted = sortCronoRows(rows, sort, direction, profile)
  const selectClass = "mt-1 block min-h-11 w-full rounded-md border bg-background px-3 text-sm"

  function sortColumn(key: CronoSortKey) {
    setDirection(sort === key && direction === "asc" ? "desc" : "asc")
    setSort(key)
  }

  return <section aria-labelledby="crono-table-title" className="min-w-0 space-y-3">
    <h2 id="crono-table-title" className="text-lg font-bold">Tutti i risultati</h2>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <label className="text-xs font-bold">Ordina per<select aria-label="Ordina per" className={selectClass} value={sort} onChange={(event) => setSort(event.target.value as CronoSortKey)}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <label className="text-xs font-bold">Direzione<select aria-label="Direzione" className={selectClass} value={direction} onChange={(event) => setDirection(event.target.value as "asc" | "desc")}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
      <label className="col-span-2 text-xs font-bold sm:col-span-1">Profilo<select aria-label="Profilo" className={selectClass} value={profile} onChange={(event) => setProfile(event.target.value as CronoProfile)}><option value="all">Tutti</option><option value="🚀">🚀 Razzo</option><option value="🚆">🚆 Treno</option></select></label>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{sorted.length} atleti · Tocca le intestazioni per ordinare. Scorri la tabella per tutte le colonne.</p>
    <div role="region" aria-label="Tabella risultati CronoChigio" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
        <caption className="sr-only">CronoChigio, test del 12 novembre 2026. Tempi in secondi e velocità medie in km/h.</caption>
        <thead className="bg-muted"><tr>{columns.map((column) => <th key={column.key} scope="col" aria-sort={sort === column.key ? direction === "asc" ? "ascending" : "descending" : "none"} className="px-3"><button className="min-h-11 text-left font-bold" onClick={() => sortColumn(column.key)}>{column.label}{column.unit ? ` (${column.unit})` : ""}{sort === column.key ? direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}<th scope="col" className="px-3">Profilo G2</th></tr></thead>
        <tbody>{sorted.map((row) => <tr key={row.name} className="border-t even:bg-muted/30">{columns.map((column) => {
          const value = row[column.key]
          const sign = typeof value === "number" && value > 0 && ["delta", "timeChange", "speedChange"].includes(column.key) ? "+" : ""
          const formatted = typeof value === "string" ? `${value}${row.incompleteWarmup ? "*" : ""}` : column.unit === "s" ? cronoNumber(value / 100) : cronoNumber(value, column.unit === "km/h" ? 1 : column.key === "order" ? 0 : 2)
          const rank = column.key === "first" ? row.firstRank : column.key === "total" ? row.totalRank : column.key === "best" ? row.bestRank : null
          return <td key={column.key} className={`px-3 py-3 ${column.key === "name" ? "font-bold" : ""} ${column.key === "delta" ? row.delta < 0 ? "text-emerald-700 dark:text-emerald-400" : row.delta > 0 ? "text-red-700 dark:text-red-400" : "" : ""}`}>{sign}{formatted}{rank !== null && <span className="ml-2 text-xs text-muted-foreground">{rank}°</span>}</td>
        })}<td className="px-3 py-3">{row.emoji} {row.emoji === "🚀" ? "Razzo" : "Treno"}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">* {rows.filter((row) => row.incompleteWarmup).map((row) => row.name).join(", ")}: riscaldamento incompleto perché arrivato in ritardo. Le posizioni e i profili restano riferiti a tutti i 14 partecipanti anche quando filtri o ordini.</p>
  </section>
}
