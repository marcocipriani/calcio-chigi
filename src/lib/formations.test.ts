import { describe, expect, it } from "vitest"

import {
  buildOfficialFormationMessage,
  buildPersonalFormationMessage,
  isFormationBenchSlot,
  isUnderPlayer,
  u35Quota,
} from "@/lib/formations"

describe("isFormationBenchSlot", () => {
  it("keeps POR among starters and P1 on the bench", () => {
    expect(isFormationBenchSlot("POR")).toBe(false)
    expect(isFormationBenchSlot("P1")).toBe(true)
    expect(isFormationBenchSlot("P9")).toBe(true)
    expect(isFormationBenchSlot("P10")).toBe(false)
  })
})

describe("isUnderPlayer", () => {
  it("uses the match date instead of the current date", () => {
    expect(
      isUnderPlayer("1991-06-24", new Date("2026-06-23T21:15:00+02:00")),
    ).toBe(true)
    expect(
      isUnderPlayer("1991-06-23", new Date("2026-06-23T21:15:00+02:00")),
    ).toBe(false)
  })
})

describe("u35Quota", () => {
  const matchDate = new Date("2026-09-01T21:00:00+02:00")
  const under = (positionKey: string, role = "DIFENSORE") => ({
    birthDate: "2000-01-01",
    positionKey,
    role,
  })

  it("allows three U35 on field and four called up", () => {
    expect(
      u35Quota(
        [under("DC1"), under("DC2"), under("CC1"), under("P1")],
        matchDate,
      ),
    ).toEqual({
      field: 3,
      total: 4,
      fieldExceeded: false,
      totalExceeded: false,
      exceeded: false,
    })
  })

  it("reports field and total limits independently", () => {
    expect(
      u35Quota(
        [under("DC1"), under("DC2"), under("CC1"), under("ATT1")],
        matchDate,
      ),
    ).toMatchObject({ field: 4, total: 4, fieldExceeded: true, totalExceeded: false })
    expect(
      u35Quota(
        [under("DC1"), under("DC2"), under("CC1"), under("P1"), under("P2")],
        matchDate,
      ),
    ).toMatchObject({ field: 3, total: 5, fieldExceeded: false, totalExceeded: true })
  })

  it("does not count U35 goalkeepers", () => {
    expect(
      u35Quota(
        [
          under("POR", "PORTIERE"),
          under("DC1"),
          under("DC2"),
          under("CC1"),
          under("P1"),
        ],
        matchDate,
      ),
    ).toMatchObject({ field: 3, total: 4, exceeded: false })
  })
})

describe("buildOfficialFormationMessage", () => {
  it("keeps starters and bench separate with inline badges", () => {
    const message = buildOfficialFormationMessage(
      {
        data_ora: "2026-06-23T21:15:00+02:00",
        luogo: "Campo Vigor Perconti",
        squadra_casa: "CIRCOLO CHIGI",
        squadra_ospite: "PSICOLOGOL",
      },
      [
        {
          isStarter: true,
          nome: "Marco",
          cognome: "Portiere",
          role: "PORTIERE",
          birthDate: "1985-01-01",
        },
        {
          isStarter: false,
          nome: "Luca",
          cognome: "Under",
          role: "ATTACCANTE",
          birthDate: "1998-01-01",
        },
      ],
    )

    expect(message).toContain("TITOLARI")
    expect(message).toContain("Marco Portiere [PORTIERE]")
    expect(message).toContain("PANCHINA")
    expect(message).toContain("Luca Under [UNDER]")
  })
})

describe("buildPersonalFormationMessage", () => {
  it("groups selected players by formation department", () => {
    expect(
      buildPersonalFormationMessage("4-3-3", "BLU", [
        { nome: "Marco", cognome: "Rossi", positionKey: "POR" },
        { nome: "Gianluca", cognome: "Menichini", positionKey: "DC1" },
        { nome: "Elio", cognome: "Dorbolò", positionKey: "CC" },
        { nome: "Luca", cognome: "Palladino", positionKey: "ATT" },
      ]),
    ).toBe(`⚽ LA MIA FORMAZIONE · 4-3-3

🧤 PORTIERE
Marco Rossi

🛡️ DIFESA
Gianluca Menichini

⚙️ CENTROCAMPO
Elio Dorbolò

🎯 ATTACCO
Luca Palladino

🔵 Maglia blu`)
  })

  it("omits empty departments and keeps bench separate", () => {
    const message = buildPersonalFormationMessage("4-4-2", "ROSSA", [
      { nome: "Luca", cognome: "Palladino", positionKey: "ATT1" },
      { nome: "Andrea", cognome: "Fontana", positionKey: "P1" },
    ])

    expect(message).not.toContain("PORTIERE")
    expect(message).toContain("🎯 ATTACCO\nLuca Palladino")
    expect(message).toContain("🪑 PANCHINA\nAndrea Fontana")
    expect(message).toContain("🔴 Maglia rossa")
  })
})
