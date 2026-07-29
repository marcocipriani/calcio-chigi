import { execFileSync } from "node:child_process"
import { defineConfig, devices } from "@playwright/test"

import { requireLocalSupabaseUrl } from "./tests/e2e/local-supabase-url"

function localSupabaseEnvironment() {
  if (
    process.env.E2E_SUPABASE_URL &&
    process.env.E2E_SUPABASE_ANON_KEY &&
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      API_URL: process.env.E2E_SUPABASE_URL,
      ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    }
  }
  const output = execFileSync(
    "npx",
    ["supabase", "status", "-o", "env"],
    { encoding: "utf8" },
  )
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  )
}

const local = localSupabaseEnvironment()
const localSupabaseUrl = requireLocalSupabaseUrl(local.API_URL)
process.env.E2E_SUPABASE_URL = localSupabaseUrl
process.env.E2E_SUPABASE_ANON_KEY = local.ANON_KEY
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = local.SERVICE_ROLE_KEY

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_KEY: local.ANON_KEY,
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3100",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],
})
