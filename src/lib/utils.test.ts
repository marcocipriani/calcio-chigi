import { describe, expect, it } from "vitest"

import type { Event } from "@/lib/types"
import { ageGroupAt, applyCalendarChange, calculateStandings, isU35At, opponentOf, sortPlaces } from "@/lib/utils"

describe("U35 eligibility", () => {
  const referenceDate = new Date("2026-07-31T12:00:00+02:00")

  it("changes group on the thirty-fifth birthday", () => {
    expect(isU35At("1991-08-01", referenceDate)).toBe(true)
    expect(isU35At("1991-07-31", referenceDate)).toBe(false)
    expect(ageGroupAt("1991-07-31", referenceDate)).toBe("OVER_35")
  })

  it("does not classify missing, invalid, or future birth dates", () => {
    expect(ageGroupAt(null, referenceDate)).toBeNull()
    expect(ageGroupAt("invalid", referenceDate)).toBeNull()
    expect(ageGroupAt("2026-08-01", referenceDate)).toBeNull()
    expect(ageGroupAt("1991-07-31", new Date("invalid"))).toBeNull()
  })
})

describe("sortPlaces", () => {
  it("puts SS Romulea first, then alphabetical, without duplicates", () => {
    expect(
      sortPlaces(["VIGOR PERCONTI", null, "ss romulea", "C.S. CAVALIERI", "Vigor Perconti ", ""]),
    ).toEqual(["SS Romulea", "C.S. CAVALIERI", "VIGOR PERCONTI"])
  })
})

describe("opponentOf", () => {
  it("picks the non-Chigi side, whichever is home", () => {
    expect(opponentOf({ squadra_casa: "C. PAL. CHIGI", squadra_ospite: "PSICOLOGOL", avversario: "x" })).toBe("PSICOLOGOL")
    expect(opponentOf({ squadra_casa: "PSICOLOGOL", squadra_ospite: "Chigi", avversario: null })).toBe("PSICOLOGOL")
  })

  it("falls back to avversario without teams or Chigi", () => {
    expect(opponentOf({ squadra_casa: null, squadra_ospite: null, avversario: "Amici" })).toBe("Amici")
    expect(opponentOf({ squadra_casa: "A", squadra_ospite: "B", avversario: "A vs B" })).toBe("A vs B")
    expect(opponentOf({ squadra_casa: null, squadra_ospite: null, avversario: "" })).toBeNull()
  })
})

describe("applyCalendarChange", () => {
  const event = (id: string, data_ora: string, extra: Partial<Event> = {}): Event =>
    ({ id, tipo: "PARTITA", data_ora, squadra_casa: "CHIGI", squadra_ospite: "ALTRI", ...extra }) as Event
  const ids = (events: Event[]) => events.map(({ id }) => id)
  const a = event("a", "2026-11-01T20:00:00Z")
  const b = event("b", "2026-11-08T20:00:00Z")

  it("adds a match that becomes Chigi with an UPDATE, in date order", () => {
    const renamed = event("c", "2026-11-05T20:00:00Z")
    expect(ids(applyCalendarChange([a, b], { eventType: "UPDATE", new: renamed, old: { id: "c" } }))).toEqual(["a", "c", "b"])
  })

  it("drops a match that stops being Chigi", () => {
    const other = { ...a, squadra_casa: "X", squadra_ospite: "Y" }
    expect(ids(applyCalendarChange([a, b], { eventType: "UPDATE", new: other, old: { id: "a" } }))).toEqual(["b"])
  })

  it("ignores other teams' inserts and handles deletes", () => {
    const events = [a, b]
    const foreign = event("x", "2026-11-02T20:00:00Z", { squadra_casa: "X", squadra_ospite: "Y" })
    expect(applyCalendarChange(events, { eventType: "INSERT", new: foreign, old: {} })).toBe(events)
    expect(ids(applyCalendarChange(events, { eventType: "DELETE", new: {} as Event, old: { id: "a" } }))).toEqual(["b"])
  })

  it("moves an event when its date changes", () => {
    const moved = { ...a, data_ora: "2026-11-10T20:00:00Z" }
    expect(ids(applyCalendarChange([a, b], { eventType: "UPDATE", new: moved, old: { id: "a" } }))).toEqual(["b", "a"])
  })
})

describe("calculateStandings", () => {
  const teams = ["A", "B", "C", "D", "X", "Y", "Z"].map((nome) => ({ id: nome, nome }))
  const match = (casa: string, golCasa: number, golOspite: number, ospite: string) =>
    ({ id: `${casa}-${ospite}`, tipo: "PARTITA", giocata: true, squadra_casa: casa, squadra_ospite: ospite, gol_casa: golCasa, gol_ospite: golOspite }) as Event
  const order = (matches: Event[], names: string[]) =>
    calculateStandings(teams.filter(({ nome }) => names.includes(nome)), matches).map(({ teamData }) => teamData.nome)

  it("breaks a circular tie on overall goal difference, not head-to-head goals", () => {
    // Scontri diretti tutti a 3 punti; la differenza reti generale premia A.
    const matches = [match("A", 1, 0, "B"), match("B", 3, 0, "C"), match("C", 1, 0, "A"), match("A", 5, 0, "D"), match("B", 1, 0, "D"), match("C", 1, 0, "D")]
    expect(order(matches, ["A", "B", "C", "D"])).toEqual(["A", "B", "C", "D"])
  })

  it("puts fewer goals conceded before more goals scored", () => {
    const matches = [match("X", 1, 1, "Y"), match("X", 3, 1, "Z"), match("Y", 4, 2, "Z")]
    expect(order(matches, ["X", "Y", "Z"])).toEqual(["X", "Y", "Z"])
  })

  it("starts from the head-to-head among the tied teams", () => {
    // B ha la differenza reti migliore, ma A ha vinto lo scontro diretto.
    const matches = [match("A", 1, 0, "B"), match("B", 6, 0, "C")]
    expect(order(matches, ["A", "B", "C"])).toEqual(["A", "B", "C"])
  })
})
