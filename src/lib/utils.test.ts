import { describe, expect, it } from "vitest"

import { ageGroupAt, isU35At, sortPlaces } from "@/lib/utils"

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
