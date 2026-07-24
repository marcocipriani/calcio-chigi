import { readFile, writeFile } from "node:fs/promises"

const schemaPath = "supabase/schema.sql"
const marker = "-- GENERATED TEAM MANAGEMENT MIGRATIONS"
const migrationPaths = [
  "supabase/migrations/20260725010000_team_management.sql",
  "supabase/migrations/20260725020000_accounts_notifications_storage.sql",
]

const current = await readFile(schemaPath, "utf8")
const base = current.split(marker)[0].trimEnd()
const migrations = []

for (const path of migrationPaths) {
  try {
    const sql = await readFile(path, "utf8")
    migrations.push(`-- Source: ${path}\n${sql.trim()}`)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue
    }
    throw error
  }
}

await writeFile(
  schemaPath,
  `${base}\n\n${marker}\n-- Regenerate with: npm run db:snapshot\n\n${migrations.join("\n\n")}\n`,
)

console.log(`Updated ${schemaPath} with ${migrations.length} feature migration(s)`)
