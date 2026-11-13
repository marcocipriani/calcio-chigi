import { describe, expect, it } from "vitest"
import rows from "@/test/fixtures/crono-chigio.json"
import { cronoMetrics, cronoRank, sortCronoRows } from "./crono-chigio"

describe("CronoChigio", () => {
  it("calculates speeds using each segment distance", () => {
    expect(rows).toHaveLength(14)
    for (const row of rows) {
      const metrics = cronoMetrics(row, rows)
      expect(metrics.second).toBeGreaterThan(0)
      expect(metrics.secondSpeed).toBeGreaterThan(metrics.splitSpeed)
    }
    expect(cronoMetrics(rows[8], rows).secondSpeed).toBeCloseTo(30.20625, 2)
    expect(rows.filter((row) => row.incompleteWarmup).map((r) => r.name)).toEqual(["Atleta N"])
  })
  it("distinguishes relative initial strength from a stronger flying segment", () => {
    expect(rows.filter((r) => cronoMetrics(r, rows).emoji === "🚀").map((r) => r.name)).toEqual([
      "Atleta A", "Atleta C", "Atleta D", "Atleta G", "Atleta H", "Atleta K", "Atleta N",
    ])
    expect(rows.filter((r) => cronoMetrics(r, rows).emoji === "🚆")).toHaveLength(7)
    // Un atleta rapido in entrambi i tratti può avere un finale relativamente più forte.
    expect(cronoMetrics(rows[8], rows).emoji).toBe("🚆")
  })
  it("assigns ties to Treno and preserves profiles when all times scale equally", () => {
    const row = { name: "Test", first: 600, split: 200, total: 600, incompleteWarmup: false }
    expect(cronoMetrics(row, [row]).emoji).toBe("🚆")
    const group = [row, { ...row, split: 250 }]
    expect(cronoMetrics(row, group).emoji).toBe("🚀")
    const scaled = rows.map((r) => ({ ...r, first: r.first * 2, split: r.split * 2, total: r.total * 2 }))
    expect(scaled.map((r) => cronoMetrics(r, scaled).emoji)).toEqual(rows.map((r) => cronoMetrics(r, rows).emoji))
  })
  it("uses the whole group even when rendering one image", () => {
    // Cambiare il riferimento può cambiare il profilo: nelle immagini si usano sempre tutti i 14.
    expect(cronoMetrics(rows[0], rows).emoji).toBe("🚀")
    expect(cronoMetrics(rows[0], [rows[0], rows[13]]).emoji).toBe("🚆")
  })
  it("preserves podium and shared ranks", () => {
    expect(rows.filter((r) => cronoRank(rows, r.total) <= 3).map((r) => r.name)).toEqual(["Atleta F", "Atleta H", "Atleta I"])
    expect(cronoRank([rows[0], rows[0], rows[1]], rows[0].total)).toBe(2)
    expect(rows.filter((r) => cronoRank(rows, r.first, "first") <= 3).map((r) => r.name)).toEqual(["Atleta F", "Atleta G", "Atleta I"])
    expect(cronoRank(rows, rows[2].first, "first")).toBe(9)
    expect(cronoRank(rows, rows[11].first, "first")).toBe(9)
    expect(rows.filter((r) => cronoRank(rows, Math.min(r.first, r.total), "best") <= 3).map((r) => r.name)).toEqual(["Atleta G", "Atleta H", "Atleta I"])
    expect(cronoRank(rows, Math.min(rows[5].first, rows[5].total), "best")).toBe(4)
  })
})


describe("CronoChigio table", () => {
  it("sorts numeric times, best results and signed changes without mutating source", () => {
    const original = rows.map((row) => row.name)
    expect(sortCronoRows(rows, "best", "asc").slice(0, 3).map((row) => row.name)).toEqual(["Atleta I", "Atleta H", "Atleta G"])
    expect(sortCronoRows(rows, "delta", "asc")[0].name).toBe("Atleta A")
    expect(sortCronoRows(rows, "delta", "desc")[0].name).toBe("Atleta E")
    expect(sortCronoRows(rows, "secondSpeed", "desc")[0].name).toBe("Atleta I")
    expect(rows.map((row) => row.name)).toEqual(original)
  })
  it("preserves original order for ties and computes profiles before filtering", () => {
    const sorted = sortCronoRows(rows, "first", "desc")
    expect(sorted.filter((row) => row.first === 720).map((row) => row.name)).toEqual(["Atleta C", "Atleta L"])
    const rockets = sortCronoRows(rows, "name", "asc", "🚀")
    expect(rockets).toHaveLength(7)
    expect(rockets.find((row) => row.name === "Atleta N")?.totalRank).toBe(12)
    expect(sortCronoRows(rows, "order", "asc").map((row) => row.name)).toEqual(rows.map((row) => row.name))
  })
})
