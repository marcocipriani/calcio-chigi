import { describe, expect, it } from "vitest"

import { genMsgWhatsApp } from "@/lib/whatsappTemplate"

describe("genMsgWhatsApp", () => {
  it("classifies U35 players on the event date", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-06-23T21:00:00+02:00",
        tipo: "PARTITA",
        squadra_casa: "CIRCOLO CHIGI",
        squadra_ospite: "AVVERSARI",
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

    expect(message).toContain("Under 35:\nLuca Limite")
  })

  it("announces a friendly as a match against the opponent", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-10-01T21:00:00+02:00",
        tipo: "AMICHEVOLE",
        squadra_casa: "CIRC. CHIGI",
        squadra_ospite: "RADIOTAXI 3570",
        luogo: "SS Romulea",
      },
      [],
    )

    expect(message).toContain("INFO AMICHEVOLE per giovedì 1 ottobre vs RADIOTAXI 3570")
    expect(message).toContain("SS Romulea (giochiamo in casa)")
  })
})
