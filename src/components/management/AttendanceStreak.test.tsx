import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AttendanceStreak } from "@/components/management/AttendanceStreak"

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
})
