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
