#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js"
import ExcelJS from "exceljs"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const FINAL_YES = /\bOK\b|\bSI\b|\bSÌ\b/i
const FINAL_MAYBE = /\bIN FORSE\b|\bFORSE\b/i
const FINAL_NO = /\bNO\b/i
const CONTACT_ONLY = /\bCHIESTO\b|\bDA RISENTIRE\b|\bSENTIR|\bRICONTATT|\bRISENTIAMO\b/i
const DEPARTMENT_TAGS = new Set(["DPC", "SNA", "DIP"])
const MEMBERSHIP_OVERRIDES = new Map([
  ["elio dorbolo", { category: "PLAYER" }],
  [
    "maria carla menichini",
    { category: "STAFF", staff_function: "Presidente" },
  ],
])

export function normalizePersonKey(nome, cognome) {
  return `${nome ?? ""} ${cognome ?? ""}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase()
}

export function mapDepartmentFlags(rawTag) {
  const tag = cleanText(rawTag).toUpperCase()
  return {
    is_external: tag === "EXT",
    is_aggregated: tag === "AGG",
    department: DEPARTMENT_TAGS.has(tag) ? tag : null,
  }
}

export function mapExcelMembership({
  adhesion,
  note,
  excelOnly,
}) {
  const adhesionText = cleanText(adhesion)
  const noteText = cleanText(note)
  const evidence = `${noteText} ${adhesionText}`.trim()
  const isStaff = /\bDIRIGENTE\b/i.test(evidence)
  const trainingOnly = /\bSOLO ALLENAMENTI\b/i.test(evidence)

  let status
  if (FINAL_YES.test(adhesionText)) status = "YES"
  else if (FINAL_MAYBE.test(evidence)) status = "MAYBE"
  else if (FINAL_NO.test(adhesionText)) status = "NO"
  else if (excelOnly || CONTACT_ONLY.test(evidence)) {
    status = excelOnly ? "INTERESTED" : "PENDING"
  } else {
    status = "PENDING"
  }

  if (trainingOnly && excelOnly) status = "INTERESTED"

  return {
    status,
    category: isStaff ? "STAFF" : "PLAYER",
    training_only: trainingOnly,
  }
}

export function buildGlobalPatch(existing, excel) {
  if (!existing) {
    return compactObject({
      nome: cleanText(excel.nome),
      cognome: cleanText(excel.cognome),
      data_nascita: excel.data_nascita || null,
      avatar_url: null,
    })
  }

  return {
    nome: existing.nome || cleanText(excel.nome),
    cognome: existing.cognome || cleanText(excel.cognome),
    data_nascita: existing.data_nascita || excel.data_nascita || null,
    avatar_url: existing.avatar_url || null,
  }
}

export function buildImportPlan(excelRows, dbProfiles) {
  const dbByKey = new Map()
  const duplicateDbKeys = new Set()

  for (const profile of dbProfiles) {
    const key = normalizePersonKey(profile.nome, profile.cognome)
    if (dbByKey.has(key)) duplicateDbKeys.add(key)
    dbByKey.set(key, profile)
  }

  const seenExcelKeys = new Set()
  const conflicts = []
  const people = []
  const matchedProfileIds = new Set()

  for (const row of excelRows) {
    const key = normalizePersonKey(row.nome, row.cognome)
    if (seenExcelKeys.has(key)) {
      conflicts.push({ type: "DUPLICATE_EXCEL", key, row: row.rowNumber })
      continue
    }
    seenExcelKeys.add(key)

    if (duplicateDbKeys.has(key)) {
      conflicts.push({ type: "AMBIGUOUS_DB", key, row: row.rowNumber })
      continue
    }

    const existing = dbByKey.get(key) ?? null
    if (existing) matchedProfileIds.add(existing.id)
    const excelOnly = existing === null
    const flags = mapDepartmentFlags(row.tag)
    const inferredMembership = mapExcelMembership({
      adhesion: row.adhesion,
      note: row.note,
      excelOnly,
    })
    const membershipOverride = MEMBERSHIP_OVERRIDES.get(key)
    const category =
      membershipOverride?.category ?? inferredMembership.category
    const noteParts = [row.note, row.adhesion]
      .map(cleanText)
      .filter((value) => value && !/^C\d+$/i.test(value) && value !== "-")

    const role =
      category === "STAFF"
        ? null
        : existing?.ruolo ||
          (/\bPORTIERE\b/i.test(noteParts.join(" ")) ? "PORTIERE" : null)

    const historyHasData = Boolean(
      row.asi_2025 || row.jersey_2025 !== null || row.uniform_2025,
    )

    people.push({
      existingProfileId: existing?.id ?? null,
      sourceRow: row.rowNumber,
      profile: buildGlobalPatch(existing, row),
      private: compactObject({
        phone: row.phone,
        operational_email: row.email,
        tax_code: row.tax_code,
        nationality: row.nationality,
        birth_city: row.birth_city,
        residence_city: row.residence_city,
        address: row.address,
        postal_code: row.postal_code,
      }),
      historyMembership: historyHasData
        ? compactObject({
            category,
            role,
            staff_function:
              category === "STAFF"
                ? membershipOverride?.staff_function ?? "Staff"
                : null,
            jersey_number: row.jersey_2025,
            uniform_size: row.uniform_2025,
            asi_card_number: row.asi_2025,
            department: flags.department,
            is_external: flags.is_external,
            is_aggregated: flags.is_aggregated,
            status: "YES",
          })
        : null,
      membership: compactObject({
        ...inferredMembership,
        category,
        role,
        staff_function:
          category === "STAFF"
            ? membershipOverride?.staff_function ?? "Dirigente"
            : null,
        jersey_number: row.jersey_2026,
        uniform_size: row.uniform_2026,
        asi_card_number: row.asi_2026,
        department: flags.department,
        is_external: flags.is_external,
        is_aggregated: flags.is_aggregated,
        operational_notes: noteParts.join(" · ") || null,
      }),
    })
  }

  for (const profile of dbProfiles) {
    if (matchedProfileIds.has(profile.id)) continue
    const key = normalizePersonKey(profile.nome, profile.cognome)
    if (duplicateDbKeys.has(key)) continue

    people.push({
      existingProfileId: profile.id,
      sourceRow: null,
      profile: buildGlobalPatch(profile, profile),
      private: {},
      historyMembership: null,
      membership: {
        category: profile.is_staff ? "STAFF" : "PLAYER",
        role: profile.is_staff ? null : profile.ruolo || null,
        staff_function: profile.is_staff ? "Staff" : null,
        status: "PENDING",
        training_only: false,
        is_external: false,
        is_aggregated: false,
      },
    })
  }

  const statusCounts = people.reduce((counts, person) => {
    const status = person.membership.status
    counts[status] = (counts[status] ?? 0) + 1
    return counts
  }, {})

  return {
    seasonSlug: "2026-2027",
    historySeasonSlug: "2025-2026",
    people,
    conflicts,
    summary: {
      excelRows: excelRows.length,
      dbProfiles: dbProfiles.length,
      matched: people.filter((person) => person.existingProfileId && person.sourceRow)
        .length,
      created: people.filter((person) => !person.existingProfileId).length,
      dbOnly: people.filter((person) => person.existingProfileId && !person.sourceRow)
        .length,
      conflicts: conflicts.length,
      statuses: statusCounts,
    },
  }
}

export async function readRosterWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet("Rosa")
  if (!sheet) throw new Error('Foglio "Rosa" non trovato')

  const headers = sheet.getRow(3).values
  if (cleanText(headers[1]) !== "Nome" || cleanText(headers[17]) !== "ADESIONE 2026-2027") {
    throw new Error("Formato workbook non riconosciuto")
  }

  const rows = []
  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const nome = cellText(row.getCell(1).value)
    const cognome = cellText(row.getCell(2).value)
    if (!nome || !cognome) continue

    rows.push({
      rowNumber,
      nome,
      cognome,
      data_nascita: cellDate(row.getCell(3).value),
      tax_code: cellText(row.getCell(4).value),
      nationality: cellText(row.getCell(5).value),
      birth_city: cellText(row.getCell(6).value),
      residence_city: cellText(row.getCell(7).value),
      address: cellText(row.getCell(8).value),
      postal_code: cellText(row.getCell(9).value),
      phone: cellText(row.getCell(10).value),
      email: cellText(row.getCell(11).value),
      note: cellText(row.getCell(12).value),
      tag: cellText(row.getCell(13).value),
      asi_2025: cellText(row.getCell(14).value),
      jersey_2025: cellInteger(row.getCell(15).value),
      uniform_2025: cellText(row.getCell(16).value),
      adhesion: cellText(row.getCell(17).value),
      asi_2026: cellText(row.getCell(18).value),
      medical_2026: cellText(row.getCell(19).value),
      jersey_2026: cellInteger(row.getCell(20).value),
      uniform_2026: cellText(row.getCell(21).value),
      payment_2026: cellText(row.getCell(22).value),
    })
  }

  return rows
}

async function main() {
  loadDotEnv(".env.local")
  const options = parseArgs(process.argv.slice(2))
  if (!options.file) {
    throw new Error("Uso: npm run import:roster -- --file <workbook.xlsx> [--apply]")
  }

  const url =
    options.url ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    options.serviceKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!url || !serviceKey) {
    throw new Error("Servono URL Supabase e service role key")
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [{ data: profiles, error: profilesError }, excelRows] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,nome,cognome,data_nascita,avatar_url,ruolo,is_staff"),
    readRosterWorkbook(options.file),
  ])

  if (profilesError) throw profilesError
  const plan = buildImportPlan(excelRows, profiles ?? [])

  if (options.report) {
    writeFileSync(options.report, `${JSON.stringify(plan, null, 2)}\n`, {
      mode: 0o600,
    })
  }

  printSummary(plan)
  if (plan.conflicts.length > 0) {
    throw new Error("Import bloccato: risolvere i conflitti nel report")
  }
  if (!options.apply) return

  const { data, error } = await supabase.rpc("import_roster_plan", {
    p_plan: plan,
  })
  if (error) throw error

  console.log("Import applicato:", JSON.stringify(data))
}

function parseArgs(args) {
  const options = { apply: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--apply") options.apply = true
    else if (arg.startsWith("--file=")) options.file = arg.slice(7)
    else if (arg === "--file") options.file = args[++index]
    else if (arg.startsWith("--report=")) options.report = arg.slice(9)
    else if (arg === "--report") options.report = args[++index]
    else if (arg.startsWith("--url=")) options.url = arg.slice(6)
    else if (arg.startsWith("--service-key=")) options.serviceKey = arg.slice(14)
  }
  return options
}

function loadDotEnv(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

function unwrapCell(value) {
  if (value && typeof value === "object") {
    if ("result" in value) return value.result
    if ("text" in value) return value.text
    if ("richText" in value) return value.richText.map((part) => part.text).join("")
  }
  return value
}

function cellText(value) {
  const unwrapped = unwrapCell(value)
  if (unwrapped === null || unwrapped === undefined) return null
  if (unwrapped instanceof Date) return unwrapped.toISOString()
  const text = cleanText(unwrapped)
  return text || null
}

function cellDate(value) {
  const unwrapped = unwrapCell(value)
  if (!unwrapped) return null
  if (unwrapped instanceof Date) return unwrapped.toISOString().slice(0, 10)
  const parsed = new Date(String(unwrapped))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function cellInteger(value) {
  const unwrapped = unwrapCell(value)
  if (unwrapped === null || unwrapped === undefined || unwrapped === "") return null
  const parsed = Number.parseInt(String(unwrapped), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  )
}

function printSummary(plan) {
  console.log(JSON.stringify(plan.summary, null, 2))
  if (plan.conflicts.length > 0) {
    console.log("Conflitti:", JSON.stringify(plan.conflicts, null, 2))
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
