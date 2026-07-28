import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NextMatchCapsule } from "@/components/formations/NextMatchCapsule"

const match = {
  id: "match-1",
  opponent: "PSICOLOGOL",
  opponentLogoUrl: "/teams/psicologi.png",
  startsAt: "2026-07-30T21:15:00+02:00",
  publishedAt: null,
}

describe("NextMatchCapsule", () => {
  it("falls back to the opponent initial when no logo is available", () => {
    render(
      <NextMatchCapsule match={{ ...match, opponentLogoUrl: null }} />,
    )
    expect(screen.getByText("P")).toBeVisible()
  })

  it("uses the outline draft state before publication", () => {
    render(<NextMatchCapsule match={match} />)
    expect(screen.getByText("Da pubblicare")).toBeVisible()
    const capsule = screen.getByTestId("next-match-capsule")
    expect(capsule).toHaveAttribute("data-state", "draft")
    expect(capsule).toHaveClass("bg-white", "dark:bg-white")
    expect(capsule).not.toHaveClass("bg-background")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("uses the solid state and publication timestamp after publication", () => {
    render(
      <NextMatchCapsule
        match={{ ...match, publishedAt: "2026-07-28T18:42:00+02:00" }}
      />,
    )
    expect(
      screen.getByRole("link", { name: /formazione ufficiale/i }),
    ).toHaveAttribute("href", "/evento/match-1")
    expect(screen.getByText(/Pubblicata il 28 lug · 18:42/)).toBeVisible()
    expect(screen.getByTestId("next-match-capsule")).toHaveAttribute(
      "data-state",
      "published",
    )
  })

  it("formats Rome wall-clock parts without browser timezone normalization", () => {
    render(
      <NextMatchCapsule
        match={{
          ...match,
          startsAt: "2026-03-08T01:30:00Z",
          publishedAt: "2026-03-08T01:30:00Z",
        }}
      />,
    )

    expect(screen.getByText("dom 8 mar · 02:30")).toBeVisible()
    expect(screen.getByText("Pubblicata il 8 mar · 02:30")).toBeVisible()
  })
})
