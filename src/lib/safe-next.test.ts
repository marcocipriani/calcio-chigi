import { describe, expect, it } from "vitest"

import { safeNext } from "./safe-next"

describe("safeNext", () => {
  it("tiene i percorsi interni", () => {
    expect(safeNext("/maglie")).toBe("/maglie")
    expect(safeNext("/giocatore/1?x=2")).toBe("/giocatore/1?x=2")
  })

  it("scarta host esterni e valori vuoti", () => {
    for (const value of [null, "", "maglie", "//evil.com", "/\\evil.com", "https://evil.com"]) {
      expect(safeNext(value)).toBe("/")
    }
  })
})
