import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const database = vi.hoisted(() => {
  const responses = new Map<string, { data: unknown; error: unknown }>()
  const selections: Array<{ table: string; columns: string }> = []
  const from = vi.fn((table: string) => {
    const query = {
      select(columns: string) {
        selections.push({ table, columns })
        return query
      },
      eq() {
        return query
      },
      lte() {
        return query
      },
      gte() {
        return query
      },
      in() {
        return query
      },
      order() {
        return query
      },
      maybeSingle() {
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
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        profile_id: "player-1",
        season_id: "season-1",
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
      },
      error: null,
    }),
  }))

  return { from, responses, rpc, selections }
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

function renderPlayerPage() {
  const fulfilled = <T,>(value: T) =>
    Object.assign(Promise.resolve(value), {
      status: "fulfilled",
      value,
    })

  return render(
    <PlayerPage
      params={fulfilled({ id: "player-1" })}
      searchParams={fulfilled({})}
    />,
  )
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
    vi.clearAllMocks()
    database.responses.clear()
    database.selections.length = 0
    database.responses.set("seasons", {
      data: { id: "season-1", slug: "2026-2027" },
      error: null,
    })
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
    database.responses.set("events", { data: [], error: null })
    database.responses.set("event_checkins", { data: [], error: null })
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
      p_season_id: "season-1",
    })
    expect(screen.getByLabelText("Ammonizioni: 3")).toBeVisible()
    expect(screen.getByLabelText("Espulsioni: 1")).toBeVisible()
    const queriedTables = database.selections.map(({ table }) => table)
    expect(queriedTables).not.toEqual(
      expect.arrayContaining([
        "season_memberships",
        "payments",
        "medical_certificates",
        "profile_private_details",
        "event_checkins",
      ]),
    )
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
})
