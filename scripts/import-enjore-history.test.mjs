import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"

import {
  buildImportRows,
  loadDotEnv,
  matchProfile,
  parseArgs,
  parseEnjoreTable,
  resolveImportConfig,
  runImport,
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

  test("refuses discipline standings whose card headers are swapped", () => {
    const swappedHeaders = fixture("discipline-263752.json").html
      .replace('title="Ammonizioni">A</div><div class="col-data" title="Espulsioni">ESP', 'title="Espulsioni">ESP</div><div class="col-data" title="Ammonizioni">A')

    assert.throws(
      () => parseEnjoreTable(swappedHeaders, "discipline"),
      /discipline headers/,
    )
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

  test("uses normalized local-name overrides to resolve a genuine collision", () => {
    const candidates = [
      { profile_id: "1", nome: "Michele", cognome: "D'Oria", category: "PLAYER", season_slug: "2025-2026" },
      { profile_id: "2", nome: "Marco", cognome: "D'Oria", category: "PLAYER", season_slug: "2025-2026" },
    ]

    assert.deepEqual(
      matchProfile("D’Oria M.", candidates, { "d oria m": "Michele D’Oria" }),
      { profile_id: "1", nome: "Michele", cognome: "D'Oria" },
    )
  })

  test("refuses unresolved names and excludes wrong memberships", () => {
    const unavailable = [
      { profile_id: "1", nome: "Andrea", cognome: "Rossi", category: "STAFF", season_slug: "2025-2026" },
      { profile_id: "2", nome: "Alessio", cognome: "Rossi", category: "PLAYER", season_slug: "2026-2027" },
    ]

    assert.throws(() => matchProfile("Rossi A.", unavailable, {}), /Unresolved Enjore player/)
  })
})

describe("buildImportRows", () => {
  test("builds phase rows only and is deterministic", () => {
    const input = { responses: allResponses, memberships, overrides: {} }
    const first = buildImportRows(input)
    const second = buildImportRows(input)

    assert.deepEqual(first, second)
    assert.equal(first.some(({ phase_key }) => phase_key === "ALL"), false)
    assert.deepEqual(first.find(({ phase_key, profile_id }) => phase_key === "FASE_1" && profile_id.endsWith("002")), {
      phase_key: "FASE_1",
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

  test("rejects all-phases standings that swap yellow and red cards", () => {
    const mismatched = allResponses.map((response) => ({ ...response }))
    mismatched.find(({ phaseId, classification }) => phaseId === "all" && classification === "discipline").html = fixture("discipline-all.json").html
      .replace('<small>1</small></div><div class="col-data val-general"><small>0</small>', '<small>0</small></div><div class="col-data val-general"><small>1</small>')
      .replace('<small>2</small></div><div class="col-data val-general"><small>1</small>', '<small>1</small></div><div class="col-data val-general"><small>2</small>')

    assert.throws(
      () => buildImportRows({ responses: mismatched, memberships, overrides: {} }),
      /Enjore all-phases reconciliation failed for discipline.*yellowCards/,
    )
  })
})

describe("runImport", () => {
  test("defaults to dry-run without invoking the historical RPC", async () => {
    const harness = createImportHarness()

    await runImport(harness.options())

    assert.equal(harness.rpcCalls.length, 0)
    assert.equal(harness.events.filter((event) => event.startsWith("fetch:")).length, 15)
    assert.equal(harness.events.indexOf("client") > harness.events.lastIndexOf("fetch:all:discipline"), true)
    assert.match(harness.logs[0], /^Dry-run:/)
  })

  test("rejects invalid all-phase totals before creating a database client", async () => {
    const harness = createImportHarness()
    harness.payloads.set("all:score", fixture("score-all.json").html.replace(">8<", ">99<"))

    await assert.rejects(() => runImport(harness.options()), /Enjore all-phases reconciliation failed/)

    assert.equal(harness.events.includes("client"), false)
    assert.equal(harness.rpcCalls.length, 0)
  })

  test("rejects missing credentials before creating a database client", async () => {
    const harness = createImportHarness()
    const options = harness.options()
    options.env = {}

    await assert.rejects(() => runImport(options), /Servono URL Supabase e service role key/)

    assert.equal(harness.events.includes("client"), false)
    assert.equal(harness.rpcCalls.length, 0)
  })

  test("applies one RPC with the exact database row shape", async () => {
    const harness = createImportHarness()

    await runImport(harness.options(["--apply"]))

    assert.equal(harness.rpcCalls.length, 1)
    assert.deepEqual(harness.rpcCalls[0], ["import_historical_player_stats", {
      p_season_slug: "2025-2026",
      p_source_url: "https://asicalciolazio.enjore.com/it/t-player-stats/113994/campionato-asi-over-35_artimestieri/",
      p_rows: [
        { phase_key: "FASE_1", profile_id: "00000000-0000-0000-0000-000000000001", goals: 3, mvp: 2, yellow_cards: 0, red_cards: 0 },
        { phase_key: "FASE_1", profile_id: "00000000-0000-0000-0000-000000000002", goals: 1, mvp: 0, yellow_cards: 2, red_cards: 0 },
        { phase_key: "FASE_2_CALCIATORI", profile_id: "00000000-0000-0000-0000-000000000001", goals: 4, mvp: 0, yellow_cards: 1, red_cards: 0 },
        { phase_key: "FASE_2_CALCIATORI", profile_id: "00000000-0000-0000-0000-000000000002", goals: 0, mvp: 1, yellow_cards: 0, red_cards: 0 },
        { phase_key: "FASE_2_PROFESSIONISTI", profile_id: "00000000-0000-0000-0000-000000000001", goals: 0, mvp: 1, yellow_cards: 0, red_cards: 0 },
        { phase_key: "FASE_2_PROFESSIONISTI", profile_id: "00000000-0000-0000-0000-000000000002", goals: 2, mvp: 0, yellow_cards: 0, red_cards: 1 },
        { phase_key: "COPPA_LAZIO_PROFESSIONISTI", profile_id: "00000000-0000-0000-0000-000000000001", goals: 1, mvp: 0, yellow_cards: 0, red_cards: 0 },
        { phase_key: "COPPA_LAZIO_PROFESSIONISTI", profile_id: "00000000-0000-0000-0000-000000000002", goals: 0, mvp: 2, yellow_cards: 0, red_cards: 0 },
        { phase_key: "COPPA_LAZIO_PROFESSIONISTI", profile_id: "00000000-0000-0000-0000-000000000003", goals: 0, mvp: 0, yellow_cards: 0, red_cards: 0 },
      ],
    }])
    assert.match(harness.logs[0], /^Apply:/)
    assert.equal(harness.logs.some((line) => line.startsWith("Dry-run:")), false)
  })
})

describe("CLI configuration", () => {
  test("parses dry-run defaults and deterministic apply overrides", () => {
    assert.deepEqual(parseArgs([]), { apply: false })
    assert.deepEqual(
      parseArgs(["--apply", "--url=https://cli.supabase.test", "--service-key=cli-key"]),
      { apply: true, url: "https://cli.supabase.test", serviceKey: "cli-key" },
    )
    assert.deepEqual(parseArgs(["--apply", "--dry-run"]), { apply: false })
    assert.throws(() => parseArgs(["--unknown"]), /Uso:/)
  })

  test("loads .env.local without replacing existing values and lets CLI win", () => {
    const directory = mkdtempSync(join(tmpdir(), "enjore-history-test-"))
    const path = join(directory, ".env.local")
    const env = { SUPABASE_SERVICE_ROLE_KEY: "already-set" }
    try {
      writeFileSync(path, "SUPABASE_URL=https://env.supabase.test\nSUPABASE_SERVICE_ROLE_KEY=from-file\n")
      loadDotEnv(path, env)

      assert.deepEqual(resolveImportConfig(parseArgs([]), env), {
        url: "https://env.supabase.test",
        serviceKey: "already-set",
      })
      assert.deepEqual(
        resolveImportConfig(parseArgs(["--url=https://cli.supabase.test", "--service-key=cli-key"]), env),
        { url: "https://cli.supabase.test", serviceKey: "cli-key" },
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("does not start the CLI or fetch when the module is imported", () => {
    const result = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      "globalThis.fetch = () => { throw new Error('fetch must not run on import') }; await import('./scripts/import-enjore-history.mjs'); console.log('imported')",
    ], { cwd: process.cwd(), encoding: "utf8" })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), "imported")
  })
})

function createImportHarness() {
  const events = []
  const logs = []
  const rpcCalls = []
  const payloads = new Map(allResponses.map((response) => [
    `${response.phaseId}:${response.classification}`,
    response.html,
  ]))
  const fetchImpl = async (_url, request) => {
    const params = new URLSearchParams(request.body)
    const key = `${params.get("round")}:${params.get("type")}`
    events.push(`fetch:${key}`)
    return { ok: true, json: async () => ({ html: payloads.get(key) }) }
  }
  const createClientImpl = () => {
    events.push("client")
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: memberships, error: null }),
          }),
        }),
      }),
      rpc: async (...args) => {
        rpcCalls.push(args)
        return { error: null }
      },
    }
  }
  return {
    events,
    logs,
    payloads,
    rpcCalls,
    options: (args = []) => ({
      args,
      env: { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
      fetchImpl,
      createClientImpl,
      log: (line) => logs.push(line),
    }),
  }
}
