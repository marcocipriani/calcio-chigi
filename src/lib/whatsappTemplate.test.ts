import { describe, expect, it } from "vitest"

import { genMsgWhatsApp } from "@/lib/whatsappTemplate"

describe("genMsgWhatsApp", () => {
  it("uses the match format with call-ups taken from PRESENTE answers", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-10-01T21:00:00",
        tipo: "AMICHEVOLE",
        squadra_casa: "CIRC. CHIGI",
        squadra_ospite: "RADIOTAXI 3570",
        luogo: "SS Romulea",
      },
      [
        {
          status: "PRESENTE",
          profiles: {
            nome: "Luca",
            cognome: "Limite",
            ruolo: "PORTIERE",
            data_nascita: "1991-06-24",
          },
        },
        {
          status: "ASSENTE",
          profiles: {
            nome: "Ugo",
            cognome: "Assente",
            ruolo: "DIFENSORE",
            data_nascita: "1980-01-01",
          },
        },
      ],
    )

    expect(message).toContain(
      "⚽ INFO AMICHEVOLE per giovedì 01 ottobre vs RADIOTAXI 3570",
    )
    expect(message).toContain("🕘 Ritrovo 20:00, Calcio d’inizio 21:00")
    expect(message).toContain("📋 CONVOCATI:\nLuca Limite (POR)")
    expect(message).not.toContain("Ugo Assente")
    expect(message).not.toContain("Maglia")
  })

  it("leaves staff out of the match call-ups even when they answered PRESENTE", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-10-22T21:15:00",
        tipo: "PARTITA",
        squadra_casa: "CIRC. PAL. MADAMA",
        squadra_ospite: "CIRC. CHIGI",
        luogo: "ATLETICO 2000",
      },
      [
        {
          status: "PRESENTE",
          profiles: { nome: "Mario", cognome: "Mister", ruolo: "ALLENATORE", is_staff: true },
        },
        {
          status: "PRESENTE",
          profiles: { nome: "Luca", cognome: "Ursi", ruolo: "DIFENSORE", data_nascita: "1980-01-01" },
        },
      ],
    )

    expect(message).toContain("📋 CONVOCATI:\nLuca Ursi")
    expect(message).not.toContain("Mario Mister")
  })

  it("keeps the training message with U35 groups", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-06-23T21:00:00",
        tipo: "ALLENAMENTO",
        luogo: "SS Romulea",
      },
      [
        {
          status: "PRESENTE",
          profiles: {
            nome: "Luca",
            cognome: "Limite",
            ruolo: "DIFENSORE",
            data_nascita: "1991-06-24",
          },
        },
      ],
    )

    expect(message).toContain("🏃‍♂️ INFO ALLENAMENTO per martedì 23 giugno")
    expect(message).toContain("Ritrovo ore 20:00 a SS Romulea")
    expect(message).toContain("Inizio allenamento ore 21:00")
    expect(message).toContain("Under 35:\nLuca Limite")
  })
})
