import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const api = vi.hoisted(() => {
  const directories = new Map<string, unknown[]>()
  const statistics = new Map<string, unknown[]>()
  return {
    directories,
    fetchSeasonPlayerDirectory: vi.fn((_: unknown, seasonId: string) =>
      Promise.resolve(directories.get(seasonId) ?? []),
    ),
    fetchPlayerStatisticsByPhase: vi.fn(
      (_: unknown, seasonId: string, phase: string) =>
        Promise.resolve(statistics.get(`${seasonId}:${phase}`) ?? []),
    ),
    statistics,
  }
})

const database = vi.hoisted(() => {
  type Response = { data: unknown; error: unknown }
  const responses = new Map<string, Response | Promise<Response>>()
  const queries: Array<{
    table: string
    columns: string
    filters: Array<{ method: string; column: string; value: unknown }>
  }> = []
  const seasons = [
    { id: "season-2026", slug: "2026-2027" },
    { id: "season-2025", slug: "2025-2026" },
  ]
  let seasonError: unknown = null

  const from = vi.fn((table: string) => {
    const filters: Array<{
      method: string
      column: string
      value: unknown
    }> = []
    const query = {
      select(columns: string) {
        queries.push({ table, columns, filters })
        return query
      },
      eq(column: string, value: unknown) {
        filters.push({ method: "eq", column, value })
        return query
      },
      lte(column: string, value: unknown) {
        filters.push({ method: "lte", column, value })
        return query
      },
      gte(column: string, value: unknown) {
        filters.push({ method: "gte", column, value })
        return query
      },
      in(column: string, value: unknown) {
        filters.push({ method: "in", column, value })
        if (table === "seasons") {
          return Promise.resolve({
            data: seasonError ? null : seasons,
            error: seasonError,
          })
        }
        return query
      },
      order() {
        return query
      },
      maybeSingle() {
        if (table === "seasons") {
          return Promise.resolve({
            data: { id: "season-2025", slug: "2025-2026" },
            error: null,
          })
        }
        const response = responses.get(table) ?? {
          data: null,
          error: null,
        }
        return response instanceof Promise ? response : Promise.resolve(response)
      },
      then(
        onFulfilled: (value: Response) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const response = responses.get(table) ?? {
          data: [],
          error: null,
        }
        return (
          response instanceof Promise ? response : Promise.resolve(response)
        ).then(onFulfilled, onRejected)
      },
    }
    return query
  })

  return {
    from,
    queries,
    responses,
    seasons,
    get seasonError() {
      return seasonError
    },
    set seasonError(value: unknown) {
      seasonError = value
    },
  }
})

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))

vi.mock("@/lib/api", () => ({
  fetchPlayerStatisticsByPhase: api.fetchPlayerStatisticsByPhase,
  fetchSeasonPlayerDirectory: api.fetchSeasonPlayerDirectory,
}))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: { from: database.from },
}))

import StatisticsPage from "@/app/statistiche/page"

const player = {
  season_id: "season-2026",
  profile_id: "player-1",
  nome: "Elio",
  cognome: "Dorbolò",
  avatar_url: null,
  role: "CENTROCAMPISTA",
  jersey_number: 8,
}

function stat(
  seasonId: string,
  phaseKey: "FASE_1" | "COPPA_LAZIO_PROFESSIONISTI",
  values: {
    goals: number
    assists: number | null
    mvp: number
    yellow_cards: number
    red_cards: number
  },
) {
  return {
    season_id: seasonId,
    phase_key: phaseKey,
    profile_id: "player-1",
    ...values,
  }
}

function anonymousSession() {
  return {
    isAssociated: false,
    loading: false,
    user: null,
  }
}

function associatedSession(loading = false) {
  return {
    isAssociated: true,
    loading,
    user: { id: "user-1" },
  }
}

function ranking(name: string) {
  const heading = screen.getByRole("heading", { name })
  const section = heading.closest("section")
  if (!section) throw new Error(`Missing ${name} ranking section`)
  return within(section)
}

function selectSeason(slug: "2026-2027" | "2025-2026") {
  fireEvent.change(screen.getByRole("combobox", { name: "Stagione" }), {
    target: { value: slug },
  })
}

function privateQueries() {
  return database.queries.filter(({ table }) =>
    ["events", "event_checkins"].includes(table),
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

describe("StatisticsPage seasonal rankings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.queries.length = 0
    database.responses.clear()
    database.seasons.splice(
      0,
      database.seasons.length,
      { id: "season-2026", slug: "2026-2027" },
      { id: "season-2025", slug: "2025-2026" },
    )
    database.seasonError = null
    api.directories.clear()
    api.statistics.clear()
    api.directories.set("season-2026", [player])
    api.directories.set("season-2025", [
      { ...player, season_id: "season-2025" },
    ])
    api.fetchSeasonPlayerDirectory.mockImplementation(
      (_: unknown, seasonId: string) =>
        Promise.resolve(api.directories.get(seasonId) ?? []),
    )
    api.fetchPlayerStatisticsByPhase.mockImplementation(
      (_: unknown, seasonId: string, phase: string) =>
        Promise.resolve(api.statistics.get(`${seasonId}:${phase}`) ?? []),
    )
    session.useAppSession.mockReturnValue(anonymousSession())
  })

  it("defaults to 2026/27 zero rankings without pills, private queries, or public profile links", async () => {
    const { container } = render(<StatisticsPage />)

    expect(
      screen.getByRole("heading", { level: 1, name: "Statistiche" }),
    ).toBeVisible()
    expect(
      screen.getByRole("combobox", { name: "Stagione" }),
    ).toHaveTextContent("2026/27")
    expect(screen.getByRole("combobox", { name: "Fase" })).toHaveValue("ALL")
    expect(screen.queryByText("Pubbliche")).toBeNull()
    expect(screen.queryByText("Login")).toBeNull()

    await screen.findAllByText("Elio Dorbolò")
    for (const heading of [
      "Goal",
      "Assist",
      "MVP",
      "Ammonizioni",
      "Espulsioni",
    ]) {
      expect(ranking(heading).getByText("Elio Dorbolò")).toBeVisible()
      expect(ranking(heading).getByText("0")).toBeVisible()
    }

    expect(
      container.querySelector("[data-statistics-layout]"),
    ).toHaveClass("lg:grid-cols-2")
    expect(
      screen.queryByRole("link", { name: /Elio Dorbolò/ }),
    ).toBeNull()
    expect(privateQueries()).toHaveLength(0)
    expect(api.fetchSeasonPlayerDirectory).toHaveBeenCalledWith(
      expect.anything(),
      "season-2026",
    )
    expect(api.fetchPlayerStatisticsByPhase).toHaveBeenCalledWith(
      expect.anything(),
      "season-2026",
      "ALL",
    )
  })

  it("adds the selected season to every associated player link and loads current attendance", async () => {
    session.useAppSession.mockReturnValue(associatedSession())
    database.responses.set("events", {
      data: [{ id: "training-1" }],
      error: null,
    })
    database.responses.set("event_checkins", {
      data: [{ event_id: "training-1", profile_id: "player-1" }],
      error: null,
    })

    render(<StatisticsPage />)

    await screen.findByText("1/1 allenamenti")
    const links = screen.getAllByRole("link", { name: /Elio Dorbolò/ })
    expect(links.length).toBeGreaterThan(1)
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/giocatore/player-1?season=2026-2027",
      )
    }
    expect(privateQueries().map(({ table }) => table)).toEqual([
      "events",
      "event_checkins",
    ])
  })

  it("renders historical assists and attendance as unavailable without private queries", async () => {
    session.useAppSession.mockReturnValue(associatedSession(true))
    api.statistics.set("season-2025:ALL", [
      stat("season-2025", "FASE_1", {
        goals: 4,
        assists: null,
        mvp: 2,
        yellow_cards: 3,
        red_cards: 1,
      }),
    ])
    const rendered = render(<StatisticsPage />)

    selectSeason("2025-2026")
    expect(await screen.findByText("Dati non disponibili")).toBeVisible()
    await waitFor(() => {
      expect(ranking("Assist").getByText("—")).toBeVisible()
    })

    session.useAppSession.mockReturnValue(associatedSession())
    rendered.rerender(<StatisticsPage />)
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Stagione" }),
      ).toHaveValue("2025-2026")
    })
    expect(privateQueries()).toHaveLength(0)
    expect(
      screen.getAllByRole("link", { name: /Elio Dorbolò/ })[0],
    ).toHaveAttribute(
      "href",
      "/giocatore/player-1?season=2025-2026",
    )
  })

  it("filters tournament rankings by phase, keeps attendance stable, and resets phase on season change", async () => {
    session.useAppSession.mockReturnValue(associatedSession())
    const phaseOne = stat("season-2026", "FASE_1", {
      goals: 2,
      assists: 1,
      mvp: 0,
      yellow_cards: 1,
      red_cards: 0,
    })
    const cup = stat("season-2026", "COPPA_LAZIO_PROFESSIONISTI", {
      goals: 3,
      assists: 2,
      mvp: 1,
      yellow_cards: 0,
      red_cards: 1,
    })
    api.statistics.set("season-2026:ALL", [phaseOne, cup])
    api.statistics.set("season-2026:FASE_1", [phaseOne])
    database.responses.set("events", { data: [], error: null })

    render(<StatisticsPage />)
    await waitFor(() => expect(ranking("Goal").getByText("5")).toBeVisible())

    fireEvent.change(screen.getByRole("combobox", { name: "Fase" }), {
      target: { value: "FASE_1" },
    })
    await waitFor(() => expect(ranking("Goal").getByText("2")).toBeVisible())
    expect(api.fetchPlayerStatisticsByPhase).toHaveBeenCalledWith(
      expect.anything(),
      "season-2026",
      "FASE_1",
    )
    expect(
      database.queries.filter(({ table }) => table === "events"),
    ).toHaveLength(1)

    selectSeason("2025-2026")
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Fase" })).toHaveValue("ALL")
    })
  })

  it("shows an edition-specific error for missing configured seasons", async () => {
    database.seasons.splice(
      0,
      database.seasons.length,
      { id: "season-2026", slug: "2026-2027" },
    )

    render(<StatisticsPage />)

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Impossibile caricare le statistiche 2026/27.")
    expect(api.fetchSeasonPlayerDirectory).not.toHaveBeenCalled()
    expect(privateQueries()).toHaveLength(0)
  })

  it("ignores stale phase statistics after a newer selection resolves", async () => {
    const phaseOne = stat("season-2026", "FASE_1", {
      goals: 2,
      assists: 1,
      mvp: 0,
      yellow_cards: 0,
      red_cards: 0,
    })
    const cup = stat("season-2026", "COPPA_LAZIO_PROFESSIONISTI", {
      goals: 3,
      assists: 1,
      mvp: 0,
      yellow_cards: 0,
      red_cards: 0,
    })
    api.statistics.set("season-2026:ALL", [phaseOne, cup])
    const stale = deferred<unknown[]>()
    api.fetchPlayerStatisticsByPhase.mockImplementation(
      (_: unknown, seasonId: string, phase: string) => {
        if (phase === "FASE_1") return stale.promise
        return Promise.resolve(api.statistics.get(`${seasonId}:${phase}`) ?? [])
      },
    )

    render(<StatisticsPage />)
    await waitFor(() => expect(ranking("Goal").getByText("5")).toBeVisible())

    fireEvent.change(screen.getByRole("combobox", { name: "Fase" }), {
      target: { value: "FASE_1" },
    })
    fireEvent.change(screen.getByRole("combobox", { name: "Fase" }), {
      target: { value: "ALL" },
    })
    await waitFor(() => expect(ranking("Goal").getByText("5")).toBeVisible())

    await act(async () => {
      stale.resolve([
        {
          ...phaseOne,
          goals: 99,
        },
      ])
    })
    expect(ranking("Goal").queryByText("99")).toBeNull()
    expect(ranking("Goal").getByText("5")).toBeVisible()
  })

  it("discards stale current-season attendance after switching to historical", async () => {
    session.useAppSession.mockReturnValue(associatedSession())
    const staleEvents = deferred<{ data: unknown; error: unknown }>()
    database.responses.set("events", staleEvents.promise)

    render(<StatisticsPage />)
    await waitFor(() => {
      expect(
        database.queries.some(({ table }) => table === "events"),
      ).toBe(true)
    })

    selectSeason("2025-2026")
    expect(await screen.findByText("Dati non disponibili")).toBeVisible()

    await act(async () => {
      staleEvents.resolve({
        data: [{ id: "stale-training" }],
        error: null,
      })
    })
    expect(
      database.queries.some(({ table }) => table === "event_checkins"),
    ).toBe(false)
    expect(screen.getByText("Dati non disponibili")).toBeVisible()
  })
})
