import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ManagementTable } from "@/components/management/ManagementTable"
import type { ManagementPerson } from "@/lib/management"

const people: ManagementPerson[] = [
  {
    id: "membership-1",
    profileId: "profile-1",
    nome: "Luca",
    cognome: "Verdi",
    category: "PLAYER",
    status: "MAYBE",
    role: "Difensore",
    jerseyNumber: 8,
    phone: "333 1111111",
    isExternal: false,
    isAggregated: false,
    trainingOnly: false,
    registrationStatus: "TODO",
    profileUpdatedAt: "2026-07-25T00:00:00.000Z",
    membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
    accountStatus: "NONE",
    payments: [{ status: "DUE", amountDue: 80 }],
    certificateStatus: "MISSING",
  },
  {
    id: "membership-2",
    profileId: "profile-2",
    nome: "Anna",
    cognome: "Rossi",
    category: "STAFF",
    status: "YES",
    staffFunction: "Allenatrice",
    phone: "333 2222222",
    isExternal: false,
    isAggregated: false,
    trainingOnly: false,
    registrationStatus: "ACTIVE",
    profileUpdatedAt: "2026-07-25T00:00:00.000Z",
    membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
    accountStatus: "ACTIVE",
    payments: [{ status: "PAID", amountDue: 50 }],
    certificateStatus: "VALID",
  },
]

const actions = {
  onAccountAction: vi.fn(),
  onOpen: vi.fn(),
  onReviewCertificate: vi.fn(),
  onSelect: vi.fn(),
  onVerifyPayment: vi.fn(),
}

function renderPeopleTable() {
  render(
    <ManagementTable
      {...actions}
      columns={["person", "confirmation", "phone", "account"]}
      people={people}
      selected={new Set()}
      view="PEOPLE"
    />,
  )
  return screen.getByRole("table")
}

function dataRowNames(table: HTMLElement) {
  return within(table)
    .getAllByRole("row")
    .slice(2)
    .map((row) => row.textContent)
}

describe("ManagementTable", () => {
  it("renders only the ordered People columns and the jersey number", () => {
    renderPeopleTable()

    expect(
      screen.getByRole("columnheader", { name: /persona/i }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", { name: /conferma/i }),
    ).toBeVisible()
    expect(screen.queryByText("Dipartimento")).not.toBeInTheDocument()
    expect(screen.queryByText("Tag")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Numero maglia 8")).toBeVisible()
  })

  it("cycles ascending and descending order from a sortable header", () => {
    const table = renderPeopleTable()
    const personHeader = screen.getByRole("button", { name: "Persona" })

    fireEvent.click(personHeader)
    expect(dataRowNames(table)[0]).toContain("Anna Rossi")

    fireEvent.click(personHeader)
    expect(dataRowNames(table)[0]).toContain("Luca Verdi")
  })

  it("filters rows from the column-specific control", () => {
    const table = renderPeopleTable()

    fireEvent.change(screen.getByRole("combobox", { name: "Filtra Persona" }), {
      target: { value: "STAFF" },
    })

    expect(dataRowNames(table)).toHaveLength(1)
    expect(dataRowNames(table)[0]).toContain("Anna Rossi")
    expect(within(table).queryByText("Luca Verdi")).not.toBeInTheDocument()
  })

  it("uses the signed passport photo URL for registration previews", () => {
    render(
      <ManagementTable
        {...actions}
        columns={["person", "passportPhoto"]}
        passportPhotoStates={
          new Map([
            [
              "photos/anna.jpg",
              {
                status: "ready" as const,
                signedUrl: "https://signed.example/anna.jpg",
              },
            ],
          ])
        }
        people={[{ ...people[1], passportPhotoPath: "photos/anna.jpg" }]}
        selected={new Set()}
        view="REGISTRATIONS"
      />,
    )

    const trigger = screen.getByRole("button", {
      name: "Apri fototessera di Anna Rossi",
    })
    expect(within(trigger).getByRole("img")).toHaveAttribute(
      "src",
      "https://signed.example/anna.jpg",
    )
  })

  it("opens the passport preview without opening the person drawer", () => {
    const onOpen = vi.fn()
    render(
      <ManagementTable
        {...actions}
        columns={["person", "passportPhoto"]}
        onOpen={onOpen}
        passportPhotoStates={
          new Map([
            [
              "photos/anna.jpg",
              {
                status: "ready" as const,
                signedUrl: "https://signed.example/anna.jpg",
              },
            ],
          ])
        }
        people={[{ ...people[1], passportPhotoPath: "photos/anna.jpg" }]}
        selected={new Set()}
        view="REGISTRATIONS"
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Apri fototessera di Anna Rossi",
      }),
    )

    expect(
      screen.getByRole("dialog", { name: "Fototessera di Anna Rossi" }),
    ).toBeVisible()
    expect(onOpen).not.toHaveBeenCalled()
  })
})
