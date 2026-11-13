import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"
import { createClient } from "@supabase/supabase-js"

export function validateCronoResults(rows) {
  assert(Array.isArray(rows) && rows.length === 14, "Servono 14 risultati")
  for (const row of rows) {
    assert(typeof row.name === "string" && row.name.trim(), "Cognome non valido")
    assert(row.firstName === undefined || typeof row.firstName === "string", "Nome non valido")
    assert([row.first, row.split, row.total].every((time) => Number.isSafeInteger(time) && time > 0), "Tempi non validi: usare centesimi interi positivi")
    assert(row.total > row.split, "Il totale deve superare il primo tratto")
    assert(typeof row.incompleteWarmup === "boolean", "Nota riscaldamento non valida")
  }
  assert(new Set(rows.map((row) => `${row.name}|${row.firstName ?? ""}`)).size === rows.length, "Atleti duplicati")
  return rows
}

async function main() {
  assert(process.argv[2], "Uso: node scripts/import-crono-chigio.mjs <file-json-privato>")
  const rows = validateCronoResults(JSON.parse(await readFile(process.argv[2], "utf8")))
  nextEnv.loadEnvConfig(process.cwd())
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url && key, "Configurare URL Supabase e service role key nell’ambiente locale")
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.from("crono_chigio_tests").upsert({ tested_on: "2026-11-12", results: rows }, { onConflict: "tested_on" })
  if (error) throw new Error(`Importazione non riuscita: ${error.message}`)
  console.log(`Importati ${rows.length} risultati privati per il 12/11/2026`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
