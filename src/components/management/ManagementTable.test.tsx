import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ManagementTable } from "@/components/management/ManagementTable"
import type { ManagementPerson } from "@/lib/management"

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

afterEach(() => vi.useRealTimers())

const people: ManagementPerson[] = [
  {
    id: "membership-1",
    profileId: "profile-1",
    nome: "Luca",
    cognome: "Verdi",
    category: "PLAYER",
    status: "YES",
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
      columns={["person", "phone", "account"]}
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

function renderAttendanceTable(onOpen = vi.fn()) {
  const player: ManagementPerson = {
    ...people[0],
    attendance: {
      training: { present: 1, total: 1, percentage: 100 },
      recentTraining: [
        {
          eventId: "training-1",
          startsAt: "2026-07-20T18:30:00.000Z",
          status: "PRESENT",
        },
      ],
    },
  }
  const result = render(
    <ManagementTable
      {...actions}
      columns={["person", "trainingStreak", "trainingRate"]}
      onOpen={onOpen}
      people={[player]}
      selected={new Set()}
      view="ATTENDANCE"
    />,
  )
  return { ...result, onOpen, player }
}

describe("ManagementTable", () => {
  it("renders only the ordered People columns and the jersey number", () => {
    renderPeopleTable()

    expect(
      screen.getByRole("columnheader", { name: /persona/i }),
    ).toBeVisible()
    expect(
      screen.getByRole("columnheader", { name: /telefono/i }),
    ).toBeVisible()
    expect(
      screen.queryByRole("columnheader", { name: /conferma/i }),
    ).not.toBeInTheDocument()
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

  it("filters players by current U35 group and leaves unknown dates in all", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-31T12:00:00+02:00"))
    const agePeople: ManagementPerson[] = [
      { ...people[0], id: "u35", birthDate: "1991-08-01" },
      {
        ...people[0],
        id: "over-35",
        profileId: "profile-over-35",
        nome: "Paolo",
        cognome: "Over",
        birthDate: "1991-07-31",
      },
      {
        ...people[0],
        id: "unknown-age",
        profileId: "profile-unknown-age",
        nome: "Mario",
        cognome: "Senza Data",
        birthDate: null,
      },
      people[1],
    ]
    render(
      <ManagementTable
        {...actions}
        columns={["person"]}
        people={agePeople}
        selected={new Set()}
        view="PEOPLE"
      />,
    )
    const table = screen.getByRole("table")
    const filter = screen.getByRole("combobox", { name: "Filtra Persona" })

    expect(dataRowNames(table)).toHaveLength(4)
    const u35Badge = within(table)
      .getAllByText("U35")
      .find((element) => element.dataset.slot === "badge")
    expect(u35Badge).toHaveClass("bg-sky-100", "text-sky-700")

    fireEvent.change(filter, { target: { value: "U35" } })
    expect(dataRowNames(table)).toHaveLength(1)
    expect(dataRowNames(table)[0]).toContain("Luca Verdi")

    fireEvent.change(filter, { target: { value: "OVER_35" } })
    expect(dataRowNames(table)).toHaveLength(1)
    expect(dataRowNames(table)[0]).toContain("Paolo Over")

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

  it("does not open the person drawer when attendance dots are focused or clicked", () => {
    const { onOpen } = renderAttendanceTable()

    for (const dot of screen.getAllByLabelText(
      "Lunedì 20 luglio 2026: presente",
    )) {
      fireEvent.focus(dot)
      fireEvent.click(dot)
    }

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("keeps attendance dot buttons outside the mobile profile control", () => {
    const { container } = renderAttendanceTable()
    const table = screen.getByRole("table")
    const mobileOpenControl = screen
      .getAllByRole("button", { name: "Apri scheda di Luca Verdi" })
      .find((control) => !table.contains(control))

    expect(mobileOpenControl).toBeDefined()
    expect(mobileOpenControl!.querySelector("button")).toBeNull()
    expect(container.querySelector("button button")).toBeNull()
  })

  it("opens the mobile profile only from its explicit control", () => {
    const { onOpen, player } = renderAttendanceTable()
    const table = screen.getByRole("table")
    const mobileOpenControl = screen
      .getAllByRole("button", { name: "Apri scheda di Luca Verdi" })
      .find((control) => !table.contains(control))

    fireEvent.click(screen.getByText("Ultimi allenamenti:"))
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.click(mobileOpenControl!)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith(player)
  })
})
