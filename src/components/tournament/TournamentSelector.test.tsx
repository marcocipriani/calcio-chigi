import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  fetchComunicati: vi.fn().mockResolvedValue([]),
  fetchPlayerStatisticsByPhase: vi.fn().mockResolvedValue([]),
  fetchSeasonEvents: vi.fn((_: unknown, seasonId: string) =>
    Promise.resolve([
      {
        id: seasonId,
        season_id: seasonId,
        tipo: "PARTITA",
        data_ora: "2026-08-20T19:00:00.000Z",
        luogo: "Campo",
        giocata: false,
        cancellato: false,
        giornata: seasonId === "season-2026" ? 1 : 2,
        fase: seasonId === "season-2026" ? "FASE_1" : "FASE_2_CALCIATORI",
        squadra_casa: "CIRC. CHIGI",
        squadra_ospite: "Avversari",
      },
    ]),
  ),
  fetchTeams: vi.fn().mockResolvedValue([]),
  getUserContext: vi.fn().mockResolvedValue({ isManager: false }),
}))

const supabase = vi.hoisted(() => ({
  channel: vi.fn(() => ({
    on: vi.fn(() => ({ subscribe: vi.fn() })),
  })),
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      in: vi.fn().mockResolvedValue({
        data: [
          { id: "season-2026", slug: "2026-2027" },
          { id: "season-2025", slug: "2025-2026" },
        ],
      }),
    })),
  })),
  removeChannel: vi.fn(),
}))

vi.mock("@/lib/api", () => api)
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: supabase }))

import { StandingsContent } from "@/app/classifica/page"
import TorneoPage from "@/app/torneo/page"
import {
  CommunicationsAction,
  TournamentSelector,
} from "@/components/tournament/TournamentSelector"

describe("TournamentSelector", () => {
  it("starts from 2026/27 with adjacent named tournament and phase controls", () => {
    const onSeasonChange = vi.fn()
    const onPhaseChange = vi.fn()
    render(
      <TournamentSelector
        onPhaseChange={onPhaseChange}
        onSeasonChange={onSeasonChange}
        phase="ALL"
        phaseOptions={[
          { value: "ALL", label: "Tutte le fasi" },
          { value: "FASE_1", label: "Fase 1" },
        ]}
        seasonId="2026-2027"
      />,
    )

    expect(
      screen.getByRole("combobox", {
        name: "Torneo",
      }),
    ).toHaveTextContent("2026/27")
    expect(screen.getByRole("combobox", { name: "Fase" })).toHaveTextContent(
      "Tutte le fasi",
    )
    expect(screen.getByText("Torneo").parentElement?.parentElement).toContainElement(
      screen.getByText("Fase").parentElement!,
    )

    fireEvent.click(screen.getByRole("combobox", { name: "Torneo" }))
    expect(screen.getByRole("option", { name: /2025\/26/ })).toBeVisible()
  })

  it("only exposes phases available in the selected season", () => {
    const onPhaseChange = vi.fn()
    render(
      <TournamentSelector
        onPhaseChange={onPhaseChange}
        onSeasonChange={vi.fn()}
        phase="ALL"
        phaseOptions={[{ value: "ALL", label: "Tutte le fasi" }]}
        seasonId="2026-2027"
      />,
    )

    fireEvent.click(screen.getByRole("combobox", { name: "Fase" }))
    expect(screen.getByRole("option", { name: "Tutte le fasi" })).toBeVisible()
    expect(
      screen.queryByRole("option", { name: /Coppa Lazio/i }),
    ).toBeNull()
  })

  it("resets phase when the tournament changes", async () => {
    render(<TorneoPage />)

    const phase = await screen.findByRole("combobox", { name: "Fase" })
    fireEvent.click(phase)
    fireEvent.click(screen.getByRole("option", { name: "Fase 1" }))
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Fase" })).toHaveTextContent(
        "Fase 1",
      )
    })
    fireEvent.click(screen.getByRole("combobox", { name: "Torneo" }))
    fireEvent.click(screen.getByRole("option", { name: /2025\/26/ }))

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Fase" })).toHaveTextContent(
        "Tutte le fasi",
      )
      expect(api.fetchSeasonEvents).toHaveBeenCalledWith(supabase, "season-2025")
    })
  })

  it("keeps the communications action labelled on desktop and circular on mobile", () => {
    render(<CommunicationsAction />)

    expect(screen.getByRole("button", { name: "Comunicati" })).toHaveClass(
      "sm:rounded-md",
    )
    expect(screen.getByRole("button", { name: "Comunicati" })).toHaveAttribute(
      "title",
      "Comunicati",
    )
  })

  it("does not query or render aggregate standings for all phases", () => {
    render(<StandingsContent fase="ALL" seasonId="season-2026" />)

    expect(
      screen.getByText("Seleziona una fase per vedere la classifica"),
    ).toBeVisible()
  })
})
