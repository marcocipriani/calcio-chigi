import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { JerseyBoardRow } from "@/lib/jersey-api"

const session = vi.hoisted(() => ({ useAppSession: vi.fn() }))
const api = vi.hoisted(() => ({
  confirmJerseyDraft: vi.fn(),
  fetchJerseyBoard: vi.fn(),
  fetchJerseyDraft: vi.fn(),
  fetchJerseyPreferenceVersions: vi.fn(),
  fetchSeasonAvoidedNumbers: vi.fn(),
  publishJerseyDraft: vi.fn(),
  sendJerseyPreferenceReminder: vi.fn(),
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))
vi.mock("@/lib/jersey-api", () => api)
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: {} }))

import { JerseyAssignmentManager } from "@/components/jersey/JerseyAssignmentManager"

function row(
  membershipId: string,
  nome: string,
  choices: JerseyBoardRow["choices"],
  extra: Partial<JerseyBoardRow> = {},
): JerseyBoardRow {
  return {
    membershipId,
    profileId: `profile-${membershipId}`,
    nome,
    cognome: "Test",
    avatarUrl: null,
    role: null,
    jerseyNumber: null,
    previousJerseyNumber: null,
    choices,
    updatedAt: choices.length ? "2026-09-20T10:00:00Z" : null,
    ...extra,
  }
}

describe("JerseyAssignmentManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.useAppSession.mockReturnValue({
      isManager: true,
      loading: false,
      targetSeason: {
        id: "season-1",
        slug: "2026-2027",
        name: "Stagione 2026–2027",
        starts_on: "2026-08-01",
        ends_on: "2027-07-31",
      },
      user: { id: "user-1" },
    })
    api.fetchJerseyBoard.mockResolvedValue([
      row(
        "anna",
        "Anna",
        [
          { number: 10, level: "PREFERRED" },
          { number: 14, level: "ACCEPTABLE" },
        ],
        { previousJerseyNumber: 10 },
      ),
      row("bruno", "Bruno", [
        { number: 10, level: "PREFERRED" },
        { number: 21, level: "ACCEPTABLE" },
      ]),
      row("carlo", "Carlo", []),
    ])
    api.fetchJerseyDraft.mockResolvedValue(null)
    api.fetchSeasonAvoidedNumbers.mockResolvedValue(new Map())
    api.fetchJerseyPreferenceVersions.mockResolvedValue([])
    api.publishJerseyDraft.mockResolvedValue(undefined)
  })

  it("explains preferred conflicts and resolves them with acceptable numbers", async () => {
    render(<JerseyAssignmentManager />)

    const conflicts = await screen.findByText("Conflitti da decidere")
    const card = conflicts.closest("[data-slot=card]") as HTMLElement
    expect(card).toHaveTextContent(
      "#10 preferito da Anna T. (1ª, possibile riconferma), Bruno T. (1ª)",
    )
    expect(card).toHaveTextContent("potrebbe vincere per riconferma")
    expect(screen.getByLabelText("Numero di Anna Test")).toHaveValue("14")
    expect(screen.getByLabelText("Numero di Bruno Test")).toHaveValue("21")

    fireEvent.click(
      within(card).getByRole("button", { name: /#10 a Anna T\./ }),
    )
    expect(screen.getByLabelText("Numero di Anna Test")).toHaveValue("10")
    expect(screen.getByLabelText("Numero di Bruno Test")).toHaveValue("21")
    expect(screen.getByRole("button", { name: /Rendi definitivi/ })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: /Pubblica bozza/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Pubblica" }))

    await waitFor(() =>
      expect(api.publishJerseyDraft).toHaveBeenCalledWith(
        expect.anything(),
        "season-1",
        { anna: 10, bruno: 21, carlo: null },
      ),
    )
  })

  it("flags preferences changed after the published draft", async () => {
    api.fetchJerseyDraft.mockResolvedValue({
      seasonId: "season-1",
      assignment: { anna: 14, bruno: 21, carlo: null },
      publishedAt: "2026-09-19T10:00:00Z",
      confirmedAt: null,
    })

    render(<JerseyAssignmentManager />)

    expect(
      await screen.findAllByText("Modificate dopo la bozza"),
    ).toHaveLength(3)
    expect(
      screen.getByRole("button", { name: /Rendi definitivi/ }),
    ).toBeEnabled()
  })

  it("sends the push reminder to players without preferences", async () => {
    api.sendJerseyPreferenceReminder.mockResolvedValue(1)
    render(<JerseyAssignmentManager />)

    expect(
      await screen.findByText("Chi deve ancora scegliere"),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", { name: /Invia notifica ai mancanti/ }),
    )

    await waitFor(() =>
      expect(api.sendJerseyPreferenceReminder).toHaveBeenCalledWith(
        expect.anything(),
        "season-1",
      ),
    )
  })
})
