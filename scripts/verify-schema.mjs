import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const migrationPath =
  "supabase/migrations/20260725010000_team_management.sql"
const publicFormationSummaryMigrationPath =
  "supabase/migrations/20260728010000_public_formation_summaries.sql"
const seasonStatsMigrationPath =
  "supabase/migrations/20260729010000_season_stats_player_access.sql"
const profilePreferencesMigrationPath =
  "supabase/migrations/20260730010000_profile_ui_preferences.sql"
const seasonJoinDatesMigrationPath =
  "supabase/migrations/20260831195519_authenticated_season_join_dates.sql"
const schemaPath = "supabase/schema.sql"

const [
  migration,
  publicFormationSummaryMigration,
  seasonStatsMigration,
  profilePreferencesMigration,
  seasonJoinDatesMigration,
  schema,
] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(publicFormationSummaryMigrationPath, "utf8"),
  readFile(seasonStatsMigrationPath, "utf8"),
  readFile(profilePreferencesMigrationPath, "utf8"),
  readFile(seasonJoinDatesMigrationPath, "utf8"),
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

assert.match(
  seasonStatsMigration,
  /create table public\.historical_player_stats\b/i,
  "missing historical player statistics table",
)
assert.match(
  seasonStatsMigration,
  /function public\.get_player_profile\(\s*p_profile_id uuid,\s*p_season_id uuid\s*\)/i,
  "missing safe player profile RPC",
)
assert.match(
  seasonStatsMigration,
  /function public\.import_historical_player_stats\(\s*p_season_slug text,\s*p_source_url text,\s*p_rows jsonb\s*\)/i,
  "missing historical player statistics importer",
)

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
for (const view of [
  "public_season_player_directory",
  "public_player_statistics_by_phase",
]) {
  assert.match(
    seasonStatsMigration,
    new RegExp(`create(?: or replace)? view public\\.${view}\\b`, "i"),
    `missing view ${view}`,
  )
  assert.match(
    schema,
    new RegExp(`create(?: or replace)? view public\\.${view}\\b`, "i"),
    `schema snapshot missing view ${view}`,
  )
}
assert.match(
  schema,
  /create table public\.historical_player_stats\b/i,
  "schema snapshot missing historical player statistics table",
)
assert.match(
  schema,
  /function public\.get_player_profile\(\s*p_profile_id uuid,\s*p_season_id uuid\s*\)/i,
  "schema snapshot missing safe player profile RPC",
)
assert.match(
  schema,
  /function public\.import_historical_player_stats\(\s*p_season_slug text,\s*p_source_url text,\s*p_rows jsonb\s*\)/i,
  "schema snapshot missing historical player statistics importer",
)
assert.match(
  profilePreferencesMigration,
  /create table public\.profile_ui_preferences\b/i,
)
assert.match(
  schema,
  /create table public\.profile_ui_preferences\b/i,
  "schema snapshot missing profile UI preferences",
)
assert.match(
  profilePreferencesMigration,
  /profile_id = public\.current_profile_id\(\)/i,
  "profile UI preferences must remain self-scoped",
)

for (const source of [seasonJoinDatesMigration, schema]) {
  assert.match(
    source,
    /create or replace view public\.authenticated_season_join_dates\s+with \(security_barrier = true\)/i,
    "missing authenticated season join dates view",
  )
  assert.match(
    source,
    /where public\.is_current_user_associated\(\)/i,
    "season join dates must stay behind an associated account",
  )
}
assert.doesNotMatch(
  seasonJoinDatesMigration,
  /grant select on public\.authenticated_season_join_dates to [^;]*anon/i,
  "season join dates must never be granted to anon",
)

console.log(
  `Schema verification passed: ${expectedTables.length + 1} tables, 8 safe views`,
)
