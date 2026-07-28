import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useNextMatchFormation } from "@/components/formations/useNextMatchFormation"

const apiMocks = vi.hoisted(() => ({
  fetchNextChigiMatch: vi.fn(),
  fetchTeamLogoByName: vi.fn(),
}))

const databaseMocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return {
    from: vi.fn(() => query),
    query,
  }
})

vi.mock("@/lib/api", () => apiMocks)
vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    from: databaseMocks.from,
  },
}))

function Probe() {
  const { loading, match } = useNextMatchFormation()
  return (
    <>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="match">{JSON.stringify(match)}</span>
    </>
  )
}

describe("useNextMatchFormation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    databaseMocks.query.select.mockReturnValue(databaseMocks.query)
    databaseMocks.query.eq.mockReturnValue(databaseMocks.query)
    apiMocks.fetchNextChigiMatch.mockResolvedValue({
      id: "match-1",
      created_at: "2026-07-01T10:00:00+02:00",
      tipo: "PARTITA",
      data_ora: "2026-07-30T21:15:00+02:00",
      luogo: "Roma",
      giocata: false,
      cancellato: false,
      squadra_casa: "Chigi",
      squadra_ospite: "PSICOLOGOL",
    })
    apiMocks.fetchTeamLogoByName.mockResolvedValue("/teams/psicologi.png")
    databaseMocks.query.maybeSingle.mockResolvedValue({
      data: {
        id: "formation-1",
        published_at: "2026-07-28T18:42:00+02:00",
      },
      error: null,
    })
  })

  it("combines the next opponent, logo, and published official formation", async () => {
    render(<Probe />)

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })
    expect(screen.getByTestId("match")).toHaveTextContent(
      JSON.stringify({
        id: "match-1",
        opponent: "PSICOLOGOL",
        opponentLogoUrl: "/teams/psicologi.png",
        startsAt: "2026-07-30T21:15:00+02:00",
        publishedAt: "2026-07-28T18:42:00+02:00",
      }),
    )
    expect(databaseMocks.query.select).toHaveBeenCalledWith("id,published_at")
  })
})
