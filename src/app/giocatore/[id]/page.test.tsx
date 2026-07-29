import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const database = vi.hoisted(() => {
  const safePlayer = {
    profile_id: "player-1",
    season_id: "season-2025",
    nome: "Elio",
    cognome: "Dorbolò",
    avatar_url: null,
    role: "CENTROCAMPISTA",
    jersey_number: 8,
    goals: 4,
    assists: 2,
    mvp: 1,
    yellow_cards: 3,
    red_cards: 1,
  }
  const responses = new Map<string, { data: unknown; error: unknown }>()
  const selections: Array<{ table: string; columns: string }> = []
  const filters: Array<{
    table: string
    method: "eq" | "lte" | "gte" | "in"
    column: string
    value: unknown
  }> = []
  const rpcResults: Array<
    Promise<{ data: unknown; error: unknown }>
  > = []
  const seasons = [
    {
      id: "season-2025",
      slug: "2025-2026",
      starts_on: "2025-08-01",
      ends_on: "2026-07-31",
    },
    {
      id: "season-2026",
      slug: "2026-2027",
      starts_on: "2026-08-01",
      ends_on: "2027-07-31",
    },
  ]
  const from = vi.fn((table: string) => {
    const queryFilters: typeof filters = []
    const query = {
      select(columns: string) {
        selections.push({ table, columns })
        return query
      },
      eq(column: string, value: unknown) {
        const filter = { table, method: "eq" as const, column, value }
        filters.push(filter)
        queryFilters.push(filter)
        return query
      },
      lte(column: string, value: unknown) {
        const filter = { table, method: "lte" as const, column, value }
        filters.push(filter)
        queryFilters.push(filter)
        return query
      },
      gte(column: string, value: unknown) {
        const filter = { table, method: "gte" as const, column, value }
        filters.push(filter)
        queryFilters.push(filter)
        return query
      },
      in(column: string, value: unknown) {
        const filter = { table, method: "in" as const, column, value }
        filters.push(filter)
        queryFilters.push(filter)
        return query
      },
      order() {
        return query
      },
      maybeSingle() {
        if (table === "seasons") {
          const matches = seasons.filter((season) =>
            queryFilters.every(({ column, method, value }) => {
              const seasonValue = season[column as keyof typeof season]
              if (method === "eq") return seasonValue === value
              if (method === "lte") return seasonValue <= String(value)
              if (method === "gte") return seasonValue >= String(value)
              return false
            }),
          )
          return Promise.resolve({
            data: matches.length === 1 ? matches[0] : null,
            error: null,
          })
        }
        return Promise.resolve(
          responses.get(table) ?? { data: null, error: null },
        )
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
  const rpc = vi.fn(() => ({
    maybeSingle: vi.fn(() =>
      rpcResults.shift() ??
      Promise.resolve({ data: safePlayer, error: null }),
    ),
  }))

  return {
    filters,
    from,
    responses,
    rpc,
    rpcResults,
    safePlayer,
    selections,
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    from: database.from,
    rpc: database.rpc,
  },
}))

import PlayerPage from "@/app/giocatore/[id]/page"

const fulfilled = <T,>(value: T) =>
  Object.assign(Promise.resolve(value), {
    status: "fulfilled",
    value,
  })

function playerPage({
  id = "player-1",
  season,
}: {
  id?: string
  season?: string
} = {}) {
  return (
    <PlayerPage
      params={fulfilled({ id })}
      searchParams={fulfilled(season ? { season } : {})}
    />
  )
}

function renderPlayerPage(options?: { id?: string; season?: string }) {
  return render(playerPage(options))
}

function queriedTables() {
  return database.from.mock.calls.map(([table]) => table)
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function approvedSession(
  profileId = "teammate-1",
  isManager = false,
) {
  return {
    isAssociated: true,
    isManager,
    loading: false,
    profile: { id: profileId },
    targetSeason: {
      id: "season-1",
      slug: "2026-2027",
      name: "Stagione 2026–2027",
      starts_on: "2026-08-01",
      ends_on: "2027-07-31",
    },
    user: { id: "user-1" },
  }
}

describe("protected player page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-29T10:00:00+02:00"))
    vi.clearAllMocks()
    database.responses.clear()
    database.filters.length = 0
    database.rpcResults.length = 0
    database.selections.length = 0
    database.responses.set("season_memberships", {
      data: {
        id: "membership-1",
        season_id: "season-1",
        category: "PLAYER",
        role: "CENTROCAMPISTA",
        jersey_number: 8,
        status: "YES",
        registration_status: "ACTIVE",
        registration_completed_on: "2026-07-20",
        asi_card_number: "ASI-123",
      },
      error: null,
    })
    database.responses.set("payments", {
      data: [
        {
          id: "payment-1",
          description: "Quota stagione",
          amount_due: 80,
          due_on: "2026-08-31",
          status: "DUE",
        },
      ],
      error: null,
    })
    database.responses.set("medical_certificates", {
      data: [
        {
          id: "certificate-1",
          visit_on: "2026-07-10",
          expires_on: "2027-07-10",
          laboratory: "Centro medico",
          status: "VALID",
        },
      ],
      error: null,
    })
    database.responses.set("profile_private_details", {
      data: {
        phone: "+39 333 1234567",
        operational_email: "elio@example.test",
      },
      error: null,
    })
    database.responses.set("events", {
      data: [
        {
          id: "training-1",
          tipo: "ALLENAMENTO",
          data_ora: "2026-07-20T19:30:00+02:00",
          avversario: null,
        },
      ],
      error: null,
    })
    database.responses.set("event_checkins", {
      data: [{ event_id: "training-1" }],
      error: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("issues no player query while the session is loading", () => {
    session.useAppSession.mockReturnValue({
      ...approvedSession(),
      loading: true,
    })

    renderPlayerPage()

    expect(database.from).not.toHaveBeenCalled()
    expect(database.rpc).not.toHaveBeenCalled()
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it("redirects anonymous users to login without querying player data", async () => {
    session.useAppSession.mockReturnValue({
      isAssociated: false,
      isManager: false,
      loading: false,
      profile: null,
      targetSeason: null,
      user: null,
    })

    renderPlayerPage()

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/login")
    })
    expect(database.from).not.toHaveBeenCalled()
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it("redirects signed-in unassociated users to the roster without queries", async () => {
    session.useAppSession.mockReturnValue({
      isAssociated: false,
      isManager: false,
      loading: false,
      profile: null,
      targetSeason: null,
      user: { id: "user-1" },
    })

    renderPlayerPage()

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/squadra")
    })
    expect(database.from).not.toHaveBeenCalled()
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it("shows only teammate-safe data and never queries private tables", async () => {
    session.useAppSession.mockReturnValue(approvedSession())

    renderPlayerPage()

    expect(
      await screen.findByRole("heading", { level: 1, name: "Elio Dorbolò" }),
    ).toBeVisible()
    expect(database.rpc).toHaveBeenCalledWith("get_player_profile", {
      p_profile_id: "player-1",
      p_season_id: "season-2025",
    })
    expect(database.filters).toEqual(
      expect.arrayContaining([
        {
          table: "seasons",
          method: "lte",
          column: "starts_on",
          value: "2026-07-29",
        },
        {
          table: "seasons",
          method: "gte",
          column: "ends_on",
          value: "2026-07-29",
        },
      ]),
    )
    expect(database.filters).not.toContainEqual(
      expect.objectContaining({
        table: "seasons",
        method: "eq",
        column: "slug",
      }),
    )
    expect(screen.getByLabelText("Ammonizioni: 3")).toBeVisible()
    expect(screen.getByLabelText("Espulsioni: 1")).toBeVisible()
    expect(queriedTables()).toEqual(["seasons"])
    expect(screen.queryByText("Tesseramento")).not.toBeInTheDocument()
    expect(screen.queryByText("Contatti operativi")).not.toBeInTheDocument()
  })

  it("shows the owner's operations and attendance with explicit safe selects", async () => {
    session.useAppSession.mockReturnValue(approvedSession("player-1"))

    renderPlayerPage()

    expect(
      await screen.findByRole("heading", { name: "Tesseramento" }),
    ).toBeVisible()
    expect(screen.getByText("Pagamenti")).toBeVisible()
    expect(screen.getByText("Certificato medico")).toBeVisible()
    expect(screen.getByText("Presenze")).toBeVisible()
    expect(screen.queryByText("Contatti operativi")).not.toBeInTheDocument()
    expect(queriedTables()).toEqual([
      "seasons",
      "season_memberships",
      "payments",
      "medical_certificates",
      "events",
      "event_checkins",
    ])
    expect(database.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "season_memberships",
          columns:
            "id, status, registration_status, registration_completed_on, asi_card_number",
        }),
        expect.objectContaining({
          table: "payments",
          columns: "id, description, amount_due, due_on, status",
        }),
        expect.objectContaining({
          table: "medical_certificates",
          columns: "id, expires_on, laboratory, status",
        }),
      ]),
    )
    expect(
      database.selections.some(
        ({ columns }) =>
          columns.includes("*") || columns.includes("note_mediche"),
      ),
    ).toBe(false)
  })

  it("shows manager operational contacts without medical notes", async () => {
    session.useAppSession.mockReturnValue(
      approvedSession("manager-1", true),
    )

    renderPlayerPage()

    expect(await screen.findByText("Contatti operativi")).toBeVisible()
    expect(screen.getByText("+39 333 1234567")).toBeVisible()
    expect(screen.getByText("elio@example.test")).toBeVisible()
    expect(queriedTables()).toEqual([
      "seasons",
      "season_memberships",
      "payments",
      "medical_certificates",
      "profile_private_details",
    ])
    expect(database.selections).toContainEqual({
      table: "profile_private_details",
      columns: "phone, operational_email",
    })
    expect(
      database.selections.some(({ columns }) =>
        columns.includes("note_mediche"),
      ),
    ).toBe(false)
  })

  it("resolves an explicitly selected season by slug before the safe RPC", async () => {
    session.useAppSession.mockReturnValue({
      ...approvedSession(),
      targetSeason: null,
    })
    database.rpcResults.push(
      Promise.resolve({
        data: { ...database.safePlayer, season_id: "season-2026" },
        error: null,
      }),
    )

    renderPlayerPage({ season: "2026-2027" })

    expect(
      await screen.findByRole("heading", { level: 1, name: "Elio Dorbolò" }),
    ).toBeVisible()
    expect(database.filters).toContainEqual({
      table: "seasons",
      method: "eq",
      column: "slug",
      value: "2026-2027",
    })
    expect(database.rpc).toHaveBeenCalledWith("get_player_profile", {
      p_profile_id: "player-1",
      p_season_id: "season-2026",
    })
  })

  it("renders not found when the safe RPC returns no row", async () => {
    session.useAppSession.mockReturnValue(approvedSession())
    database.rpcResults.push(
      Promise.resolve({ data: null, error: null }),
    )

    renderPlayerPage()

    expect(await screen.findByText("Giocatore non trovato.")).toBeVisible()
    expect(queriedTables()).toEqual(["seasons"])
  })

  it("renders a non-leaking alert when the safe RPC fails", async () => {
    session.useAppSession.mockReturnValue(approvedSession())
    database.rpcResults.push(
      Promise.resolve({
        data: null,
        error: new Error("private RPC detail"),
      }),
    )

    renderPlayerPage()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare il profilo.",
    )
    expect(screen.queryByText("private RPC detail")).not.toBeInTheDocument()
    expect(screen.queryByText("Elio Dorbolò")).not.toBeInTheDocument()
    expect(queriedTables()).toEqual(["seasons"])
  })

  it("ignores a stale safe-profile response after the player id changes", async () => {
    session.useAppSession.mockReturnValue(approvedSession())
    const firstProfile = deferred<{ data: unknown; error: unknown }>()
    database.rpcResults.push(
      firstProfile.promise,
      Promise.resolve({
        data: {
          ...database.safePlayer,
          profile_id: "player-2",
          nome: "Nino",
          cognome: "Nuovo",
        },
        error: null,
      }),
    )

    const rendered = renderPlayerPage()
    await waitFor(() => expect(database.rpc).toHaveBeenCalledOnce())

    rendered.rerender(playerPage({ id: "player-2" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Nino Nuovo" }),
    ).toBeVisible()

    firstProfile.resolve({ data: database.safePlayer, error: null })
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Nino Nuovo" }),
      ).toBeVisible()
    })
    expect(
      screen.queryByRole("heading", { level: 1, name: "Elio Dorbolò" }),
    ).not.toBeInTheDocument()
  })
})
