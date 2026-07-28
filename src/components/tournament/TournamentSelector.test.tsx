import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  TournamentSelector,
  TOURNAMENTS,
} from "@/components/tournament/TournamentSelector"

describe("TournamentSelector", () => {
  it("exposes the tournament label and current competition", () => {
    const onValueChange = vi.fn()
    render(
      <TournamentSelector
        onValueChange={onValueChange}
        value={TOURNAMENTS[0].id}
      />,
    )
    expect(screen.getByText("Torneo")).toBeVisible()
    expect(
      screen.getByRole("combobox", {
        name: "Torneo",
      }),
    ).toHaveTextContent("Campionato ASI Over35 2025/2026")
    fireEvent.click(screen.getByRole("combobox", { name: "Torneo" }))
    expect(screen.getByRole("option", { name: TOURNAMENTS[0].label })).toBeVisible()
  })
})
