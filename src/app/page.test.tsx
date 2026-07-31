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
  it("keeps one responsive add action in the titlebar", async () => {
    render(<Home />)

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Calendario" }),
      ).toBeVisible()
    })

    const addAction = screen.getByRole("button", {
      name: "Aggiungi evento",
    })
    expect(addAction).toHaveClass(
      "size-11",
      "rounded-full",
      "sm:h-8",
      "sm:w-auto",
      "sm:rounded-md",
    )
    expect(addAction).not.toHaveClass("fixed", "bottom-24", "sm:hidden")
    expect(screen.getByLabelText("Azioni pagina")).toContainElement(addAction)
  })

  it("explains the icon-only title action on mobile", async () => {
    render(<Home />)

    const addAction = await screen.findByRole("button", {
      name: "Aggiungi evento",
    })
    fireEvent.pointerMove(addAction)

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Aggiungi evento",
    )
  })

  it("reserves violet for the manager action and keeps calendar tools neutral", async () => {
    render(<Home />)

    const addAction = await screen.findByRole("button", {
      name: "Aggiungi evento",
    })
    expect(addAction).toHaveClass("bg-violet-600", "hover:bg-violet-700")

    const matches = screen.getByRole("button", { name: "Partite" })
    expect(matches.querySelector("svg")).toHaveClass(
      "hidden",
      "min-[360px]:block",
    )
    expect(
      screen.getByRole("button", { name: "Allenamenti" }).querySelector("svg"),
    ).toHaveClass("hidden", "min-[360px]:block")
    fireEvent.click(matches)
    expect(matches).toHaveClass("bg-foreground", "text-background")
    expect(matches).not.toHaveClass("bg-violet-600", "text-violet-700")

    expect(screen.getByRole("button", { name: "Vista lista" })).toHaveClass(
      "bg-foreground",
      "text-background",
    )
  })
})
