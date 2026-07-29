import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const database = vi.hoisted(() => {
  type Response = { data?: unknown; error: unknown }
  const responses = new Map<string, Response | Promise<Response>>()
  const rpcResults = new Map<string, Array<Promise<Response>>>()
  const upsertResponses = new Map<string, Response[]>()
  const selections: Array<{ table: string; columns: string }> = []
  const upserts: Array<{
    table: string
    rows: unknown
    options: unknown
  }> = []
  const deletes: string[] = []

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
        return (
          responses.get(table) ??
          Promise.resolve({ data: null, error: null })
        )
      },
      upsert(rows: unknown, options: unknown) {
        upserts.push({ table, rows, options })
        return Promise.resolve(
          upsertResponses.get(table)?.shift() ?? { error: null },
        )
      },
      delete() {
        deletes.push(table)
        return {
          eq: () => Promise.resolve({ error: null }),
        }
      },
      then(
        onFulfilled: (value: Response) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const response =
          responses.get(table) ??
          Promise.resolve({ data: [], error: null })
        return Promise.resolve(response).then(onFulfilled, onRejected)
      },
    }
    return query
  })

  const rpc = vi.fn((name: string) => {
    const queued = rpcResults.get(name)?.shift()
    if (queued) return queued
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

  return {
    deletes,
    from,
    responses,
    rpc,
    rpcResults,
    selections,
    upsertResponses,
    upserts,
  }
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish
    reject = fail
  })
  return { promise, reject, resolve }
}

describe("CheckinStatsPanel match statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.deletes.length = 0
    database.responses.clear()
    database.rpcResults.clear()
    database.selections.length = 0
    database.upsertResponses.clear()
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

    expect(
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeDisabled()
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
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeEnabled()
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

  it("keeps Save disabled and does not expose partial data when a load query fails", async () => {
    database.responses.set("match_player_stats", {
      data: [
        {
          profile_id: "player-1",
          goals: 99,
          assists: 99,
          yellow_cards: 99,
          red_cards: 99,
        },
      ],
      error: { message: "private database detail" },
    })

    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Impossibile caricare check-in e statistiche.")
    expect(alert).not.toHaveTextContent("private database detail")
    expect(
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeDisabled()
    expect(screen.queryByRole("spinbutton")).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: "Salva statistiche" }),
    )
    expect(database.upserts).toHaveLength(0)
    expect(database.deletes).toHaveLength(0)
  })

  it("catches rejected load requests without enabling destructive actions", async () => {
    const rejectedAward = deferred<{
      data?: unknown
      error: unknown
    }>()
    database.responses.set("match_awards", rejectedAward.promise)

    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    await act(async () => {
      rejectedAward.reject(new Error("network detail"))
      await rejectedAward.promise.catch(() => undefined)
    })

    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      "network detail",
    )
    expect(
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeDisabled()
  })

  it("clears an absent MVP while check-in is pending, then deletes only the valid award", async () => {
    const mutation = deferred<{ data: null; error: null }>()
    database.rpcResults.set("set_event_checkin", [mutation.promise])
    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    const mvp = await screen.findByRole("combobox", { name: "MVP" })
    fireEvent.click(
      screen.getByRole("button", { name: "Segna assente Elio Dorbolò" }),
    )

    expect(mvp).toHaveValue("")
    expect(
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeDisabled()
    expect(database.upserts).toHaveLength(0)
    expect(database.deletes).toHaveLength(0)

    await act(async () => {
      mutation.resolve({ data: null, error: null })
      await mutation.promise
    })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Salva statistiche" }),
      ).toBeEnabled()
    })

    fireEvent.click(
      screen.getByRole("button", { name: "Salva statistiche" }),
    )
    await waitFor(() => {
      expect(database.deletes).toEqual(["match_awards"])
    })
    expect(
      database.upserts.filter(({ table }) => table === "match_awards"),
    ).toHaveLength(0)
  })

  it("restores both official presence and MVP when the check-in mutation fails", async () => {
    const mutation = deferred<{
      data: null
      error: { message: string }
    }>()
    database.rpcResults.set("set_event_checkin", [mutation.promise])
    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    const mvp = await screen.findByRole("combobox", { name: "MVP" })
    fireEvent.click(
      screen.getByRole("button", { name: "Segna assente Elio Dorbolò" }),
    )
    expect(mvp).toHaveValue("")

    await act(async () => {
      mutation.resolve({
        data: null,
        error: { message: "check-in failed" },
      })
      await mutation.promise
    })

    await waitFor(() => expect(mvp).toHaveValue("player-1"))
    expect(
      screen.getByRole("spinbutton", { name: "Goal di Elio Dorbolò" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Salva statistiche" }),
    ).toBeEnabled()
  })

  it("stops before changing MVP when the player-stat upsert fails", async () => {
    database.upsertResponses.set("match_player_stats", [
      { error: { message: "stats failed" } },
    ])
    render(<CheckinStatsPanel eventId="match-1" isMatch />)

    await screen.findByRole("spinbutton", {
      name: "Goal di Elio Dorbolò",
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Salva statistiche" }),
    )

    await waitFor(() => {
      expect(
        database.upserts.filter(
          ({ table }) => table === "match_player_stats",
        ),
      ).toHaveLength(1)
    })
    expect(
      database.upserts.filter(({ table }) => table === "match_awards"),
    ).toHaveLength(0)
    expect(database.deletes).toHaveLength(0)
  })
})
