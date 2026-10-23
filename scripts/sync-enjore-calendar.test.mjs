import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { eventPatch, parseMatches, unknownTeams } from "./sync-enjore-calendar.mjs"

const html = readFileSync(new URL("./fixtures/enjore/calendar-2026-27.html", import.meta.url), "utf8")

test("parseMatches reads teams, score, place and Rome time from the printable calendar", () => {
  const matches = parseMatches(html)
  assert.equal(matches.length, 3)
  assert.equal(unknownTeams.size, 0)

  const played = matches.find((match) => match.enjore_id === "8209834")
  assert.deepEqual(
    {
      squadra_casa: played.squadra_casa,
      squadra_ospite: played.squadra_ospite,
      avversario: played.avversario,
      giocata: played.giocata,
      gol_casa: played.gol_casa,
      gol_ospite: played.gol_ospite,
      gol_nostri: played.gol_nostri,
      gol_avversario: played.gol_avversario,
      luogo: played.luogo,
      giornata: played.giornata,
      fase: played.fase,
      data_ora: played.data_ora,
    },
    {
      squadra_casa: "CIRC. PAL. MADAMA",
      squadra_ospite: "CIRC. CHIGI",
      avversario: "CIRC. PAL. MADAMA",
      giocata: true,
      gol_casa: 1,
      gol_ospite: 1,
      gol_nostri: 1,
      gol_avversario: 1,
      luogo: "ATLETICO 2000",
      giornata: 1,
      fase: "FASE_1",
      // 22:00 a Roma, ora legale.
      data_ora: "2026-10-22T20:00:00.000Z",
    },
  )

  const upcoming = matches.find((match) => match.enjore_id === "8209839")
  assert.equal(upcoming.giocata, false)
  assert.equal(upcoming.gol_nostri, null)
  // Alias del campo: "Romulea" diventa il nome canonico.
  assert.equal(upcoming.luogo, "SS Romulea")
  // 21:15 a Roma, ora solare.
  assert.equal(upcoming.data_ora, "2026-11-05T20:15:00.000Z")
})

test("eventPatch keeps only changed fields and ignores timestamp formatting", () => {
  const existing = {
    data_ora: "2026-11-05T20:15:00+00:00",
    luogo: "SS Romulea",
    note: null,
    giornata: 2,
  }
  assert.equal(
    eventPatch(existing, { data_ora: "2026-11-05T20:15:00.000Z", luogo: "SS Romulea", giornata: 2 }),
    null,
  )
  assert.deepEqual(
    eventPatch(existing, { data_ora: "2026-11-05T21:00:00.000Z", luogo: "SS Romulea", note: "Rinviata" }),
    { data_ora: "2026-11-05T21:00:00.000Z", note: "Rinviata" },
  )
})
