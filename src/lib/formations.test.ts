import { describe, expect, it } from "vitest"

import {
  buildMatchMessage,
  buildPersonalFormationMessage,
  isFormationBenchSlot,
  isOutsideDistinta,
  isUnderPlayer,
  u35Quota,
} from "@/lib/formations"

describe("isFormationBenchSlot", () => {
  it("keeps POR among starters and P1–P12 on the bench", () => {
    expect(isFormationBenchSlot("POR")).toBe(false)
    expect(isFormationBenchSlot("P1")).toBe(true)
    expect(isFormationBenchSlot("P9")).toBe(true)
    expect(isFormationBenchSlot("P10")).toBe(true)
    expect(isFormationBenchSlot("P12")).toBe(true)
    expect(isFormationBenchSlot("P13")).toBe(false)
    expect(isFormationBenchSlot("P0")).toBe(false)
  })
})

describe("isOutsideDistinta", () => {
  it("keeps starters and P1–P9 in the 20-row match sheet, P10–P12 out", () => {
    expect(isOutsideDistinta("POR")).toBe(false)
    expect(isOutsideDistinta("P1")).toBe(false)
    expect(isOutsideDistinta("P9")).toBe(false)
    expect(isOutsideDistinta("P10")).toBe(true)
    expect(isOutsideDistinta("P12")).toBe(true)
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
    ).toMatchObject({ field: 3, total: 5, fieldExceeded: false, totalExceeded: false })
    expect(
      u35Quota(
        [
          under("DC1"),
          under("DC2"),
          under("CC1"),
          under("P1"),
          under("P2"),
          under("P3"),
        ],
        matchDate,
      ),
    ).toMatchObject({ field: 3, total: 6, fieldExceeded: false, totalExceeded: true })
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

describe("buildMatchMessage", () => {
  // Senza offset: l'orario è nel fuso della macchina, il test vale ovunque.
  const event = {
    data_ora: "2026-10-01T21:00:00",
    tipo: "PARTITA" as const,
    luogo: "SS Romulea",
    squadra_casa: "CIRC. CHIGI",
    squadra_ospite: "TASSISTI",
  }
  const players = [
    { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE", birthDate: "2000-01-01", isStarter: true },
    { nome: "Marco", cognome: "Cipriani", role: "CENTROCAMPISTA", birthDate: "1994-05-05", isStarter: true },
    { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE", birthDate: "1980-01-01", isStarter: false },
  ]

  it("lists call-ups by surname with POR and U35 tags", () => {
    expect(
      buildMatchMessage(event, players, { lineup: false, shirtColor: "ROSSA" }),
    ).toBe(`⚽ INFO PARTITA per giovedì 01 ottobre vs TASSISTI

📍 SS Romulea https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9
🕘 Ritrovo 20:00, Calcio d’inizio 21:00

🔴 Maglia rossa

📋 CONVOCATI:
Leonardo Campoli
Marco Cipriani (U35)
Lorenzo Troiani (POR)`)
  })

  it("splits starters and bench in the lineup variant", () => {
    const message = buildMatchMessage(event, players, {
      lineup: true,
      shirtColor: "BLU",
    })

    expect(message).toContain("🔵 Maglia blu")
    expect(message).toContain(
      "🟢 TITOLARI:\nMarco Cipriani (U35)\nLorenzo Troiani (POR)\n\n🪑 PANCHINA:\nLeonardo Campoli",
    )
    expect(message).not.toContain("CONVOCATI")
  })

  it("drops U35 tags in friendlies, the link for unmapped fields and the shirt line without a colour", () => {
    const message = buildMatchMessage(
      { ...event, tipo: "AMICHEVOLE", luogo: "C.S. CAVALIERI" },
      players,
      { lineup: false },
    )

    expect(message).toContain("⚽ INFO AMICHEVOLE per giovedì 01 ottobre")
    expect(message).toContain("📍 C.S. CAVALIERI\n🕘")
    expect(message).not.toContain("(U35)")
    expect(message).toContain("Lorenzo Troiani (POR)")
    expect(message).not.toContain("Maglia")
  })

  it("sorts surnames with apostrophes and particles the way they are spoken", () => {
    const message = buildMatchMessage(
      event,
      [
        { nome: "Michele", cognome: "D'Oria" },
        { nome: "Andrea", cognome: "Di Mucci" },
        { nome: "Domenico", cognome: "Crisci" },
      ],
      { lineup: false },
    )

    expect(message).toContain(
      "📋 CONVOCATI:\nDomenico Crisci\nAndrea Di Mucci\nMichele D'Oria",
    )
  })

  it("survives missing role, birth date, place and players", () => {
    const message = buildMatchMessage(
      { ...event, luogo: null },
      [{ nome: "Luca", cognome: "Ursi", role: null, birthDate: null }],
      { lineup: false },
    )

    expect(message).toContain("📍 campo da definire\n🕘")
    expect(message).toContain("📋 CONVOCATI:\nLuca Ursi")
    expect(message).not.toContain("undefined")
    expect(message).not.toContain("(")
    expect(buildMatchMessage(event, [], { lineup: false })).toContain(
      "📋 CONVOCATI:\nAncora nessun convocato.",
    )
    expect(
      buildMatchMessage({ ...event, data_ora: null }, players, { lineup: false }),
    ).toBe("Partita senza data.")
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
