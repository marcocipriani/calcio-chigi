import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import Home from "@/app/page"

const { removeChannel } = vi.hoisted(() => ({ removeChannel: vi.fn() }))

vi.mock("@/lib/api", () => ({
  fetchCalendarEvents: vi.fn().mockResolvedValue([]),
  fetchTeams: vi.fn().mockResolvedValue([]),
  getUserContext: vi.fn().mockResolvedValue({
    isManager: true,
    defaultView: "ACTIVITY",
  }),
}))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel,
  },
}))

describe("Calendar page", () => {
  it("keeps one desktop title action and one mobile FAB for managers", async () => {
    render(<Home />)

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Calendario" }),
      ).toBeVisible()
    })

    const addActions = screen.getAllByRole("button", {
      name: "Aggiungi evento",
    })
    expect(addActions).toHaveLength(2)
    expect(
      addActions.find((action) => action.classList.contains("sm:inline-flex")),
    ).toHaveClass("hidden", "sm:inline-flex")
    expect(
      addActions.find((action) => action.classList.contains("sm:hidden")),
    ).toHaveClass("sm:hidden", "fixed", "size-14")
  })
})
