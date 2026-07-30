import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AppCredits } from "@/components/AppCredits"

describe("AppCredits", () => {
  it("shows the current application update date", () => {
    render(<AppCredits />)

    expect(
      screen.getByText("Ultimo aggiornamento: 30 luglio 2026"),
    ).toBeVisible()
  })
})
