import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const formation = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}))

vi.mock("next/dynamic", () => ({
  default: () =>
    function FormationBuilderMock({
      eventId,
      mode,
      onPublished,
    }: {
      eventId?: string
      mode: "PLAYGROUND" | "OFFICIAL"
      onPublished?: () => void
    }) {
      return (
        <div data-event-id={eventId} data-formation-builder-mode={mode}>
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
    navigation.params = new URLSearchParams()
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

  it("opens the official formation of the linked event and drops the link on close", async () => {
    navigation.params = new URLSearchParams("formazione=event-9")
    const { container } = render(<TeamPage />)

    await screen.findByRole("region", { name: "Formazione ufficiale" })
    expect(
      container.querySelector("[data-formation-builder-mode]"),
    ).toHaveAttribute("data-event-id", "event-9")

    fireEvent.click(screen.getByRole("button", { name: "Chiudi formazione" }))
    expect(navigation.replace).toHaveBeenCalledWith("/squadra", { scroll: false })
  })

  it("returns to the linked event after publishing", async () => {
    navigation.params = new URLSearchParams("formazione=event-9")
    render(<TeamPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Pubblica mock" }))
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith("/evento/event-9")
    })
    expect(formation.refresh).toHaveBeenCalledOnce()
  })

  it("ignores the formation link for non-managers", () => {
    navigation.params = new URLSearchParams("formazione=event-9")
    session.useAppSession.mockReturnValue({ isAssociated: true, isManager: false })
    render(<TeamPage />)

    expect(
      screen.queryByRole("region", { name: "Formazione ufficiale" }),
    ).not.toBeInTheDocument()
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
    expect(navigation.push).not.toHaveBeenCalled()
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
