import { readFile, writeFile } from "node:fs/promises"

const schemaPath = "supabase/schema.sql"
const marker = "-- GENERATED TEAM MANAGEMENT MIGRATIONS"
const migrationPaths = [
  "supabase/migrations/20260725010000_team_management.sql",
  "supabase/migrations/20260725011000_roster_import_rpc.sql",
  "supabase/migrations/20260725011500_api_grants.sql",
  "supabase/migrations/20260725020000_accounts_notifications_storage.sql",
  "supabase/migrations/20260725021000_notification_storage_hardening.sql",
  "supabase/migrations/20260725022000_notification_outbox_rpc.sql",
  "supabase/migrations/20260725023000_manager_account_activity.sql",
  "supabase/migrations/20260725024000_manager_people_rpc.sql",
  "supabase/migrations/20260725025000_manager_update_rpcs.sql",
  "supabase/migrations/20260725026000_public_stats_official_formation.sql",
  "supabase/migrations/20260725027000_profile_self_service_hardening.sql",
  "supabase/migrations/20260725028000_app_context_open_payments.sql",
  "supabase/migrations/20260725029000_notification_dispatch_schedule.sql",
  "supabase/migrations/20260725030000_review_hardening.sql",
  "supabase/migrations/20260725031000_spec_completion.sql",
  "supabase/migrations/20260725032000_function_execute_hardening.sql",
  "supabase/migrations/20260725033000_roster_role_corrections.sql",
  "supabase/migrations/20260728010000_public_formation_summaries.sql",
  "supabase/migrations/20260729010000_season_stats_player_access.sql",
  "supabase/migrations/20260730010000_profile_ui_preferences.sql",
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
