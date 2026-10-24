import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RecordAction } from "@/lib/match-api"
import { enqueue, flushQueue, pendingCount, readQueue, unqueue } from "@/lib/match-queue"

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

  it("undoing a tap in flight waits for the send and says it reached the server", async () => {
    enqueue(action("a"))
    enqueue(action("b"))
    let release: (value: { data: null; error: null }) => void = () => {}
    const rpc = vi.fn().mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    rpc.mockResolvedValue({ data: null, error: null })
    const client = { rpc } as never as Parameters<typeof flushQueue>[0]

    const flushed = flushQueue(client, "event-1")
    // "a" è in viaggio, "b" aspetta: annullarli entrambi.
    const undoA = unqueue("event-1", "a")
    const undoB = unqueue("event-1", "b")
    release({ data: null, error: null })

    expect(await undoA).toBe(true)
    expect(await undoB).toBe(false)
    expect((await flushed).sent.map(({ id }) => id)).toEqual(["a"])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(pendingCount("event-1")).toBe(0)
  })

  it("undoing with nothing in flight just drops the tap", async () => {
    enqueue(action("a"))
    expect(await unqueue("event-1", "a")).toBe(false)
    expect(pendingCount("event-1")).toBe(0)
  })

  it("sends a tap added while the previous one is in flight in the same round", async () => {
    enqueue(action("a"))
    let release: (value: { data: null; error: null }) => void = () => {}
    const rpc = vi.fn().mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    rpc.mockResolvedValue({ data: null, error: null })
    const client = { rpc } as never as Parameters<typeof flushQueue>[0]

    const flushed = flushQueue(client, "event-1")
    // Doppio giallo: il rosso arriva mentre il giallo è in viaggio.
    enqueue(action("b"))
    release({ data: null, error: null })

    expect((await flushed).sent.map(({ id }) => id)).toEqual(["a", "b"])
    expect(pendingCount("event-1")).toBe(0)
  })
})
