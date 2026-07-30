import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import Home from "@/app/page"

const { removeChannel } = vi.hoisted(() => ({ removeChannel: vi.fn() }))

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", TestResizeObserver)

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

  it("explains the icon-only mobile add action on hover", async () => {
    render(<Home />)

    const mobileAddAction = await waitFor(() => {
      const action = screen
        .getAllByRole("button", { name: "Aggiungi evento" })
        .find((button) => button.classList.contains("sm:hidden"))
      expect(action).toBeDefined()
      return action!
    })
    fireEvent.pointerMove(mobileAddAction)

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Aggiungi evento",
    )
  })

  it("uses violet for calendar actions and selected tools", async () => {
    render(<Home />)

    const addActions = await screen.findAllByRole("button", {
      name: "Aggiungi evento",
    })
    for (const action of addActions) {
      expect(action).toHaveClass("bg-violet-600", "hover:bg-violet-700")
    }

    const matches = screen.getByRole("button", { name: "Partite" })
    expect(matches.querySelector("svg")).toHaveClass(
      "hidden",
      "min-[360px]:block",
    )
    expect(
      screen.getByRole("button", { name: "Allenamenti" }).querySelector("svg"),
    ).toHaveClass("hidden", "min-[360px]:block")
    fireEvent.click(matches)
    expect(matches).toHaveClass("bg-violet-600", "text-white")

    expect(screen.getByRole("button", { name: "Vista lista" })).toHaveClass(
      "bg-violet-600",
      "text-white",
    )
  })
})
