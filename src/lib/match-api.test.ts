import { describe, expect, it } from "vitest"

import { fetchMatch } from "@/lib/match-api"

// Basta la catena usata da fetchMatch: select → eq → maybeSingle | order.
function clientWith(timeline: Record<string, unknown>[]) {
  const query = (data: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      order: async () => ({ data, error: null }),
    }
    return chain
  }
  return { from: () => query(timeline) } as never as Parameters<typeof fetchMatch>[0]
}

describe("fetchMatch", () => {
  it("brings server times to the same format as queued taps", async () => {
    const { timeline } = await fetchMatch(
      clientWith([{ id: "a", kind: "GOAL", period: 1, minute: 12, occurred_at: "2026-10-24T19:12:00.123456+00:00" }]),
      "event-1",
    )
    expect(timeline[0].occurredAt).toBe("2026-10-24T19:12:00.123Z")
    // Un tocco in coda appena dopo, nello stesso secondo, resta dopo.
    expect(timeline[0].occurredAt < new Date("2026-10-24T19:12:00.500Z").toISOString()).toBe(true)
  })
})
