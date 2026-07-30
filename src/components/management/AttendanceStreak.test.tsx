import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AttendanceStreak } from "@/components/management/AttendanceStreak"

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

describe("AttendanceStreak", () => {
  it("shows attendance status and separates different weeks", () => {
    render(
      <AttendanceStreak
        items={[
          {
            eventId: "training-1",
            startsAt: "2026-07-20T18:30:00.000Z",
            status: "PRESENT",
          },
          {
            eventId: "training-2",
            startsAt: "2026-07-23T18:30:00.000Z",
            status: "ABSENT",
          },
          {
            eventId: "training-3",
            startsAt: "2026-07-27T18:30:00.000Z",
            status: "MISSING",
          },
        ]}
      />,
    )

    expect(
      screen.getByLabelText("Lunedì 20 luglio 2026: presente"),
    ).toHaveClass("bg-emerald-500")
    expect(
      screen.getByLabelText("Giovedì 23 luglio 2026: assente"),
    ).toHaveClass("bg-rose-500")
    expect(
      screen.getByLabelText("Lunedì 27 luglio 2026: non registrato"),
    ).toHaveClass("bg-slate-300")
    expect(screen.getByTestId("week-separator")).toBeVisible()
  })

  it("reveals the full date and status on pointer hover", async () => {
    render(
      <AttendanceStreak
        items={[
          {
            eventId: "training-1",
            startsAt: "2026-07-20T18:30:00.000Z",
            status: "PRESENT",
          },
        ]}
      />,
    )

    fireEvent.pointerMove(
      screen.getByLabelText("Lunedì 20 luglio 2026: presente"),
    )

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Lunedì 20 luglio 2026: presente",
    )
  })

  it("reveals the full date and status from keyboard focus", async () => {
    render(
      <AttendanceStreak
        items={[
          {
            eventId: "training-1",
            startsAt: "2026-07-20T18:30:00.000Z",
            status: "ABSENT",
          },
        ]}
      />,
    )

    const dot = screen.getByLabelText("Lunedì 20 luglio 2026: assente")
    expect(dot).toHaveAttribute("tabindex", "0")
    fireEvent.focus(dot)

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Lunedì 20 luglio 2026: assente",
    )
  })
})
