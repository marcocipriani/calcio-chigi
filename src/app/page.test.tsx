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

  it("reserves violet for the manager action and uses calendar semantic colors", async () => {
    render(<Home />)

    const addAction = await screen.findByRole("button", {
      name: "Aggiungi evento",
    })
    expect(addAction).toHaveClass("bg-violet-600", "hover:bg-violet-700")

    const all = screen.getByRole("button", { name: "Tutti" })
    const matches = screen.getByRole("button", { name: "Partite" })
    const trainings = screen.getByRole("button", { name: "Allenamenti" })
    expect(matches.querySelector("svg")).toHaveClass(
      "hidden",
      "min-[360px]:block",
    )
    expect(trainings.querySelector("svg")).toHaveClass(
      "hidden",
      "min-[360px]:block",
    )

    expect(all).toHaveClass("bg-foreground", "text-background")

    fireEvent.click(matches)
    expect(matches).toHaveAttribute("aria-pressed", "true")
    expect(matches).toHaveClass("bg-blue-600", "text-white")
    expect(matches).not.toHaveClass("bg-violet-600", "text-violet-700")

    fireEvent.click(trainings)
    expect(trainings).toHaveAttribute("aria-pressed", "true")
    expect(trainings).toHaveClass("bg-orange-500", "text-white")
    expect(trainings).not.toHaveClass("bg-violet-600", "text-violet-700")

    fireEvent.click(all)
    expect(all).toHaveAttribute("aria-pressed", "true")
    expect(all).toHaveClass("bg-foreground", "text-background")

    expect(screen.getByRole("button", { name: "Vista lista" })).toHaveClass(
      "bg-foreground",
      "text-background",
    )
  })
})
