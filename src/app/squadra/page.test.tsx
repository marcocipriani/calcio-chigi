import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const formation = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

vi.mock("next/dynamic", () => ({
  default: () =>
    function FormationBuilderMock({
      mode,
      onPublished,
    }: {
      mode: "PLAYGROUND" | "OFFICIAL"
      onPublished?: () => void
    }) {
      return (
        <div data-formation-builder-mode={mode}>
          <h2>
            {mode === "PLAYGROUND"
              ? "Crea la tua formazione"
              : "Formazione ufficiale"}
          </h2>
          <button onClick={onPublished} type="button">
            Pubblica mock
          </button>
        </div>
      )
    },
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))

vi.mock("@/components/formations/useNextMatchFormation", () => ({
  useNextMatchFormation: () => ({
    error: null,
    loading: false,
    match: {
      id: "match-1",
      opponent: "PSICOLOGOL",
      opponentLogoUrl: null,
      startsAt: "2026-08-10T20:00:00+02:00",
      publishedAt: null,
    },
    refresh: formation.refresh,
  }),
}))

vi.mock("@/components/team/PublicTeam", () => ({
  PublicTeam: ({ canViewProfiles }: { canViewProfiles: boolean }) => (
    <section data-associated={String(canViewProfiles)}>
      <div data-player-grid />
    </section>
  ),
}))

import TeamPage from "@/app/squadra/page"

describe("TeamPage inline formation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.useAppSession.mockReturnValue({
      isAssociated: true,
      isManager: true,
    })
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it("passes the approved association to the public roster", () => {
    const { container } = render(<TeamPage />)

    expect(container.querySelector("[data-associated]")).toHaveAttribute(
      "data-associated",
      "true",
    )
  })

  it("mounts, focuses, and scrolls the playground between titlebar and roster", async () => {
    const scrollIntoView = vi.spyOn(
      HTMLElement.prototype,
      "scrollIntoView",
    )
    const { container } = render(<TeamPage />)

    fireEvent.click(
      screen.getByRole("button", { name: "Crea la tua formazione" }),
    )

    const builder = await screen.findByRole("region", {
      name: "Crea la tua formazione",
    })
    const titlebar = screen.getByRole("heading", {
      level: 1,
      name: "Squadra",
    }).closest("header")
    const grid = container.querySelector("[data-player-grid]")

    if (!titlebar || !grid) throw new Error("Expected titlebar and roster grid")
    expect(titlebar.nextElementSibling).toBe(builder)
    expect(builder.compareDocumentPosition(grid)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(builder).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" })

    fireEvent.click(screen.getByRole("button", { name: "Chiudi formazione" }))
    expect(
      screen.queryByRole("region", { name: "Crea la tua formazione" }),
    ).not.toBeInTheDocument()
  })

  it("uses the same inline slot for official formations and refreshes publish", async () => {
    render(<TeamPage />)

    fireEvent.click(
      screen.getByRole("button", { name: "Pubblica formazione" }),
    )
    const builder = await screen.findByRole("region", {
      name: "Formazione ufficiale",
    })

    expect(builder.previousElementSibling).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Squadra" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Pubblica mock" }))
    expect(formation.refresh).toHaveBeenCalledOnce()
  })

  it("does not animate scrolling when reduced motion is preferred", async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const scrollIntoView = vi.spyOn(
      HTMLElement.prototype,
      "scrollIntoView",
    )
    render(<TeamPage />)

    fireEvent.click(
      screen.getByRole("button", { name: "Crea la tua formazione" }),
    )
    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Crea la tua formazione" }),
      ).toHaveFocus()
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
