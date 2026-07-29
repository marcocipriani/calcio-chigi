import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
        gol_casa: null as number | null,
        gol_ospite: null as number | null,
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

const realtime = vi.hoisted(() => ({
  callback: undefined as undefined | (() => void),
}))

const supabase = vi.hoisted(() => ({
  channel: vi.fn(() => ({
    on: vi.fn((_: unknown, __: unknown, callback: () => void) => {
      realtime.callback = callback
      return { subscribe: vi.fn() }
    }),
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

  it("shows an edition-specific error when the default season is unavailable", async () => {
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: [],
          error: new Error("seasons unavailable"),
        }),
      })),
    }))

    render(<TorneoPage />)

    expect(
      await screen.findByText("Impossibile caricare il torneo 2026/27."),
    ).toBeVisible()
  })

  it("rejects a seasons response missing one configured edition", async () => {
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: [{ id: "season-2026", slug: "2026-2027" }],
          error: null,
        }),
      })),
    }))

    render(<TorneoPage />)

    expect(
      await screen.findByText("Impossibile caricare il torneo 2026/27."),
    ).toBeVisible()
  })

  it("keeps the manager score action responsive and named", async () => {
    api.getUserContext.mockResolvedValueOnce({ isManager: true })
    render(<TorneoPage />)

    const action = await screen.findByRole("button", {
      name: "Modifica risultati",
    })
    expect(action).toHaveClass("h-11", "w-11", "sm:w-auto", "sm:rounded-md")
    expect(action).toHaveAttribute("title", "Modifica risultati")
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
    api.fetchSeasonEvents.mockClear()
    render(<StandingsContent fase="ALL" seasonId="season-2026" />)

    expect(
      screen.getByText("Seleziona una fase per vedere la classifica"),
    ).toBeVisible()
    expect(api.fetchSeasonEvents).not.toHaveBeenCalled()
  })

  it("ignores a stale standings response after changing phase or season", async () => {
    type Match = Awaited<ReturnType<typeof api.fetchSeasonEvents>>[number]
    let resolveFirst: (matches: Match[]) => void
    const first = new Promise<Match[]>((resolve) => {
      resolveFirst = resolve
    })
    const teams = [
      { id: "alpha", nome: "Alpha", slug: "alpha" },
      { id: "bravo", nome: "Bravo", slug: "bravo" },
      { id: "charlie", nome: "Charlie", slug: "charlie" },
      { id: "delta", nome: "Delta", slug: "delta" },
    ]

    api.fetchTeams.mockResolvedValue(teams)
    api.fetchSeasonEvents
      .mockReset()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce([
        {
          id: "current",
          season_id: "season-current",
          tipo: "PARTITA",
          data_ora: "2026-08-20T19:00:00.000Z",
          luogo: "Campo",
          giocata: true,
          cancellato: false,
          giornata: 2,
          fase: "FASE_2_CALCIATORI",
          squadra_casa: "Charlie",
          squadra_ospite: "Delta",
          gol_casa: 1,
          gol_ospite: 0,
        },
      ])

    const rendered = render(
      <StandingsContent fase="FASE_1" seasonId="season-stale" />,
    )
    await waitFor(() => expect(api.fetchSeasonEvents).toHaveBeenCalledTimes(1))

    rendered.rerender(
      <StandingsContent fase="FASE_2_CALCIATORI" seasonId="season-current" />,
    )
    expect(await screen.findByText("Charlie")).toBeVisible()

    await act(async () => {
      resolveFirst!([
        {
          id: "stale",
          season_id: "season-stale",
          tipo: "PARTITA",
          data_ora: "2026-08-20T19:00:00.000Z",
          luogo: "Campo",
          giocata: true,
          cancellato: false,
          giornata: 1,
          fase: "FASE_1",
          squadra_casa: "Alpha",
          squadra_ospite: "Bravo",
          gol_casa: 1,
          gol_ospite: 0,
        },
      ])
    })

    expect(screen.getByText("Charlie")).toBeVisible()
    expect(screen.queryByText("Alpha")).toBeNull()
  })

  it("ignores an older realtime standings response for the same selection", async () => {
    type Match = Awaited<ReturnType<typeof api.fetchSeasonEvents>>[number]
    let resolveFirst: (matches: Match[]) => void
    let resolveSecond: (matches: Match[]) => void
    const first = new Promise<Match[]>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<Match[]>((resolve) => {
      resolveSecond = resolve
    })
    const teams = [
      { id: "alpha", nome: "Alpha", slug: "alpha" },
      { id: "bravo", nome: "Bravo", slug: "bravo" },
      { id: "charlie", nome: "Charlie", slug: "charlie" },
      { id: "delta", nome: "Delta", slug: "delta" },
    ]

    realtime.callback = undefined
    api.fetchTeams.mockResolvedValue(teams)
    api.fetchSeasonEvents.mockReset().mockReturnValueOnce(first).mockReturnValueOnce(second)

    render(<StandingsContent fase="FASE_1" seasonId="season-current" />)
    await waitFor(() => expect(api.fetchSeasonEvents).toHaveBeenCalledTimes(1))
    expect(realtime.callback).toBeTypeOf("function")

    act(() => realtime.callback!())
    await waitFor(() => expect(api.fetchSeasonEvents).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveSecond!([
        {
          id: "current",
          season_id: "season-current",
          tipo: "PARTITA",
          data_ora: "2026-08-20T19:00:00.000Z",
          luogo: "Campo",
          giocata: true,
          cancellato: false,
          giornata: 1,
          fase: "FASE_1",
          squadra_casa: "Charlie",
          squadra_ospite: "Delta",
          gol_casa: 1,
          gol_ospite: 0,
        },
      ])
    })
    expect(screen.getByText("Charlie")).toBeVisible()

    await act(async () => {
      resolveFirst!([
        {
          id: "stale",
          season_id: "season-current",
          tipo: "PARTITA",
          data_ora: "2026-08-20T19:00:00.000Z",
          luogo: "Campo",
          giocata: true,
          cancellato: false,
          giornata: 1,
          fase: "FASE_1",
          squadra_casa: "Alpha",
          squadra_ospite: "Bravo",
          gol_casa: 1,
          gol_ospite: 0,
        },
      ])
    })

    expect(screen.getByText("Charlie")).toBeVisible()
    expect(screen.queryByText("Alpha")).toBeNull()
  })
})
