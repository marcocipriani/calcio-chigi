import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  AttendancePercentage,
  AttendanceStreak,
} from "@/components/management/AttendanceStreak"

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
            status: "NOT_JOINED",
          },
          {
            eventId: "training-4",
            startsAt: "2026-07-30T18:30:00.000Z",
            status: "KO",
          },
        ]}
      />,
    )

    expect(
      screen.getByLabelText("Lunedì 20 luglio 2026: presente"),
    ).toHaveClass("bg-emerald-500")
    expect(
      screen.getByLabelText("Giovedì 23 luglio 2026: assente"),
    ).toHaveClass("bg-slate-300")
    expect(
      screen.getByLabelText("Lunedì 27 luglio 2026: non ancora in squadra"),
    ).toHaveClass("border-dashed")
    // Infermeria: croce rossa su bianco.
    const ko = screen.getByLabelText("Giovedì 30 luglio 2026: KO")
    expect(ko).toHaveClass("bg-white", "text-rose-600")
    expect(ko.querySelector("svg")).not.toBeNull()
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

  it("colours the percentage from red to green and hides it without trainings", () => {
    const { rerender } = render(
      <AttendancePercentage
        rate={{ present: 0, total: 4, all: 4, percentage: 0 }}
      />,
    )
    // jsdom normalizza hsl() in rgba().
    expect(screen.getByText("0%")).toHaveStyle({
      backgroundColor: "rgba(236, 19, 19, 0.3)",
    })

    rerender(
      <AttendancePercentage
        rate={{ present: 2, total: 4, all: 4, percentage: 50 }}
      />,
    )
    expect(screen.getByText("50%")).toHaveStyle({
      backgroundColor: "rgba(236, 236, 19, 0.3)",
    })

    rerender(
      <AttendancePercentage
        rate={{ present: 4, total: 4, all: 4, percentage: 100 }}
      />,
    )
    expect(screen.getByText("100%")).toHaveStyle({
      backgroundColor: "rgba(19, 236, 19, 0.3)",
    })

    rerender(
      <AttendancePercentage
        rate={{ present: 0, total: 0, all: 0, percentage: 0 }}
      />,
    )
    expect(screen.getByText("—")).toBeVisible()
  })
})
