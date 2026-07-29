import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TeamTitleBar } from "@/components/team/TeamTitleBar"

const match = {
  id: "match-1",
  opponent: "PSICOLOGOL",
  opponentLogoUrl: "/teams/psicologi.png",
  startsAt: "2026-07-30T21:15:00+02:00",
  publishedAt: null,
}

describe("TeamTitleBar", () => {
  it("shows the public playground without manager controls", () => {
    render(
      <TeamTitleBar
        isManager={false}
        match={null}
        matchError={null}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(
      screen.getByRole("button", { name: "Crea la tua formazione" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Pubblica formazione" }),
    ).not.toBeInTheDocument()
  })

  it("shows the purple official action to managers", () => {
    render(
      <TeamTitleBar
        isManager
        match={match}
        matchError={null}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(
      screen.getByRole("button", { name: "Pubblica formazione" }),
    ).toHaveClass("bg-violet-600")
  })

  it("disables the official action when managers have no next match", () => {
    render(
      <TeamTitleBar
        isManager
        match={null}
        matchError={null}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(
      screen.getByRole("button", { name: "Pubblica formazione" }),
    ).toBeDisabled()
  })

  it("makes the disabled reason keyboard-accessible on every viewport", () => {
    render(
      <TeamTitleBar
        isManager
        match={null}
        matchError={null}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    const explanationTrigger = screen.getByRole("group", {
      name: "Pubblica formazione: Nessuna prossima partita",
    })

    expect(explanationTrigger).toHaveAttribute("tabindex", "0")
    expect(explanationTrigger).toHaveAccessibleDescription(
      "Nessuna prossima partita",
    )
    const officialAction = screen.getByRole("button", {
      name: "Pubblica formazione",
    })
    expect(officialAction).toBeDisabled()
    expect(officialAction).toHaveAccessibleDescription(
      "Nessuna prossima partita",
    )
  })

  it("keeps loading distinct from a genuine missing next match", () => {
    render(
      <TeamTitleBar
        isManager
        match={null}
        matchError={null}
        matchLoading
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )

    const officialAction = screen.getByRole("button", {
      name: "Pubblica formazione",
    })
    expect(officialAction).toBeDisabled()
    expect(officialAction).toHaveAccessibleDescription(
      "Caricamento prossima partita",
    )
    expect(officialAction).not.toHaveAccessibleDescription(
      "Nessuna prossima partita",
    )
  })

  it("exposes lookup failure without labelling it as no next match", () => {
    render(
      <TeamTitleBar
        isManager
        match={null}
        matchError={new Error("official lookup failed")}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossibile caricare la prossima partita",
    )
    const officialAction = screen.getByRole("button", {
      name: "Pubblica formazione",
    })
    expect(officialAction).toHaveAccessibleDescription(
      "Impossibile caricare la prossima partita",
    )
    expect(officialAction).not.toHaveAccessibleDescription(
      "Nessuna prossima partita",
    )
  })

  it("restores the season eyebrow and 44px mobile action targets", () => {
    render(
      <TeamTitleBar
        isManager
        match={match}
        matchError={null}
        matchLoading={false}
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )

    expect(screen.getByText("Stagione in corso")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Crea la tua formazione" }),
    ).toHaveClass("size-11", "rounded-full", "sm:rounded-md")
    expect(
      screen.getByRole("button", { name: "Pubblica formazione" }),
    ).toHaveClass("size-11", "rounded-full", "sm:rounded-md")
  })
})
