import { describe, expect, it } from "vitest"

import {
  filterManagementRows,
  managementKpis,
  type ManagementPerson,
} from "@/lib/management"

const people: ManagementPerson[] = [
  {
    id: "membership-1",
    profileId: "profile-1",
    nome: "Anna",
    cognome: "Rossi",
    category: "PLAYER",
    status: "YES",
    isExternal: true,
    isAggregated: false,
    trainingOnly: false,
    registrationStatus: "ACTIVE",
    accountStatus: "ACTIVE",
    payments: [{ status: "PAID", amountDue: 50 }],
    certificateStatus: "VALID",
  },
  {
    id: "membership-2",
    profileId: "profile-2",
    nome: "Luca",
    cognome: "Verdi",
    category: "STAFF",
    status: "INTERESTED",
    isExternal: false,
    isAggregated: true,
    trainingOnly: true,
    registrationStatus: "TODO",
    accountStatus: "NONE",
    payments: [{ status: "DUE", amountDue: 80 }],
    certificateStatus: "MISSING",
  },
]

describe("filterManagementRows", () => {
  it("combines search, category and tags", () => {
    expect(
      filterManagementRows(people, {
        query: "rossi",
        category: "PLAYER",
        status: "ALL",
        tag: "EXT",
      }).map((person) => person.profileId),
    ).toEqual(["profile-1"])
  })
})

describe("managementKpis", () => {
  it("counts operational work instead of only people", () => {
    expect(managementKpis(people)).toEqual({
      total: 2,
      confirmationsPending: 1,
      registrationsOpen: 1,
      paymentsOpen: 1,
      certificatesOpen: 0,
      accountsOpen: 1,
    })
  })
})
