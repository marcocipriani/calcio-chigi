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
})
