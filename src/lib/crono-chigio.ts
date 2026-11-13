import type { SeasonPlayerDirectoryEntry } from "./season-statistics"

export type CronoResult = {
  name: string
  firstName?: string
  first: number
  split: number
  total: number
  incompleteWarmup: boolean
}

// Il profilo confronta i due tratti con il riferimento del gruppo, in centesimi.
export function cronoMetrics(row: CronoResult, group: readonly CronoResult[]) {
  const firstTotal = group.reduce((sum, result) => sum + result.split, 0)
  const secondTotal = group.reduce((sum, result) => sum + result.total - result.split, 0)
  const second = row.total - row.split
  return {
    second,
    delta: row.total - row.first,
    firstSpeed: 43.35 / (row.first / 100) * 3.6,
    splitSpeed: 16.5 / (row.split / 100) * 3.6,
    secondSpeed: 26.85 / (second / 100) * 3.6,
    totalSpeed: 43.35 / (row.total / 100) * 3.6,
    emoji: second * firstTotal > row.split * secondTotal ? "🚀" : "🚆",
    timeChange: (row.total / row.first - 1) * 100,
  }
}

export function cronoRank(rows: CronoResult[], time: number, field: "first" | "total" | "best" = "total") {
  return 1 + rows.filter((row) => (field === "best" ? Math.min(row.first, row.total) : row[field]) < time).length
}

export const cronoNumber = (value: number, digits = 2) =>
  value.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const CRONO_DISCLAIMER = "Tempi indicativi: cronometro su telefono poco affidabile, rilevazione manuale da un unico punto. Possibili imprecisioni; differenze minime non sono significative. Velocità medie stimate, non massime."

export type CronoSortKey = "order" | "name" | "first" | "total" | "best" | "split" | "second" | "delta" | "timeChange" | "firstSpeed" | "totalSpeed" | "splitSpeed" | "secondSpeed" | "speedChange"
export type CronoProfile = "all" | "🚀" | "🚆"

export function sortCronoRows(rows: CronoResult[], key: CronoSortKey, direction: "asc" | "desc", profile: CronoProfile = "all") {
  return rows.map((row, index) => ({
    ...row,
    ...cronoMetrics(row, rows),
    order: index + 1,
    best: Math.min(row.first, row.total),
    speedChange: (row.first / row.total - 1) * 100,
    firstRank: cronoRank(rows, row.first, "first"),
    totalRank: cronoRank(rows, row.total),
    bestRank: cronoRank(rows, Math.min(row.first, row.total), "best"),
  })).filter((row) => profile === "all" || row.emoji === profile).sort((left, right) => {
    const compared = key === "name"
      ? left.name.localeCompare(right.name, "it")
      : (left[key] as number) - (right[key] as number)
    return (direction === "asc" ? compared : -compared) || left.order - right.order
  })
}

export function cronoAthlete(row: CronoResult, players: readonly SeasonPlayerDirectoryEntry[]) {
  const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f'’\s-]/g, "").toLowerCase()
  const matches = players.filter((player) => normalize(player.cognome) === normalize(row.name) && (!row.firstName || normalize(player.nome) === normalize(row.firstName)))
  const player = matches.length === 1 ? matches[0] : undefined
  const name = player ? `${player.nome} ${player.cognome}` : [row.firstName, row.name].filter(Boolean).join(" ")
  return { name, avatarUrl: player?.avatar_url ?? undefined, initials: name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() }
}

export function cronoCsv(rows: ReturnType<typeof sortCronoRows>, players: readonly SeasonPlayerDirectoryEntry[]) {
  const records: (string | number)[][] = [[
    "Profilo G2", "Partenza", "Atleta", "Totale G1 (s)", "Posizione G1", "Media G1 (km/h)",
    "Totale G2 (s)", "Posizione G2", "Media G2 (km/h)", "1° tratto G2 (s)", "Media 1° tratto G2 (km/h)",
    "2° tratto G2 (s)", "Media 2° tratto G2 (km/h)", "Miglior totale (s)", "Posizione miglior totale",
    "Differenza (s)", "Variazione tempo (%)", "Variazione velocità (%)", "Nota",
  ], ...rows.map((row) => [
    row.emoji === "🚀" ? "Razzo" : "Treno", row.order, cronoAthlete(row, players).name,
    row.first / 100, row.firstRank, row.firstSpeed, row.total / 100, row.totalRank, row.totalSpeed,
    row.split / 100, row.splitSpeed, row.second / 100, row.secondSpeed, row.best / 100, row.bestRank,
    row.delta / 100, row.timeChange, row.speedChange, row.incompleteWarmup ? "Riscaldamento incompleto per arrivo in ritardo" : "",
  ])]
  return "\uFEFF" + records.map((record) => record.map((value) => {
    const text = typeof value === "number" ? value.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 2 }) : /^\s*[=+\-@]/.test(value) ? "'" + value : value
    return `"${text.replace(/"/g, '""')}"`
  }).join(";")).join("\r\n") + "\r\n"
}
