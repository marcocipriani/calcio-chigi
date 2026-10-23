import { describe, expect, it } from "vitest"

import { disciplineByPlayer } from "@/lib/discipline"

const row = (profileId: string, eventDate: string, yellow = 0, red = 0) => ({ profileId, eventDate, yellow, red })

describe("disciplineByPlayer", () => {
  it("warns after two yellow cards", () => {
    const status = disciplineByPlayer([row("rossi", "2026-10-01", 1), row("rossi", "2026-10-08", 1), row("verdi", "2026-10-08")])
    expect(status.get("rossi")).toBe("DIFFIDATO")
    expect(status.has("verdi")).toBe(false)
  })

  it("suspends after a red card in the last match", () => {
    expect(disciplineByPlayer([row("rossi", "2026-10-08", 0, 1)]).get("rossi")).toBe("SQUALIFICATO")
  })

  it("suspends on the third yellow card reached in the last match", () => {
    const status = disciplineByPlayer([
      row("rossi", "2026-10-01", 1),
      row("rossi", "2026-10-08", 1),
      row("rossi", "2026-10-15", 1),
    ])
    expect(status.get("rossi")).toBe("SQUALIFICATO")
  })

  it("forgets suspensions already served", () => {
    const status = disciplineByPlayer([row("rossi", "2026-10-01", 0, 1), row("verdi", "2026-10-08")])
    expect(status.has("rossi")).toBe(false)
  })
})
