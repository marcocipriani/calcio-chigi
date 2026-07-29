#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js"
import { existsSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export const PHASES = {
  263752: "FASE_1",
  265281: "FASE_2_CALCIATORI",
  265282: "FASE_2_PROFESSIONISTI",
  265296: "COPPA_LAZIO_PROFESSIONISTI",
}

const CLASSIFICATIONS = ["score", "top-player", "discipline"]
const SEASON_SLUG = "2025-2026"
const TEAM = "CIRC. CHIGI"
const SOURCE_URL = "https://asicalciolazio.enjore.com/it/t-player-stats/113994/campionato-asi-over-35_artimestieri/"
const ENJORE_ENDPOINT = "https://asicalciolazio.enjore.com/system/include/ajax/public/league.php"
const EXPLICIT_OVERRIDES = {}

export function parseEnjoreTable(html, classification) {
  if (!CLASSIFICATIONS.includes(classification)) {
    throw new Error(`Unsupported Enjore classification: ${classification}`)
  }
  if (typeof html !== "string" || !html.includes("tables-container")) {
    throw new Error("Unexpected Enjore response shape: standings table missing")
  }

  const participants = [...html.matchAll(/<div class=["']participant-name[^"']*["'][^>]*>\s*([\s\S]*?)<small[^>]*>([\s\S]*?)<\/small>/gi)]
    .map(([, name, team]) => ({ name: cleanText(name), team: normalizeTeam(team) }))
  const rightTableStart = html.search(/<div class=["']right-table[^"']*["'][^>]*>/i)
  if (participants.length === 0 || rightTableStart === -1) {
    throw new Error("Unexpected Enjore response shape: standing rows missing")
  }
  const rightTable = html.slice(rightTableStart)
  if (classification === "discipline") {
    const firstValueRow = rightTable.search(/<div class=["']tables-body tables-row[^"']*["'][^>]*>/i)
    const headers = [...rightTable.slice(0, firstValueRow).matchAll(/<div class=["'][^"']*\bcol-data\b[^"']*["'][^>]*title=["']([^"']+)["'][^>]*>/gi)]
      .map(([, title]) => cleanText(title))
    const expectedHeaders = ["Ammonizioni", "Espulsioni"]
    if (headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index])) {
      throw new Error("Unexpected Enjore discipline headers")
    }
  }

  const valueRows = rightTable
    .split(/<div class=["']tables-body tables-row[^"']*["'][^>]*>/i)
    .slice(1)
    .map((row) => [...row.matchAll(/<div class=["'][^"']*\bcol-data\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map(([, value]) => nonNegativeInteger(value)))

  if (participants.length !== valueRows.length || valueRows.some((row) => row.length !== (classification === "discipline" ? 2 : 1))) {
    throw new Error("Unexpected Enjore response shape: standings values do not align")
  }

  return participants.flatMap(({ name, team }, index) => {
    if (team !== TEAM) return []
    if (classification === "discipline") {
      return [{ name, team, yellowCards: valueRows[index][0], redCards: valueRows[index][1] }]
    }
    return [classification === "score"
      ? { name, team, goals: valueRows[index][0] }
      : { name, team, mvp: valueRows[index][0] }]
  })
}

export function matchProfile(enjoreName, memberships, overrides) {
  const candidates = memberships
    .filter(isHistoricalPlayerMembership)
    .map(profileFromMembership)
    .filter(Boolean)
  const override = readOverride(overrides, enjoreName)
  const matches = override
    ? candidates.filter((candidate) => normalizeFullName(candidate) === normalizeName(override))
    : candidates.filter((candidate) => matchesAbbreviation(enjoreName, candidate))

  if (matches.length === 0) {
    throw new Error(`Unresolved Enjore player: ${enjoreName}`)
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous Enjore player: ${enjoreName}`)
  }
  return matches[0]
}

export function buildImportRows({ responses, memberships, overrides = {} }) {
  const parsed = prepareResponses(responses)
  return buildImportPlan({ parsed, memberships, overrides }).rows
}

function buildImportPlan({ parsed, memberships, overrides }) {
  const records = []

  for (const [phaseId, phaseKey] of Object.entries(PHASES)) {
    const playerStats = new Map()
    for (const classification of CLASSIFICATIONS) {
      const response = parsed.get(responseKey(phaseId, classification))
      for (const standing of response.rows) {
        const key = normalizeName(standing.name)
        const current = playerStats.get(key) ?? {
          sourceName: standing.name,
          goals: 0,
          mvp: 0,
          yellow_cards: 0,
          red_cards: 0,
        }
        if (classification === "score") current.goals = standing.goals
        if (classification === "top-player") current.mvp = standing.mvp
        if (classification === "discipline") {
          current.yellow_cards = standing.yellowCards
          current.red_cards = standing.redCards
        }
        playerStats.set(key, current)
      }
    }

    for (const player of playerStats.values()) {
      const profile = matchProfile(player.sourceName, memberships, overrides)
      records.push({
        sourceName: player.sourceName,
        localName: `${profile.nome} ${profile.cognome}`.trim(),
        phaseKey,
        profile_id: profile.profile_id,
        goals: player.goals,
        mvp: player.mvp,
        yellow_cards: player.yellow_cards,
        red_cards: player.red_cards,
      })
    }
  }

  records.sort((left, right) =>
    phaseOrder(left.phaseKey) - phaseOrder(right.phaseKey) ||
    left.profile_id.localeCompare(right.profile_id),
  )
  return {
    records,
    rows: records.map((record) => ({
      phase_key: record.phaseKey,
      profile_id: record.profile_id,
      goals: record.goals,
      mvp: record.mvp,
      yellow_cards: record.yellow_cards,
      red_cards: record.red_cards,
    })),
  }
}

function prepareResponses(responses) {
  const parsed = validateAndParseResponses(responses)
  reconcileAllPhases(parsed)
  return parsed
}

function validateAndParseResponses(responses) {
  if (!Array.isArray(responses) || responses.length !== 15) {
    throw new Error("Expected exactly 15 Enjore responses")
  }
  const parsed = new Map()
  for (const response of responses) {
    const phaseId = String(response?.phaseId)
    const classification = response?.classification
    if (!(phaseId in PHASES) && phaseId !== "all") {
      throw new Error(`Unexpected Enjore phase: ${phaseId}`)
    }
    const key = responseKey(phaseId, classification)
    if (parsed.has(key)) throw new Error(`Duplicate Enjore response: ${key}`)
    parsed.set(key, { ...response, rows: parseEnjoreTable(response?.html, classification) })
  }
  for (const phaseId of [...Object.keys(PHASES), "all"]) {
    for (const classification of CLASSIFICATIONS) {
      if (!parsed.has(responseKey(phaseId, classification))) {
        throw new Error(`Missing Enjore response: ${responseKey(phaseId, classification)}`)
      }
    }
  }
  return parsed
}

function reconcileAllPhases(parsed) {
  for (const classification of CLASSIFICATIONS) {
    const phaseTotals = new Map()
    for (const phaseId of Object.keys(PHASES)) {
      for (const standing of parsed.get(responseKey(phaseId, classification)).rows) {
        const key = normalizeName(standing.name)
        const totals = phaseTotals.get(key) ?? {}
        for (const metric of standingMetrics(classification)) {
          totals[metric] = (totals[metric] ?? 0) + standing[metric]
        }
        phaseTotals.set(key, totals)
      }
    }
    const allTotals = new Map(parsed.get(responseKey("all", classification)).rows.map((standing) => [normalizeName(standing.name), standing]))
    const playerKeys = new Set([...phaseTotals.keys(), ...allTotals.keys()])
    for (const key of playerKeys) {
      for (const metric of standingMetrics(classification)) {
        if ((phaseTotals.get(key)?.[metric] ?? 0) !== (allTotals.get(key)?.[metric] ?? 0)) {
          throw new Error(`Enjore all-phases reconciliation failed for ${classification} ${metric}: ${key}`)
        }
      }
    }
  }
}

function standingMetrics(classification) {
  if (classification === "score") return ["goals"]
  if (classification === "top-player") return ["mvp"]
  return ["yellowCards", "redCards"]
}

function isHistoricalPlayerMembership(membership) {
  const seasonSlug = membership?.season_slug ?? membership?.seasons?.slug
  return membership?.category === "PLAYER" && seasonSlug === SEASON_SLUG
}

function profileFromMembership(membership) {
  const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles ?? membership.profile ?? membership
  const profileId = profile?.id ?? membership.profile_id
  const nome = profile?.nome ?? membership.nome
  const cognome = profile?.cognome ?? membership.cognome
  return profileId && nome && cognome ? { profile_id: profileId, nome, cognome } : null
}

function matchesAbbreviation(enjoreName, profile) {
  const words = normalizeName(enjoreName).split(" ")
  if (words.length < 2) return false
  const initial = words.at(-1)
  const surname = words.slice(0, -1).join(" ")
  return normalizeName(profile.cognome) === surname && normalizeName(profile.nome).startsWith(initial)
}

function readOverride(overrides, enjoreName) {
  const key = normalizeName(enjoreName)
  if (overrides instanceof Map) return overrides.get(key) ?? overrides.get(enjoreName)
  return overrides?.[key] ?? overrides?.[enjoreName]
}

function normalizeFullName(profile) {
  return normalizeName(`${profile.nome} ${profile.cognome}`)
}

function normalizeName(value) {
  return decodeEntities(stripTags(String(value ?? "")))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase()
}

function normalizeTeam(value) {
  return cleanText(value).toUpperCase()
}

function cleanText(value) {
  return decodeEntities(stripTags(String(value ?? "")))
    .replace(/\s+/g, " ")
    .trim()
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, " ")
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function nonNegativeInteger(value) {
  const text = cleanText(value)
  if (!/^\d+$/.test(text)) throw new Error(`Unexpected Enjore statistic value: ${text || "empty"}`)
  return Number.parseInt(text, 10)
}

function responseKey(phaseId, classification) {
  return `${phaseId}:${classification}`
}

function phaseOrder(phaseKey) {
  return Object.values(PHASES).indexOf(phaseKey)
}

export async function runImport({
  args = [],
  env = process.env,
  fetchImpl = fetch,
  createClientImpl = createClient,
  log = console.log,
} = {}) {
  const options = parseArgs(args)
  const responses = await fetchAllResponses(fetchImpl)
  const parsed = prepareResponses(responses)

  const { url, serviceKey } = resolveImportConfig(options, env)
  if (!url || !serviceKey) throw new Error("Servono URL Supabase e service role key")

  const supabase = createClientImpl(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: memberships, error: membershipsError } = await supabase
    .from("season_memberships")
    .select("profile_id,category,seasons!inner(slug),profiles!season_memberships_profile_id_fkey!inner(id,nome,cognome)")
    .eq("category", "PLAYER")
    .eq("seasons.slug", SEASON_SLUG)
  if (membershipsError) throw membershipsError

  const plan = buildImportPlan({
    parsed,
    memberships: memberships ?? [],
    overrides: EXPLICIT_OVERRIDES,
  })
  printPlan(plan, { apply: options.apply, log })
  if (!options.apply) return { applied: false, rows: plan.rows }

  const { error } = await supabase.rpc("import_historical_player_stats", {
    p_season_slug: SEASON_SLUG,
    p_source_url: SOURCE_URL,
    p_rows: plan.rows,
  })
  if (error) throw error
  log(`Import applicato: ${plan.rows.length} righe.`)
  return { applied: true, rows: plan.rows }
}

async function fetchAllResponses(fetchImpl) {
  const requests = []
  for (const phaseId of [...Object.keys(PHASES), "all"]) {
    for (const classification of CLASSIFICATIONS) {
      requests.push(fetchEnjoreResponse(phaseId, classification, fetchImpl))
    }
  }
  return Promise.all(requests)
}

async function fetchEnjoreResponse(phaseId, classification, fetchImpl) {
  const body = new URLSearchParams({
    op: "19",
    tid: "113994",
    round: String(phaseId),
    type: classification,
  })
  const response = await fetchImpl(ENJORE_ENDPOINT, {
    method: "POST",
    headers: {
      "accept-language": "it-IT,it;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "calcio-chigi-history-import/1.0",
    },
    body,
  })
  if (!response.ok) throw new Error(`Impossibile scaricare Enjore ${phaseId}/${classification}: ${response.status} ${response.statusText}`)
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`Risposta Enjore non JSON per ${phaseId}/${classification}`)
  }
  if (!payload || typeof payload.html !== "string") {
    throw new Error(`Risposta Enjore senza tabella per ${phaseId}/${classification}`)
  }
  return { phaseId, classification, html: payload.html }
}

export function parseArgs(args) {
  const options = { apply: false }
  for (const arg of args) {
    if (arg === "--apply") options.apply = true
    else if (arg === "--dry-run") options.apply = false
    else if (arg.startsWith("--url=")) options.url = arg.slice(6)
    else if (arg.startsWith("--service-key=")) options.serviceKey = arg.slice(14)
    else throw new Error("Uso: npm run import:enjore-history -- [--dry-run|--apply]")
  }
  return options
}

export function resolveImportConfig(options, env) {
  return {
    url: options.url || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: options.serviceKey || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  }
}

export function loadDotEnv(path, env = process.env) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match || env[match[1]]) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    env[match[1]] = value
  }
  return env
}

function printPlan(plan, { apply, log }) {
  log(`${apply ? "Apply" : "Dry-run"}: ${plan.rows.length} righe storiche validate${apply ? "." : "; nessuna scrittura database."}`)
  for (const record of plan.records) {
    log(`${record.phaseKey} ${record.sourceName} -> ${record.localName} (${record.profile_id}): G=${record.goals} MVP=${record.mvp} A=${record.yellow_cards} ESP=${record.red_cards}`)
  }
  for (const phaseKey of Object.values(PHASES)) {
    const total = plan.rows
      .filter((row) => row.phase_key === phaseKey)
      .reduce((sum, row) => ({
        goals: sum.goals + row.goals,
        mvp: sum.mvp + row.mvp,
        yellowCards: sum.yellowCards + row.yellow_cards,
        redCards: sum.redCards + row.red_cards,
      }), { goals: 0, mvp: 0, yellowCards: 0, redCards: 0 })
    log(`${phaseKey}: G=${total.goals} MVP=${total.mvp} A=${total.yellowCards} ESP=${total.redCards}`)
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  loadDotEnv(".env.local")
  runImport({ args: process.argv.slice(2) }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
