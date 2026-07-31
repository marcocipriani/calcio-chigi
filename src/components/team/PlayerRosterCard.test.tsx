import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PlayerRosterCard } from "@/components/team/PlayerRosterCard"

const player = {
  id: "player-1",
  nome: "Elio",
  cognome: "Dorbolò",
  avatar_url: null,
  role: "CENTROCAMPISTA",
  jersey_number: 8,
  is_u35: true,
  status: "YES" as const,
}

describe("PlayerRosterCard", () => {
  it("does not expose a profile link without an approved association", () => {
    render(<PlayerRosterCard canViewProfile={false} player={player} />)

    expect(
      screen.queryByRole("link", { name: /profilo di/i }),
    ).not.toBeInTheDocument()
  })

  it("exposes exactly one circular profile link to approved teammates", () => {
    render(<PlayerRosterCard canViewProfile player={player} />)

    const links = screen.getAllByRole("link", {
      name: "Profilo di Elio Dorbolò",
    })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "/giocatore/player-1")
    expect(links[0]).toHaveClass("rounded-full")
    expect(links[0]).toHaveClass("right-1", "top-1")
  })

  it("keeps role and shirt number on one accessible row before centered stats", () => {
    render(
      <PlayerRosterCard
        player={player}
        stats={{ goals: 2, assists: 1, player_of_match: 1 }}
      />,
    )
    const card = screen.getByRole("article", { name: "Elio Dorbolò" })
    const values = within(card).getAllByTestId(
      /player-(first-name|surname|role-row|stats)/,
    )
    expect(values.map((element) => element.dataset.testid)).toEqual([
      "player-first-name",
      "player-surname",
      "player-role-row",
      "player-stats",
    ])
    expect(within(card).getByLabelText("Numero 8")).toBeVisible()
    expect(within(card).getByText("CENTROCAMPISTA")).toBeVisible()
    expect(within(card).getByText("U35")).toHaveClass(
      "bg-sky-100",
      "text-sky-700",
    )
  })

  it("keeps maybe status visible without replacing player data", () => {
    render(
      <PlayerRosterCard muted player={{ ...player, status: "MAYBE" }} />,
    )
    expect(screen.getByText("Forse")).toBeVisible()
    expect(screen.getByText("Dorbolò")).toBeVisible()
    expect(screen.getByRole("article", { name: "Elio Dorbolò" })).toHaveClass(
      "border-dashed",
      "border-amber-300",
    )
    expect(
      screen.queryByRole("link", { name: /profilo di/i }),
    ).not.toBeInTheDocument()
  })
})
