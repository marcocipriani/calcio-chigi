import { describe, expect, it } from "vitest"

import { requireLocalSupabaseUrl } from "../../tests/e2e/local-supabase-url"

describe("requireLocalSupabaseUrl", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("accepts the loopback Supabase URL %s", (url) => {
    expect(requireLocalSupabaseUrl(url)).toBe(url)
  })

  it.each([
    "https://project.supabase.co",
    "http://127.0.0.2:54321",
    "http://localhost.example.com:54321",
    "not-a-url",
  ])("rejects a non-loopback Supabase URL %s", (url) => {
    expect(() => requireLocalSupabaseUrl(url)).toThrow(
      "E2E Supabase URL must use a loopback hostname",
    )
  })
})
