import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const migrationPath =
  "supabase/migrations/20260725010000_team_management.sql"
const publicFormationSummaryMigrationPath =
  "supabase/migrations/20260728010000_public_formation_summaries.sql"
const schemaPath = "supabase/schema.sql"

const [migration, publicFormationSummaryMigration, schema] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(publicFormationSummaryMigrationPath, "utf8"),
  readFile(schemaPath, "utf8"),
])

const expectedTables = [
  "seasons",
  "profile_private_details",
  "season_memberships",
  "medical_certificates",
  "payments",
  "event_checkins",
  "match_player_stats",
  "match_awards",
  "match_unattributed_stats",
  "official_formations",
  "official_formation_players",
]

for (const table of expectedTables) {
  assert.match(
    migration,
    new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
    `missing table ${table}`,
  )
  assert.match(
    schema,
    new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
    `schema snapshot missing table ${table}`,
  )
}

for (const view of [
  "public_profile_directory",
  "public_active_roster",
  "authenticated_active_roster",
  "public_player_statistics",
]) {
  assert.match(
    migration,
    new RegExp(`create(?: or replace)? view public\\.${view}\\b`, "i"),
    `missing view ${view}`,
  )
}

assert.match(migration, /function public\.is_current_user_manager\(\)/i)
assert.match(migration, /function public\.update_membership_if_current\(/i)
assert.doesNotMatch(
  migration,
  /create policy "Profili visibili a tutti"/i,
  "legacy public profile policy must not be recreated",
)
assert.match(
  migration,
  /drop policy if exists "Profili visibili a tutti" on public\.profiles/i,
)
assert.match(migration, /alter table public\.profiles enable row level security/i)
assert.match(migration, /grant select on public\.public_active_roster to anon/i)
assert.match(
  publicFormationSummaryMigration,
  /create or replace view public\.public_published_formation_summaries\s+with \(security_barrier = true\)/i,
)
assert.match(
  schema,
  /create or replace view public\.public_published_formation_summaries\s+with \(security_barrier = true\)/i,
  "schema snapshot missing public published formation summaries",
)

console.log(
  `Schema verification passed: ${expectedTables.length} tables, 5 safe views`,
)
