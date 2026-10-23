import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LiveScore, MatchChronicle } from "@/components/match/LiveMatchBlock"
import type { MatchSession, TimelineEntry } from "@/lib/match"

vi.mock("@/components/match/useLiveMatch", () => ({
  useNow: () => new Date("2026-10-24T20:07:00.000Z"),
}))

const session: MatchSession = {
  eventId: "event-1",
  status: "SECOND_HALF",
  periodMinutes: 35,
  periodStartedAt: "2026-10-24T19:50:00.000Z",
  addedMinutes: 0,
  timeoutUsed: false,
  lineup: { module: "4-4-2", starters: [], bench: [] },
  scoreOurs: 2,
  scoreTheirs: 1,
  operatorProfileId: "luca",
  operatorSince: "2026-10-24T19:00:00.000Z",
  operatorName: "Luca Vice",
  finishedAt: null,
}

const entry = (kind: TimelineEntry["kind"], minute: number, fields: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: `${kind}-${minute}`,
  kind,
  period: minute > 35 ? 2 : 1,
  minute,
  stoppage: 0,
  occurredAt: `2026-10-24T19:${String(minute).padStart(2, "0")}:00.000Z`,
  profileId: null,
  assistProfileId: null,
  subInProfileId: null,
  playerName: null,
  assistName: null,
  subInName: null,
  ...fields,
})

describe("live match on the event page", () => {
  it("shows minute, score and who follows the match", () => {
    render(<LiveScore opponent="PSICOLOGOL" session={session} />)
    const score = screen.getByTestId("live-score")
    expect(score).toHaveTextContent("Live · 2° tempo · 53'")
    expect(score).toHaveTextContent("2 – 1")
    expect(score).toHaveTextContent("Segue la partita: Luca Vice")
  })

  it("lists goals and cards newest first, without substitutions", () => {
    render(
      <MatchChronicle
        opponent="Psicologol"
        timeline={[
          entry("GOAL", 12, { playerName: "Neri" }),
          entry("SUB", 20, { playerName: "Rossi", subInName: "Blu" }),
          entry("GOAL_AGAINST", 31),
          entry("YELLOW", 40, { playerName: "Verdi" }),
          entry("GOAL", 48, { playerName: "Rossi", assistName: "Bianchi" }),
        ]}
      />,
    )
    const rows = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(rows.map((row) => row.textContent)).toEqual([
      "⚽48'Goal: Rossi (assist Bianchi)2-1",
      "40'Ammonizione: Verdi",
      "⚽31'Goal avversario: Psicologol1-1",
      "⚽12'Goal: Neri1-0",
    ])
  })
})
