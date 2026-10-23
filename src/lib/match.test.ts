import { describe, expect, it } from "vitest"

import {
  buildMatchReport,
  buildSummary,
  canOpenMatchMode,
  eventMoment,
  fieldState,
  minuteLabel,
  periodClock,
  scoreOf,
  substitutionLimit,
  substitutionsInPeriod,
  type MatchLineup,
  type MatchSession,
  type TimelineEntry,
} from "@/lib/match"

const T0 = Date.parse("2026-10-24T19:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

function session(overrides: Partial<MatchSession> = {}): MatchSession {
  return {
    eventId: "event-1",
    status: "FIRST_HALF",
    periodMinutes: 35,
    periodStartedAt: at(0),
    addedMinutes: 0,
    timeoutUsed: false,
    lineup: { module: "4-4-2", starters: [], bench: [] },
    scoreOurs: 0,
    scoreTheirs: 0,
    operatorProfileId: "manager",
    operatorSince: at(0),
    operatorName: "Manager",
    finishedAt: null,
    ...overrides,
  }
}

let counter = 0
function entry(kind: TimelineEntry["kind"], minutesFromKickoff: number, fields: Partial<TimelineEntry> = {}): TimelineEntry {
  counter += 1
  return {
    id: `entry-${counter}`,
    kind,
    period: 1,
    minute: 0,
    stoppage: 0,
    occurredAt: at(minutesFromKickoff),
    profileId: null,
    assistProfileId: null,
    subInProfileId: null,
    playerName: null,
    assistName: null,
    subInName: null,
    ...fields,
  }
}

const lineup: MatchLineup = {
  module: "4-4-2",
  starters: [
    { profileId: "rossi", positionKey: "ATT1" },
    { profileId: "verdi", positionKey: "CC1" },
  ],
  bench: ["neri", "blu"],
}

describe("periodClock", () => {
  it("counts the second half from 35:00 and names the 53rd minute at 52:14", () => {
    const clock = periodClock(
      session({ status: "SECOND_HALF", periodStartedAt: at(0) }),
      new Date(T0 + (17 * 60 + 14) * 1000),
    )
    expect(clock.display).toBe("52:14")
    expect(clock.minute).toBe(53)
    expect(clock.stoppage).toBe(0)
  })

  it("shows stoppage time past the period length", () => {
    const clock = periodClock(session(), new Date(T0 + 37 * 60_000))
    expect(clock.minute).toBe(35)
    expect(clock.stoppage).toBe(3)
    expect(minuteLabel(clock.minute, clock.stoppage)).toBe("35+3'")
  })

  it("recomputes from the stored start, so a reopened app keeps time", () => {
    expect(periodClock(session(), new Date(T0 + 12 * 60_000 + 5_000)).display).toBe("12:05")
    expect(periodClock(session(), new Date(T0 - 5_000)).display).toBe("00:00")
  })

  it("counts down the halftime", () => {
    const clock = periodClock(session({ status: "HALFTIME" }), new Date(T0 + 6 * 60_000))
    expect(clock.halftimeRemaining).toBe(9 * 60)
  })

  it("records halftime events as the start of the second half", () => {
    expect(eventMoment(session({ status: "HALFTIME" }), new Date(T0))).toEqual({
      period: 2,
      minute: 35,
      stoppage: 0,
    })
  })
})

describe("fieldState", () => {
  it("leaves the expelled player's spot empty and keeps him out", () => {
    const state = fieldState(lineup, [entry("RED", 20, { profileId: "verdi", minute: 21 })])
    expect(state.onField.CC1).toBeNull()
    expect(state.expelled.has("verdi")).toBe(true)
    expect(state.bench).toEqual(["neri", "blu"])
  })

  it("swaps substitutions and lets a substituted player come back", () => {
    const state = fieldState(lineup, [
      entry("SUB", 10, { profileId: "rossi", subInProfileId: "neri", minute: 11 }),
      entry("SUB", 30, { profileId: "neri", subInProfileId: "rossi", minute: 31 }),
    ])
    expect(state.onField.ATT1).toBe("rossi")
    expect(state.bench).toEqual(["blu", "neri"])
    expect(state.subbedOut.get("neri")).toBe("31'")
    expect(state.subbedOut.has("rossi")).toBe(false)
  })

  it("counts goals and yellow cards per player", () => {
    const state = fieldState(lineup, [
      entry("GOAL", 5, { profileId: "rossi" }),
      entry("GOAL", 9, { profileId: "rossi" }),
      entry("YELLOW", 12, { profileId: "verdi" }),
    ])
    expect(state.goals.get("rossi")).toBe(2)
    expect(state.yellows.get("verdi")).toBe(1)
  })
})

describe("score and substitutions", () => {
  it("counts our goals of every kind and theirs", () => {
    expect(
      scoreOf([
        entry("GOAL", 1, { profileId: "rossi" }),
        entry("OWN_GOAL_FOR", 2),
        entry("UNATTRIBUTED_GOAL", 3),
        entry("GOAL_AGAINST", 4),
        entry("YELLOW", 5, { profileId: "verdi" }),
      ]),
    ).toEqual({ ours: 3, theirs: 1 })
  })

  it("counts substitutions per period, halftime apart", () => {
    const timeline = [
      entry("PERIOD_START", 0),
      entry("SUB", 10, { profileId: "rossi", subInProfileId: "neri" }),
      entry("PERIOD_END", 36),
      entry("SUB", 40, { profileId: "verdi", subInProfileId: "blu", period: 2 }),
      entry("PERIOD_START", 51, { period: 2 }),
      entry("SUB", 60, { profileId: "neri", subInProfileId: "rossi", period: 2 }),
    ]
    expect(substitutionsInPeriod(timeline, "FIRST_HALF")).toBe(1)
    expect(substitutionsInPeriod(timeline, "HALFTIME")).toBe(1)
    expect(substitutionsInPeriod(timeline, "SECOND_HALF")).toBe(1)
  })

  it("applies the ASI limits to league matches only", () => {
    expect(substitutionLimit("PARTITA", "FIRST_HALF")).toBe(3)
    expect(substitutionLimit("PARTITA", "HALFTIME")).toBeNull()
    expect(substitutionLimit("PARTITA", "SECOND_HALF")).toBe(7)
    expect(substitutionLimit("AMICHEVOLE", "SECOND_HALF")).toBeNull()
  })
})

describe("buildSummary", () => {
  it("counts real minutes inside the two periods", () => {
    // Primo tempo 0–36' (recupero 1'), intervallo, ripresa da 51' a 88' (35+2').
    const timeline = [
      entry("PERIOD_START", 0),
      entry("SUB", 20, { profileId: "rossi", subInProfileId: "neri", minute: 21 }),
      entry("GOAL", 30, { profileId: "neri", assistProfileId: "verdi" }),
      entry("PERIOD_END", 36),
      entry("PERIOD_START", 51, { period: 2 }),
      entry("SUB", 71, { profileId: "verdi", subInProfileId: "blu", period: 2 }),
      entry("YELLOW", 75, { profileId: "blu", period: 2 }),
    ]
    const summary = buildSummary(lineup, timeline, new Date(T0 + 88 * 60_000))
    const byId = Object.fromEntries(summary.players.map((player) => [player.profileId, player]))

    expect(byId.rossi.minutesPlayed).toBe(20)
    expect(byId.neri.minutesPlayed).toBe(16 + 37)
    expect(byId.verdi.minutesPlayed).toBe(36 + 20)
    expect(byId.blu.minutesPlayed).toBe(17)
    expect(byId.neri.goals).toBe(1)
    expect(byId.verdi.assists).toBe(1)
    expect(byId.blu.yellowCards).toBe(1)
    expect(summary.golNostri).toBe(1)
  })

  it("stops the minutes of an expelled player", () => {
    const summary = buildSummary(
      lineup,
      [entry("PERIOD_START", 0), entry("RED", 12, { profileId: "verdi" })],
      new Date(T0 + 30 * 60_000),
    )
    expect(summary.players.find((player) => player.profileId === "verdi")).toMatchObject({
      minutesPlayed: 12,
      redCards: 1,
    })
  })
})

describe("canOpenMatchMode", () => {
  const match = { tipo: "PARTITA" as const, cancellato: false, data_ora: "2026-10-24T19:00:00.000Z" }

  it("opens on match day in Rome and while a session is live", () => {
    expect(canOpenMatchMode(match, new Date("2026-10-24T08:00:00.000Z"), null)).toBe(true)
    expect(canOpenMatchMode(match, new Date("2026-10-25T09:00:00.000Z"), null)).toBe(false)
    expect(canOpenMatchMode(match, new Date("2026-10-25T09:00:00.000Z"), { status: "SECOND_HALF" })).toBe(true)
  })

  it("never opens for trainings, cancelled or finished matches", () => {
    const now = new Date("2026-10-24T08:00:00.000Z")
    expect(canOpenMatchMode({ ...match, tipo: "ALLENAMENTO" }, now, null)).toBe(false)
    expect(canOpenMatchMode({ ...match, cancellato: true }, now, null)).toBe(false)
    expect(canOpenMatchMode(match, now, { status: "FINISHED" })).toBe(false)
  })
})

describe("buildMatchReport", () => {
  it("lists the match in playing order with the final score on top", () => {
    const report = buildMatchReport("Psicologol", [
      entry("YELLOW", 40, { minute: 40, playerName: "Verdi" }),
      entry("GOAL", 11, { minute: 12, playerName: "Rossi", assistName: "Bianchi" }),
      entry("GOAL_AGAINST", 30, { minute: 31 }),
      entry("PERIOD_END", 36),
    ])
    expect(report).toBe(
      ["⚽ CHIGI 1-1 PSICOLOGOL", "", "12' ⚽ Rossi (assist Bianchi)", "31' ⚽ Psicologol", "40' 🟨 Verdi"].join("\n"),
    )
  })
})
