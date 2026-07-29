import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const database = vi.hoisted(() => ({
  rows: [] as unknown[],
}))

const supabase = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: database.rows })),
      })),
    })),
  })),
  rpc: vi.fn(async () => ({ data: null })),
}))

vi.mock("next/navigation", () => ({ usePathname: () => "/gestione" }))
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: supabase }))

import {
  ManagerPresence,
  presenceState,
} from "@/components/management/ManagerPresence"

const now = new Date("2026-07-29T12:00:00.000Z")

function manager(lastSeenAt: string | null) {
  return {
    id: "manager-1",
    nome: "Marco",
    cognome: "Rossi",
    avatar_url: null,
    manager_activity: lastSeenAt
      ? { last_seen_at: lastSeenAt, last_route: "/gestione" }
      : null,
  }
}

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString()
}

function millisecondsAgo(milliseconds: number) {
  return new Date(now.getTime() - milliseconds).toISOString()
}

describe("ManagerPresence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(now)
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    ["2:59", millisecondsAgo(2 * 60_000 + 59_000), "ONLINE", "Online", "bg-emerald-500"],
    ["3:00", minutesAgo(3), "RECENT", "Attivo 3 minuti fa", "bg-amber-400"],
    ["23:59", minutesAgo(23 * 60 + 59), "RECENT", "Attivo 24 ore fa", "bg-amber-400"],
    ["24:00", minutesAgo(24 * 60), "RECENT", "Attivo un giorno fa", "bg-amber-400"],
    ["24:01", minutesAgo(24 * 60 + 1), "STALE", "Attivo un giorno fa", "bg-slate-400"],
    ["nessuna attività", null, "NEVER", "Mai attivo", "bg-slate-400"],
  ] as const)(
    "reports %s activity with the correct state and color",
    async (_, lastSeenAt, state, label, color) => {
      database.rows = [manager(lastSeenAt)]

      expect(presenceState(lastSeenAt, now).state).toBe(state)

      render(<ManagerPresence />)

      const indicator = await screen.findByLabelText(`Marco Rossi, ${label}`)
      expect(indicator.querySelector('[aria-hidden="true"]')).toHaveClass(color)
    },
  )

  it("exposes the manager activity through an accessible Radix tooltip", async () => {
    database.rows = [manager(minutesAgo(3))]

    render(<ManagerPresence />)

    const trigger = await screen.findByLabelText(
      "Marco Rossi, Attivo 3 minuti fa",
    )
    expect(trigger).not.toHaveAttribute("title")

    fireEvent.focus(trigger)

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Marco Rossi · Attivo 3 minuti fa",
    )
  })
})
