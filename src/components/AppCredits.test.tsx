import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppCredits } from "@/components/AppCredits"

describe("AppCredits", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("shows the build date injected by next.config", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_UPDATED_AT", "25 settembre 2026")
    render(<AppCredits />)

    expect(
      screen.getByText("Ultimo aggiornamento: 25 settembre 2026"),
    ).toBeVisible()
  })

  it("hides the update line when no build date is available", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_UPDATED_AT", "")
    render(<AppCredits />)

    expect(screen.queryByText(/Ultimo aggiornamento/)).not.toBeInTheDocument()
  })
})
