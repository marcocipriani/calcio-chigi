import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OfficialFormationPanel } from "@/components/formations/OfficialFormationPanel"

const session = vi.hoisted(() => ({ isManager: false }))
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const databaseMocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  return { from: vi.fn(() => query), query, rpc: vi.fn() }
})

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: () => session,
}))
vi.mock("sonner", () => ({ toast: toastMocks }))
vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: { from: databaseMocks.from, rpc: databaseMocks.rpc },
}))

const event = {
  data_ora: "2026-10-01T21:00:00",
  tipo: "PARTITA" as const,
  luogo: "SS Romulea",
  squadra_casa: "CIRC. CHIGI",
  squadra_ospite: "TASSISTI",
}

const privateFormation = {
  id: "formation-1",
  formation_module: "4-4-2",
  shirt_color: "ROSSA",
  visibility: "PRIVATE",
  published_at: "2026-09-30T18:00:00+02:00",
  official_formation_players: [
    {
      id: "row-1",
      is_starter: true,
      position_key: "POR",
      sort_order: 0,
      player_snapshot: { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE" },
    },
    {
      id: "row-2",
      is_starter: false,
      position_key: "P1",
      sort_order: 1,
      player_snapshot: { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE" },
    },
  ],
}

describe("OfficialFormationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.isManager = false
    databaseMocks.query.select.mockReturnValue(databaseMocks.query)
    databaseMocks.query.eq.mockReturnValue(databaseMocks.query)
    databaseMocks.query.maybeSingle.mockResolvedValue({ data: null, error: null })
    databaseMocks.rpc.mockResolvedValue({ data: [], error: null })
  })

  it("shows a player only the call-ups of a private formation", async () => {
    databaseMocks.rpc.mockResolvedValue({
      data: [
        {
          nome: "Leonardo",
          cognome: "Campoli",
          avatar_url: null,
          role: "DIFENSORE",
          birth_date: "1980-01-01",
          shirt_color: "ROSSA",
          published_at: "2026-09-30T18:00:00+02:00",
        },
        {
          nome: "Lorenzo",
          cognome: "Troiani",
          avatar_url: null,
          role: "PORTIERE",
          birth_date: "2000-01-01",
          shirt_color: "ROSSA",
          published_at: "2026-09-30T18:00:00+02:00",
        },
      ],
      error: null,
    })

    render(<OfficialFormationPanel event={event} eventId="event-1" />)

    expect(
      await screen.findByRole("heading", { name: "Convocati" }),
    ).toBeInTheDocument()
    expect(databaseMocks.rpc).toHaveBeenCalledWith("get_event_callups", {
      p_event_id: "event-1",
    })
    expect(screen.getByText("Leonardo Campoli")).toBeInTheDocument()
    expect(screen.getByText("Lorenzo Troiani")).toBeInTheDocument()
    expect(screen.getByText(/maglia rossa/)).toBeInTheDocument()
    expect(screen.queryByText("Titolari")).not.toBeInTheDocument()
    expect(screen.queryByText(/Modulo/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("lists call-ups by surname the way the WhatsApp message does", async () => {
    const callup = (nome: string, cognome: string) => ({
      nome,
      cognome,
      avatar_url: null,
      role: "DIFENSORE",
      birth_date: "1980-01-01",
      shirt_color: null,
      published_at: "2026-09-30T18:00:00+02:00",
    })
    // Ordine del database: l'apostrofo precede le lettere.
    databaseMocks.rpc.mockResolvedValue({
      data: [
        callup("Michele", "D'Oria"),
        callup("Andrea", "Di Mucci"),
        callup("Domenico", "Crisci"),
      ],
      error: null,
    })

    render(<OfficialFormationPanel event={event} eventId="event-1" />)

    await screen.findByRole("heading", { name: "Convocati" })
    expect(
      screen.getAllByText(/Crisci|Di Mucci|D'Oria/).map((node) => node.textContent),
    ).toEqual(["Domenico Crisci", "Andrea Di Mucci", "Michele D'Oria"])
  })

  it("renders nothing for a player when nothing is published", async () => {
    const { container } = render(
      <OfficialFormationPanel event={event} eventId="event-1" />,
    )

    await waitFor(() => expect(databaseMocks.rpc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("lets a manager see the private lineup and make it public", async () => {
    session.isManager = true
    databaseMocks.query.maybeSingle.mockResolvedValue({
      data: privateFormation,
      error: null,
    })
    databaseMocks.rpc.mockResolvedValue({ data: {}, error: null })
    const onCallups = vi.fn()

    render(
      <OfficialFormationPanel
        event={event}
        eventId="event-1"
        onCallups={onCallups}
      />,
    )

    expect(await screen.findByText("Titolari")).toBeInTheDocument()
    expect(screen.getByText("Privata")).toBeInTheDocument()
    expect(onCallups).toHaveBeenLastCalledWith({
      shirtColor: "ROSSA",
      players: [
        { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE", birthDate: undefined, isStarter: true },
        { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE", birthDate: undefined, isStarter: false },
      ],
    })

    fireEvent.click(screen.getByRole("button", { name: "Rendi pubblica" }))

    expect(await screen.findByText("Pubblica")).toBeInTheDocument()
    expect(databaseMocks.rpc).toHaveBeenCalledWith(
      "set_official_formation_visibility",
      { p_event_id: "event-1", p_visibility: "PUBLIC" },
    )
    expect(
      screen.getByRole("button", { name: "Rendi privata" }),
    ).toBeInTheDocument()
  })

  it("keeps the badge and reports the error when the visibility change fails", async () => {
    session.isManager = true
    databaseMocks.query.maybeSingle.mockResolvedValue({
      data: privateFormation,
      error: null,
    })
    databaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Manager role required" },
    })

    render(<OfficialFormationPanel event={event} eventId="event-1" />)
    fireEvent.click(
      await screen.findByRole("button", { name: "Rendi pubblica" }),
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Visibilità non aggiornata",
        { description: "Manager role required" },
      ),
    )
    expect(screen.getByText("Privata")).toBeInTheDocument()
    expect(screen.queryByText("Pubblica")).not.toBeInTheDocument()
  })
})
