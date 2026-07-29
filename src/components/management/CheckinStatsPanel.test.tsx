import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const database = vi.hoisted(() => {
  const responses = new Map<string, { data: unknown; error: unknown }>()
  const selections: Array<{ table: string; columns: string }> = []
  const upserts: Array<{
    table: string
    rows: unknown
    options: unknown
  }> = []

  const from = vi.fn((table: string) => {
    const query = {
      select(columns: string) {
        selections.push({ table, columns })
        return query
      },
      eq() {
        return query
      },
      maybeSingle() {
        return Promise.resolve(
          responses.get(table) ?? { data: null, error: null },
        )
      },
      upsert(rows: unknown, options: unknown) {
        upserts.push({ table, rows, options })
        return Promise.resolve({ error: null })
      },
      delete() {
        return query
      },
      then(
        onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(
          responses.get(table) ?? { data: [], error: null },
        ).then(onFulfilled, onRejected)
      },
    }
    return query
  })

  const rpc = vi.fn((name: string) => {
    if (name === "get_event_roster") {
      return Promise.resolve({
        data: [
          {
            profile_id: "player-1",
            nome: "Elio",
            cognome: "Dorbolò",
            avatar_url: null,
            role: "CENTROCAMPISTA",
            category: "PLAYER",
            training_only: false,
          },
        ],
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  })

  return { from, responses, rpc, selections, upserts }
})

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    from: database.from,
    rpc: database.rpc,
  },
}))

import { CheckinStatsPanel } from "@/components/management/CheckinStatsPanel"

describe("CheckinStatsPanel match statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.responses.clear()
    database.selections.length = 0
    database.upserts.length = 0
    session.useAppSession.mockReturnValue({
      isManager: true,
      profile: { id: "manager-1" },
    })
    database.responses.set("event_checkins", {
      data: [{ profile_id: "player-1", status: "PRESENT" }],
      error: null,
    })
    database.responses.set("match_player_stats", {
      data: [
        {
          profile_id: "player-1",
          goals: 2,
          assists: 3,
          yellow_cards: 4,
          red_cards: 1,
        },
      ],
      error: null,
    })
    database.responses.set("match_awards", {
      data: { profile_id: "player-1" },
      error: null,
    })
  })

  it("loads and saves all four non-negative fields for officially present players", async () => {
    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    const goal = await screen.findByRole("spinbutton", {
      name: "Goal di Elio Dorbolò",
    })
    const assist = screen.getByRole("spinbutton", {
      name: "Assist di Elio Dorbolò",
    })
    const yellowCards = screen.getByRole("spinbutton", {
      name: "Ammonizioni di Elio Dorbolò",
    })
    const redCards = screen.getByRole("spinbutton", {
      name: "Espulsioni di Elio Dorbolò",
    })

    expect(goal).toHaveValue(2)
    expect(assist).toHaveValue(3)
    expect(yellowCards).toHaveValue(4)
    expect(redCards).toHaveValue(1)
    expect(
      database.selections.find(
        ({ table }) => table === "match_player_stats",
      ),
    ).toEqual({
      table: "match_player_stats",
      columns:
        "profile_id, goals, assists, yellow_cards, red_cards",
    })

    fireEvent.change(goal, { target: { value: "5" } })
    fireEvent.change(assist, { target: { value: "6" } })
    fireEvent.change(yellowCards, { target: { value: "2" } })
    fireEvent.change(redCards, { target: { value: "1" } })
    fireEvent.click(
      screen.getByRole("button", { name: "Salva statistiche" }),
    )

    await waitFor(() => {
      expect(database.upserts).toContainEqual({
        table: "match_player_stats",
        rows: [
          {
            event_id: "match-1",
            profile_id: "player-1",
            goals: 5,
            assists: 6,
            yellow_cards: 2,
            red_cards: 1,
            updated_by: "manager-1",
          },
        ],
        options: { onConflict: "event_id,profile_id" },
      })
    })
    expect(
      screen.getAllByRole("button", { name: "Salva statistiche" }),
    ).toHaveLength(1)
  })

  it("uses MVP naming and never sends negative or NaN match statistics", async () => {
    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    expect(
      await screen.findByRole("combobox", { name: "MVP" }),
    ).toHaveValue("player-1")
    expect(screen.queryByText("Player of the match")).toBeNull()

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Goal di Elio Dorbolò" }),
      { target: { value: "-4" } },
    )
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Assist di Elio Dorbolò" }),
      { target: { value: "" } },
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Salva statistiche" }),
    )

    await waitFor(() => {
      const statUpsert = database.upserts.find(
        ({ table }) => table === "match_player_stats",
      )
      expect(statUpsert?.rows).toEqual([
        expect.objectContaining({ goals: 0, assists: 0 }),
      ])
    })
  })
})
