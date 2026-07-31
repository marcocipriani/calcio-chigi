import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { format } from "date-fns"
import { beforeEach, describe, expect, it, vi } from "vitest"

import Home from "@/app/page"
import type { Event } from "@/lib/types"

const {
  fetchCalendarEvents,
  fetchTeams,
  getUserContext,
  removeChannel,
} = vi.hoisted(() => ({
  fetchCalendarEvents: vi.fn(),
  fetchTeams: vi.fn(),
  getUserContext: vi.fn(),
  removeChannel: vi.fn(),
}))

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", TestResizeObserver)

vi.mock("@/lib/api", () => ({
  fetchCalendarEvents,
  fetchTeams,
  getUserContext,
}))

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel,
  },
}))

beforeEach(() => {
  fetchCalendarEvents.mockReset().mockResolvedValue([])
  fetchTeams.mockReset().mockResolvedValue([])
  getUserContext.mockReset().mockResolvedValue({
    isManager: true,
    defaultView: "ACTIVITY",
  })
  removeChannel.mockClear()
})

function dateInCurrentMonth(day: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(day)
  date.setHours(hour, minute, 0, 0)
  return date
}

function calendarEvent(
  values: Pick<Event, "id" | "tipo" | "data_ora"> & Partial<Event>,
): Event {
  return {
    created_at: "2026-07-31T00:00:00.000Z",
    season_id: "season-calendar-test",
    luogo: "Campo Circolo Chigi",
    giocata: false,
    cancellato: false,
    ...values,
  }
}

function seedCalendarFixtures() {
  const dates = {
    empty: dateInCurrentMonth(9, 12),
    single: dateInCurrentMonth(10, 20, 30),
    double: dateInCurrentMonth(11, 19),
    overflow: dateInCurrentMonth(12, 18),
    cancelled: dateInCurrentMonth(13, 18),
  }

  fetchCalendarEvents.mockResolvedValue([
    calendarEvent({
      id: "match-logo",
      tipo: "PARTITA",
      data_ora: dates.single.toISOString(),
      avversario: "PSICOLOGOL",
      luogo: "Vigor Perconti",
    }),
    calendarEvent({
      id: "match-fallback",
      tipo: "PARTITA",
      data_ora: dates.double.toISOString(),
      avversario: "Associazione Sportiva Avversaria dal Nome Molto Lungo",
    }),
    calendarEvent({
      id: "training-double",
      tipo: "ALLENAMENTO",
      data_ora: dateInCurrentMonth(11, 21).toISOString(),
    }),
    calendarEvent({
      id: "overflow-one",
      tipo: "ALLENAMENTO",
      data_ora: dates.overflow.toISOString(),
    }),
    calendarEvent({
      id: "overflow-two",
      tipo: "PARTITA",
      data_ora: dateInCurrentMonth(12, 19).toISOString(),
      avversario: "Veterinari",
    }),
    calendarEvent({
      id: "overflow-three",
      tipo: "ALLENAMENTO",
      data_ora: dateInCurrentMonth(12, 20).toISOString(),
    }),
    calendarEvent({
      id: "cancelled-training",
      tipo: "ALLENAMENTO",
      data_ora: dates.cancelled.toISOString(),
      cancellato: true,
    }),
  ])
  fetchTeams.mockResolvedValue([
    {
      id: "team-psicologol",
      nome: "PSICOLOGOL",
      logo_url: "/teams/psicologi.png",
    },
  ])
  getUserContext.mockResolvedValue({
    isManager: true,
    defaultView: "CALENDAR",
  })

  return dates
}

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

  it("renders zero, one, two, overflow, logo, fallback, and cancelled states on mobile", async () => {
    const dates = seedCalendarFixtures()
    const { container } = render(<Home />)

    await screen.findAllByRole("link", {
      name: /Partita contro PSICOLOGOL, .*20:30/i,
    })

    const mobile = container.querySelector<HTMLElement>(
      '[data-calendar-layout="mobile"]',
    )
    expect(mobile).not.toBeNull()

    const cell = (date: Date) =>
      mobile!.querySelector<HTMLElement>(
        `[data-calendar-date="${format(date, "yyyy-MM-dd")}"]`,
      )!

    expect(
      cell(dates.empty).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(0)
    expect(
      cell(dates.single).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(1)
    const doubleEvents = cell(dates.double).querySelectorAll(
      "[data-calendar-event]",
    )
    expect(doubleEvents).toHaveLength(2)
    expect(doubleEvents[0].parentElement).toHaveClass(
      "flex",
      "justify-center",
      "gap-0.5",
    )
    expect(doubleEvents[0]).toHaveClass("w-5")
    expect(doubleEvents[1]).toHaveClass("w-5")
    expect(
      cell(dates.overflow).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(2)
    expect(cell(dates.overflow)).toHaveTextContent("+1")

    const logoMatch = mobile!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/match-logo"]',
    )!
    expect(logoMatch).toHaveClass("bg-blue-50")
    expect(logoMatch.querySelector("img")).toHaveAttribute("alt", "")
    expect(logoMatch.querySelector("img")).toHaveClass(
      "size-4",
      "object-contain",
    )

    const fallbackMatch = mobile!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/match-fallback"]',
    )!
    expect(fallbackMatch.querySelector("img")).toBeNull()
    expect(fallbackMatch.querySelector("svg")).not.toBeNull()

    const training = mobile!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/training-double"]',
    )!
    expect(training).toHaveClass("bg-orange-50")
    expect(training).toHaveAttribute("data-event-type", "ALLENAMENTO")

    const cancelled = mobile!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/cancelled-training"]',
    )!
    expect(cancelled).toHaveClass("bg-muted", "line-through")
    expect(cancelled).not.toHaveClass("bg-orange-50", "bg-blue-50")
    expect(cancelled).toHaveAccessibleName(/Annullato: Allenamento, .*18:00/i)
  })

  it("renders compact detailed match and training cards on desktop", async () => {
    const dates = seedCalendarFixtures()
    const { container } = render(<Home />)

    await screen.findAllByRole("link", {
      name: /Partita contro PSICOLOGOL, .*20:30/i,
    })

    const desktop = container.querySelector<HTMLElement>(
      '[data-calendar-layout="desktop"]',
    )
    expect(desktop).not.toBeNull()

    const cell = (date: Date) =>
      desktop!.querySelector<HTMLElement>(
        `[data-calendar-date="${format(date, "yyyy-MM-dd")}"]`,
      )!

    expect(
      cell(dates.empty).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(0)
    expect(
      cell(dates.single).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(1)
    expect(
      cell(dates.double).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(2)
    expect(
      cell(dates.overflow).querySelectorAll("[data-calendar-event]"),
    ).toHaveLength(2)
    expect(cell(dates.overflow)).toHaveTextContent("+1 altro")
    expect(cell(dates.single)).toHaveClass("h-[112px]", "overflow-hidden")

    const logoMatch = desktop!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/match-logo"]',
    )!
    expect(logoMatch).toHaveClass("bg-blue-50")
    expect(logoMatch).toHaveTextContent("PSICOLOGOL")
    expect(logoMatch).toHaveTextContent("20:30 · Vigor Perconti")
    expect(logoMatch.querySelector("img")).toHaveClass(
      "size-6",
      "object-contain",
    )
    expect(logoMatch.querySelector("img")).toHaveAttribute("alt", "")

    const longNameMatch = desktop!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/match-fallback"]',
    )!
    expect(longNameMatch.querySelector("img")).toBeNull()
    expect(longNameMatch.querySelector("svg")).not.toBeNull()
    expect(longNameMatch.querySelector(".truncate")).toHaveTextContent(
      "Associazione Sportiva Avversaria dal Nome Molto Lungo",
    )

    const training = desktop!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/training-double"]',
    )!
    expect(training).toHaveClass("bg-orange-50")
    expect(training).toHaveTextContent("Allenamento")
    expect(training).toHaveTextContent("21:00 · Campo Circolo Chigi")

    const cancelled = desktop!.querySelector<HTMLAnchorElement>(
      'a[href="/evento/cancelled-training"]',
    )!
    expect(cancelled).toHaveClass("bg-muted", "line-through")
    expect(cancelled).not.toHaveClass("bg-orange-50", "bg-blue-50")
  })
})
