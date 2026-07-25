import { describe, expect, it } from "vitest"

import { buildOfficialFormationMessage } from "@/lib/formations"

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
