import { describe, expect, it } from "vitest"

import {
  applyJerseyResolution,
  initialJerseyChoices,
  jerseyAssignmentIssues,
  parseJerseyChoices,
  preferencesChangedAfterDraft,
  proposeJerseyAssignment,
  validateJerseyPreferences,
  type JerseyChoice,
  type JerseyPlayer,
} from "@/lib/jersey-numbers"

const P = (number: number): JerseyChoice => ({ number, level: "PREFERRED" })
const A = (number: number): JerseyChoice => ({ number, level: "ACCEPTABLE" })

function player(
  membershipId: string,
  choices: JerseyChoice[],
  extra: Partial<JerseyPlayer> = {},
): JerseyPlayer {
  return {
    membershipId,
    name: membershipId,
    choices,
    noPreference: false,
    avoidNumbers: [],
    previousNumber: null,
    ...extra,
  }
}

describe("validateJerseyPreferences", () => {
  it("accepts one to five ranked numbers with at least one preferred", () => {
    expect(validateJerseyPreferences([P(10), A(14)], [13])).toBeNull()
  })

  it("accepts no preference, ignoring any leftover choice", () => {
    expect(validateJerseyPreferences([A(14)], [13], true)).toBeNull()
    expect(validateJerseyPreferences([], [0], true)).toBe(
      "I numeri vanno da 1 a 99",
    )
  })

  it("mirrors the database rules", () => {
    expect(validateJerseyPreferences([], [])).toBe("Indica da 1 a 5 numeri")
    expect(
      validateJerseyPreferences([P(1), P(2), P(3), P(4), P(5), P(6)], []),
    ).toBe("Indica da 1 a 5 numeri")
    expect(validateJerseyPreferences([A(14)], [])).toBe(
      "Serve almeno un numero preferito",
    )
    expect(validateJerseyPreferences([P(0)], [])).toBe(
      "I numeri vanno da 1 a 99",
    )
    expect(validateJerseyPreferences([P(10), A(10)], [])).toBe(
      "Il numero 10 è indicato più volte",
    )
    expect(validateJerseyPreferences([P(10)], [10])).toBe(
      "Un numero scelto non può essere anche da evitare",
    )
  })
})

describe("parseJerseyChoices", () => {
  it("drops malformed entries", () => {
    expect(
      parseJerseyChoices([
        { number: 10, level: "PREFERRED" },
        { number: 120, level: "PREFERRED" },
        { number: 7, level: "MAYBE" },
        null,
      ]),
    ).toEqual([P(10)])
    expect(parseJerseyChoices(null)).toEqual([])
  })
})

describe("proposeJerseyAssignment", () => {
  it("gives every player their first uncontested preferred number", () => {
    const { assignment, conflicts } = proposeJerseyAssignment([
      player("anna", [P(10), A(14)]),
      player("bruno", [P(7)]),
    ])

    expect(assignment).toEqual({ anna: 10, bruno: 7 })
    expect(conflicts).toEqual([])
  })

  it("leaves a preferred number contested by two players to the manager", () => {
    const { assignment, conflicts } = proposeJerseyAssignment([
      player("anna", [P(10), A(14)], { previousNumber: 10 }),
      player("bruno", [P(10), A(21)]),
    ])

    expect(assignment).toEqual({ anna: 14, bruno: 21 })
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      number: 10,
      level: "PREFERRED",
      contenders: [
        { membershipId: "anna", rank: 0, isReconfirmation: true },
        { membershipId: "bruno", rank: 0, isReconfirmation: false },
      ],
    })
    expect(conflicts[0].resolutions).toEqual([
      {
        winnerId: "anna",
        fallbacks: [{ membershipId: "bruno", number: 21, level: "ACCEPTABLE" }],
      },
      {
        winnerId: "bruno",
        fallbacks: [{ membershipId: "anna", number: 14, level: "ACCEPTABLE" }],
      },
    ])
  })

  it("only offers resolutions where the others keep a number", () => {
    const { assignment, conflicts } = proposeJerseyAssignment([
      player("anna", [P(10), A(14)]),
      player("bruno", [P(10)]),
    ])

    expect(assignment).toEqual({ anna: 14, bruno: null })
    expect(conflicts[0].resolutions).toEqual([
      {
        winnerId: "bruno",
        fallbacks: [{ membershipId: "anna", number: 14, level: "ACCEPTABLE" }],
      },
    ])
  })

  it("lets a sole preferred claim beat acceptable claims", () => {
    const { assignment } = proposeJerseyAssignment([
      player("anna", [P(9), A(10)]),
      player("bruno", [P(9), A(11)]),
      player("carlo", [P(10)]),
    ])

    expect(assignment).toEqual({ anna: null, bruno: 11, carlo: 10 })
  })

  it("reports acceptable numbers contested by players still without one", () => {
    const { assignment, conflicts } = proposeJerseyAssignment([
      player("anna", [P(9), A(20), A(30)]),
      player("bruno", [P(9), A(20)]),
    ])

    expect(assignment).toEqual({ anna: 30, bruno: null })
    expect(conflicts.map(({ number, level }) => [number, level])).toEqual([
      [9, "PREFERRED"],
      [20, "ACCEPTABLE"],
    ])
  })

  it("leaves players who have not answered unassigned", () => {
    expect(
      proposeJerseyAssignment([player("anna", [])]).assignment,
    ).toEqual({ anna: null })
  })

  it("gives the lowest free unchosen number to players with no preference", () => {
    const { assignment } = proposeJerseyAssignment([
      player("anna", [P(1), A(3)]),
      player("bruno", [P(2)]),
      player("carlo", [], { noPreference: true, avoidNumbers: [4] }),
      player("dario", [], { noPreference: true }),
    ])
    // 1-3 scelti da qualcuno, 4 da evitare per Carlo.
    expect(assignment).toEqual({ anna: 1, bruno: 2, carlo: 5, dario: 4 })
  })
})

describe("applyJerseyResolution", () => {
  it("moves the number to the winner and frees it elsewhere", () => {
    expect(
      applyJerseyResolution({ anna: 10, bruno: 14 }, 10, "bruno"),
    ).toEqual({ anna: null, bruno: 10 })
  })
})

describe("jerseyAssignmentIssues", () => {
  it("flags duplicates, avoided numbers and missing numbers", () => {
    const players = [
      player("anna", [P(10)], { avoidNumbers: [13] }),
      player("bruno", [P(7)]),
      player("carlo", [P(9)]),
    ]

    expect(
      jerseyAssignmentIssues(players, { anna: 13, bruno: 13, carlo: null }),
    ).toEqual([
      { kind: "AVOIDED", number: 13, membershipId: "anna" },
      { kind: "UNASSIGNED", membershipId: "carlo" },
      { kind: "DUPLICATE", number: 13, membershipIds: ["anna", "bruno"] },
    ])
  })
})

describe("preferencesChangedAfterDraft", () => {
  it("is true only for saves after the published draft", () => {
    expect(
      preferencesChangedAfterDraft(
        "2026-09-24T10:00:00Z",
        "2026-09-23T10:00:00Z",
      ),
    ).toBe(true)
    expect(
      preferencesChangedAfterDraft(
        "2026-09-22T10:00:00Z",
        "2026-09-23T10:00:00Z",
      ),
    ).toBe(false)
    expect(preferencesChangedAfterDraft("2026-09-24T10:00:00Z", null)).toBe(
      false,
    )
  })
})

describe("initialJerseyChoices", () => {
  it("suggests last season's number as first preferred choice", () => {
    expect(initialJerseyChoices([], 10)).toEqual([P(10)])
    expect(initialJerseyChoices([P(7)], 10)).toEqual([P(7)])
    expect(initialJerseyChoices([], null)).toEqual([])
  })
})
