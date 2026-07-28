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
  status: "YES" as const,
}

describe("PlayerRosterCard", () => {
  it("orders name, surname, shirt number, role, and centered stats", () => {
    render(
      <PlayerRosterCard
        player={player}
        stats={{ goals: 2, assists: 1, player_of_match: 1 }}
      />,
    )
    const card = screen.getByRole("article", { name: "Elio Dorbolò" })
    const values = within(card).getAllByTestId(
      /player-(first-name|surname|shirt|role|stats)/,
    )
    expect(values.map((element) => element.dataset.testid)).toEqual([
      "player-first-name",
      "player-surname",
      "player-shirt",
      "player-role",
      "player-stats",
    ])
    expect(within(card).getByLabelText("Numero 8")).toBeVisible()
    expect(within(card).getByText("CENTROCAMPISTA")).toBeVisible()
  })

  it("keeps maybe status visible without replacing player data", () => {
    render(<PlayerRosterCard player={{ ...player, status: "MAYBE" }} />)
    expect(screen.getByText("Forse")).toBeVisible()
    expect(screen.getByText("Dorbolò")).toBeVisible()
  })
})
