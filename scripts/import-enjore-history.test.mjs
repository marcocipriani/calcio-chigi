import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

import {
  buildImportRows,
  matchProfile,
  parseEnjoreTable,
} from "./import-enjore-history.mjs"

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/enjore/${name}`, import.meta.url), "utf8"))

const memberships = [
  { profile_id: "00000000-0000-0000-0000-000000000001", nome: "Marco", cognome: "Cipriani", category: "PLAYER", season_slug: "2025-2026" },
  { profile_id: "00000000-0000-0000-0000-000000000002", nome: "Carlo", cognome: "Mozzillo", category: "PLAYER", season_slug: "2025-2026" },
  { profile_id: "00000000-0000-0000-0000-000000000003", nome: "Luca", cognome: "Venezia", category: "PLAYER", season_slug: "2025-2026" },
]

const allResponses = [
  [263752, "score", "score-263752.json"],
  [263752, "top-player", "mvp-263752.json"],
  [263752, "discipline", "discipline-263752.json"],
  [265281, "score", "score-265281.json"],
  [265281, "top-player", "mvp-265281.json"],
  [265281, "discipline", "discipline-265281.json"],
  [265282, "score", "score-265282.json"],
  [265282, "top-player", "mvp-265282.json"],
  [265282, "discipline", "discipline-265282.json"],
  [265296, "score", "score-265296.json"],
  [265296, "top-player", "mvp-265296.json"],
  [265296, "discipline", "discipline-265296.json"],
  ["all", "score", "score-all.json"],
  ["all", "top-player", "top-player-all.json"],
  ["all", "discipline", "discipline-all.json"],
].map(([phaseId, classification, file]) => ({
  phaseId,
  classification,
  html: fixture(file).html,
}))

describe("parseEnjoreTable", () => {
  test("keeps only Circolo Chigi and reads both discipline columns", () => {
    const rows = parseEnjoreTable(fixture("discipline-263752.json").html, "discipline")

    assert.deepEqual(rows.find(({ name }) => name === "Mozzillo C."), {
      name: "Mozzillo C.",
      team: "CIRC. CHIGI",
      yellowCards: 2,
      redCards: 0,
    })
    assert.equal(rows.some(({ team }) => team === "VVF"), false)
  })
})

describe("matchProfile", () => {
  test("refuses ambiguous abbreviated names", () => {
    assert.throws(
      () => matchProfile("Rossi A.", [
        { profile_id: "1", nome: "Andrea", cognome: "Rossi", category: "PLAYER", season_slug: "2025-2026" },
        { profile_id: "2", nome: "Alessio", cognome: "Rossi", category: "PLAYER", season_slug: "2025-2026" },
      ], {}),
      /Ambiguous Enjore player/,
    )
  })
})

describe("buildImportRows", () => {
  test("builds phase rows only and is deterministic", () => {
    const input = { responses: allResponses, memberships, overrides: {} }
    const first = buildImportRows(input)
    const second = buildImportRows(input)

    assert.deepEqual(first, second)
    assert.equal(first.some(({ phaseKey }) => phaseKey === "ALL"), false)
    assert.deepEqual(first.find(({ phaseKey, profile_id }) => phaseKey === "FASE_1" && profile_id.endsWith("002")), {
      phaseKey: "FASE_1",
      profile_id: "00000000-0000-0000-0000-000000000002",
      goals: 1,
      mvp: 0,
      yellow_cards: 2,
      red_cards: 0,
    })
  })

  test("rejects phase totals that diverge from the all-phases standings", () => {
    const mismatched = allResponses.map((response) => ({ ...response }))
    mismatched.find(({ phaseId, classification }) => phaseId === "all" && classification === "score").html = fixture("score-all.json").html.replace(">8<", ">99<")

    assert.throws(
      () => buildImportRows({ responses: mismatched, memberships, overrides: {} }),
      /Enjore all-phases reconciliation failed/,
    )
  })
})
