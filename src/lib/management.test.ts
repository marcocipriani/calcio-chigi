import { describe, expect, it } from "vitest"

import {
  effectiveCertificateStatus,
  filterManagementRows,
  managementKpis,
  type ManagementPerson,
} from "@/lib/management"

describe("effectiveCertificateStatus", () => {
  it("treats a valid certificate past its deadline as expired", () => {
    expect(
      effectiveCertificateStatus("VALID", "2026-07-24", "2026-07-25"),
    ).toBe("EXPIRED")
    expect(
      effectiveCertificateStatus("VALID", "2026-07-25", "2026-07-25"),
    ).toBe("VALID")
  })
})

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
    profileUpdatedAt: "2026-07-25T00:00:00.000Z",
    membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
    privateUpdatedAt: "2026-07-25T00:00:00.000Z",
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
    status: "YES",
    isExternal: false,
    isAggregated: true,
    trainingOnly: true,
    registrationStatus: "TODO",
    profileUpdatedAt: "2026-07-25T00:00:00.000Z",
    membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
    privateUpdatedAt: "2026-07-25T00:00:00.000Z",
    accountStatus: "NONE",
    payments: [{ status: "DUE", amountDue: 80 }],
    certificateStatus: "MISSING",
  },
]

describe("filterManagementRows", () => {
  it("searches name, phone and role", () => {
    const searchablePeople: ManagementPerson[] = [
      { ...people[0], phone: "333 1234567" },
      { ...people[1], role: "Allenatore" },
    ]

    expect(
      filterManagementRows(searchablePeople, { query: "rossi" }).map(
        (person) => person.profileId,
      ),
    ).toEqual(["profile-1"])
    expect(
      filterManagementRows(searchablePeople, { query: "1234567" }).map(
        (person) => person.profileId,
      ),
    ).toEqual(["profile-1"])
    expect(
      filterManagementRows(searchablePeople, { query: "allenatore" }).map(
        (person) => person.profileId,
      ),
    ).toEqual(["profile-2"])
  })
})

describe("archived people", () => {
  const archived: ManagementPerson[] = [
    people[0],
    { ...people[1], status: "NO" },
  ]

  it("keeps archived people out of the roster list and the KPIs", () => {
    expect(
      filterManagementRows(archived, { query: "" }).map(
        ({ profileId }) => profileId,
      ),
    ).toEqual(["profile-1"])
    expect(
      filterManagementRows(archived, { query: "", archived: true }).map(
        ({ profileId }) => profileId,
      ),
    ).toEqual(["profile-2"])
    expect(managementKpis(archived)).toMatchObject({
      total: 1,
      archived: 1,
    })
  })
})

describe("managementKpis", () => {
  it("counts operational work instead of only people", () => {
    expect(managementKpis(people)).toEqual({
      total: 2,
      registrationsOpen: 1,
      paymentsOpen: 1,
      certificatesOpen: 0,
      accountsOpen: 1,
      archived: 0,
    })
  })
})
