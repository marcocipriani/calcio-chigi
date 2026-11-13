import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { validateCronoResults } from "./import-crono-chigio.mjs"
const rows = JSON.parse(readFileSync(new URL("../src/test/fixtures/crono-chigio.json", import.meta.url)))
test("accepts fictional valid data and rejects malformed private imports", () => {
  assert.equal(validateCronoResults(rows).length, 14)
  assert.throws(() => validateCronoResults(rows.slice(1)), /14 risultati/)
  assert.throws(() => validateCronoResults([{ ...rows[0], split: rows[0].total }, ...rows.slice(1)]), /totale deve superare/)
  assert.throws(() => validateCronoResults([{ ...rows[0], first: 1.5 }, ...rows.slice(1)]), /Tempi non validi/)
  assert.throws(() => validateCronoResults([rows[0], rows[0], ...rows.slice(2)]), /duplicati/)
})
