import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RecordAction } from "@/lib/match-api"
import { enqueue, flushQueue, pendingCount, readQueue } from "@/lib/match-queue"

const action = (id: string): RecordAction => ({
  id,
  eventId: "event-1",
  kind: "GOAL",
  period: 1,
  minute: 12,
  stoppage: 0,
  occurredAt: "2026-10-24T19:12:00.000Z",
  profileId: "rossi",
  assistProfileId: null,
  subInProfileId: null,
})

const clientReturning = (...errors: (null | { code: string; message: string })[]) => {
  const rpc = vi.fn()
  for (const error of errors) rpc.mockResolvedValueOnce({ data: null, error })
  return { rpc } as never as Parameters<typeof flushQueue>[0] & { rpc: typeof rpc }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("match queue", () => {
  it("keeps taps on the phone until the server confirms them", async () => {
    enqueue(action("a"))
    enqueue(action("b"))
    expect(pendingCount("event-1")).toBe(2)

    const client = clientReturning(null, null)
    const result = await flushQueue(client, "event-1")

    expect(result.sent.map(({ id }) => id)).toEqual(["a", "b"])
    expect(client.rpc).toHaveBeenCalledWith("match_record", expect.objectContaining({ p_id: "a", p_kind: "GOAL" }))
    expect(pendingCount("event-1")).toBe(0)
  })

  it("drops and reports events refused after a handover", async () => {
    enqueue(action("a"))
    const result = await flushQueue(
      clientReturning({ code: "42501", message: "MATCH_CONTROL_LOST" }),
      "event-1",
    )
    expect(result.rejected.map(({ id }) => id)).toEqual(["a"])
    expect(pendingCount("event-1")).toBe(0)
  })

  it("stops on network errors and keeps the rest for later", async () => {
    enqueue(action("a"))
    enqueue(action("b"))
    const result = await flushQueue(
      clientReturning(null, { code: "", message: "TypeError: Failed to fetch" }),
      "event-1",
    )
    expect(result.sent.map(({ id }) => id)).toEqual(["a"])
    expect(readQueue("event-1").map(({ id }) => id)).toEqual(["b"])
  })
})
