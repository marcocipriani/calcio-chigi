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
        onOpenOfficial={() => undefined}
        onOpenPlayground={() => undefined}
      />,
    )
    expect(
      screen.getByRole("button", { name: "Pubblica formazione" }),
    ).toBeDisabled()
  })
})
