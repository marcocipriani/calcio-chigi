import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ManagementPerson } from "@/lib/management"
import type { AttendanceSummary } from "@/lib/management-attendance"

const session = vi.hoisted(() => ({
  useAppSession: vi.fn(),
}))

const api = vi.hoisted(() => ({
  fetchManagementAttendance: vi.fn(),
  fetchManagementColumnPreferences: vi.fn(),
  fetchManagementPeople: vi.fn(),
  saveManagementColumnPreferences: vi.fn(),
}))

const storage = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: session.useAppSession,
}))

vi.mock("@/lib/management-api", () => api)

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
    storage,
  },
}))

vi.mock("@/components/layout/PageTitleBar", () => ({
  PageTitleBar: ({
    context,
    title,
  }: {
    context: React.ReactNode
    title: string
  }) => (
    <header>
      <h1>{title}</h1>
      {context}
    </header>
  ),
}))

vi.mock("@/components/management/AddPersonDialog", () => ({
  AddPersonDialog: ({ onSaved }: { onSaved: () => void }) => (
    <button onClick={onSaved} type="button">
      Refresh roster
    </button>
  ),
}))
vi.mock("@/components/management/BulkPaymentDialog", () => ({
  BulkPaymentDialog: () => null,
}))
vi.mock("@/components/management/NotificationComposer", () => ({
  NotificationComposer: () => null,
}))
vi.mock("@/components/management/PersonDrawer", () => ({
  PersonDrawer: () => null,
}))

import { ManagementDashboard } from "@/components/management/ManagementDashboard"

function person(
  id: string,
  nome: string,
  cognome: string,
  category: "PLAYER" | "STAFF",
): ManagementPerson {
  return {
    id: `membership-${id}`,
    profileId: `profile-${id}`,
    nome,
    cognome,
    category,
    status: "YES",
    role: category === "PLAYER" ? "Difensore" : null,
    staffFunction: category === "STAFF" ? "Allenatrice" : null,
    joinedOn: "2026-07-01",
    isExternal: false,
    isAggregated: false,
    trainingOnly: false,
    registrationStatus: "ACTIVE",
    profileUpdatedAt: "2026-07-25T00:00:00.000Z",
    membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
    accountStatus: "ACTIVE",
    payments: [],
    certificateStatus: "VALID",
  }
}

const currentRoster = [
  person("luca", "Luca", "Verdi", "PLAYER"),
  { ...person("anna", "Anna", "Rossi", "STAFF"), passportPhotoPath: "photos/anna.jpg" },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

describe("ManagementDashboard operational state", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.useAppSession.mockReturnValue({
      associationStatus: "ACTIVE",
      isManager: true,
      loading: false,
      profile: { id: "manager-1" },
      targetSeason: { slug: "2026-2027" },
      user: { id: "user-1" },
    })
    api.fetchManagementPeople.mockResolvedValue(currentRoster)
    api.fetchManagementColumnPreferences.mockResolvedValue(null)
    api.fetchManagementAttendance.mockResolvedValue(new Map())
    api.saveManagementColumnPreferences.mockResolvedValue(undefined)
    storage.from.mockReturnValue(storage)
    storage.createSignedUrls.mockResolvedValue({ data: [], error: null })
  })

  it("uses column-filtered rows for the result count and visible selection", async () => {
    render(<ManagementDashboard />)

    const table = await screen.findByRole("table")
    fireEvent.change(
      within(table).getByRole("combobox", { name: "Filtra Persona" }),
      { target: { value: "STAFF" } },
    )

    await waitFor(() => {
      expect(
        screen.getByText("1 risultati · 0 selezionati"),
      ).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "Seleziona visibili" }))

    await waitFor(() => {
      expect(
        screen.getByText("1 risultati · 1 selezionati"),
      ).toBeInTheDocument()
    })
    expect(
      within(table).getByRole("checkbox", { name: "Seleziona Anna Rossi" }),
    ).toBeChecked()
    expect(
      within(table).queryByRole("checkbox", { name: "Seleziona Luca Verdi" }),
    ).not.toBeInTheDocument()
  })

  it("signs passport photos only when registrations are active", async () => {
    render(<ManagementDashboard />)
    await screen.findByRole("table")

    expect(storage.createSignedUrls).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))

    await waitFor(() => {
      expect(storage.from).toHaveBeenCalledWith("passport-photos")
      expect(storage.createSignedUrls).toHaveBeenCalledWith(
        ["photos/anna.jpg"],
        300,
      )
    })
  })

  it("ignores a stale passport photo signature after changing views", async () => {
    const stale = deferred<{
      data: Array<{ path: string; signedUrl: string }>
      error: null
    }>()
    const current = deferred<{
      data: Array<{ path: string; signedUrl: string }>
      error: null
    }>()
    storage.createSignedUrls
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))
    await waitFor(() => expect(storage.createSignedUrls).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("tab", { name: /Persone/ }))
    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))
    await waitFor(() => expect(storage.createSignedUrls).toHaveBeenCalledTimes(2))

    current.resolve({
      data: [
        {
          path: "photos/anna.jpg",
          signedUrl: "https://signed.example/current.jpg",
        },
      ],
      error: null,
    })
    const trigger = await screen.findByRole("button", {
      name: "Apri fototessera di Anna Rossi",
    })
    expect(within(trigger).getByRole("img")).toHaveAttribute(
      "src",
      "https://signed.example/current.jpg",
    )

    await act(async () => {
      stale.resolve({
        data: [
          {
            path: "photos/anna.jpg",
            signedUrl: "https://signed.example/stale.jpg",
          },
        ],
        error: null,
      })
      await Promise.resolve()
    })

    expect(within(trigger).getByRole("img")).toHaveAttribute(
      "src",
      "https://signed.example/current.jpg",
    )
  })

  it("waits for the roster of the selected season before loading attendance", async () => {
    const oldSeasonRoster = [person("paolo", "Paolo", "Blu", "PLAYER")]
    const oldSeason = deferred<ManagementPerson[]>()
    api.fetchManagementPeople.mockImplementation(
      async (_client, seasonSlug: string) =>
        seasonSlug === "2025-2026" ? oldSeason.promise : currentRoster,
    )

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Presenze/ }))
    await waitFor(() => {
      expect(api.fetchManagementAttendance).toHaveBeenCalledWith(
        expect.anything(),
        "2026-2027",
        currentRoster,
      )
    })

    fireEvent.change(screen.getByRole("combobox", { name: "Stagione" }), {
      target: { value: "2025-2026" },
    })
    await waitFor(() => {
      expect(api.fetchManagementPeople).toHaveBeenCalledWith(
        expect.anything(),
        "2025-2026",
      )
    })
    expect(
      api.fetchManagementAttendance.mock.calls.filter(
        ([, seasonSlug]) => seasonSlug === "2025-2026",
      ),
    ).toHaveLength(0)

    oldSeason.resolve(oldSeasonRoster)
    await waitFor(() => {
      expect(api.fetchManagementAttendance).toHaveBeenCalledWith(
        expect.anything(),
        "2025-2026",
        oldSeasonRoster,
      )
    })
  })

  it("invalidates same-season attendance and ignores a superseded result", async () => {
    const refreshedRoster = currentRoster.map((row) =>
      row.category === "PLAYER" ? { ...row, joinedOn: "2026-07-15" } : row,
    )
    const firstAttendance = deferred<Map<string, AttendanceSummary>>()
    const secondAttendance = deferred<Map<string, AttendanceSummary>>()
    api.fetchManagementPeople
      .mockResolvedValueOnce(currentRoster)
      .mockResolvedValueOnce(refreshedRoster)
    api.fetchManagementAttendance
      .mockReturnValueOnce(firstAttendance.promise)
      .mockReturnValueOnce(secondAttendance.promise)

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Presenze/ }))
    await waitFor(() => {
      expect(api.fetchManagementAttendance).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Refresh roster" }))
    await waitFor(() => {
      expect(api.fetchManagementAttendance).toHaveBeenCalledWith(
        expect.anything(),
        "2026-2027",
        refreshedRoster,
      )
    })

    secondAttendance.resolve(
      new Map([
        [
          "profile-luca",
          {
            training: { present: 1, total: 1, percentage: 100 },
            matches: { present: 0, total: 0, percentage: 0 },
            recentTraining: [
              {
                eventId: "new-training",
                startsAt: "2026-07-27T18:30:00.000Z",
                status: "PRESENT",
              },
            ],
          },
        ],
      ]),
    )
    await screen.findAllByLabelText("Lunedì 27 luglio 2026: presente")

    firstAttendance.resolve(new Map())
    await waitFor(() => {
      expect(
        screen.getAllByLabelText("Lunedì 27 luglio 2026: presente"),
      ).not.toHaveLength(0)
    })
  })

  it("blocks column edits until load and serializes rapid saves in UI order", async () => {
    const preferenceLoad = deferred<unknown>()
    const firstSave = deferred<void>()
    const secondSave = deferred<void>()
    api.fetchManagementColumnPreferences.mockReturnValue(preferenceLoad.promise)
    api.saveManagementColumnPreferences
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise)

    render(<ManagementDashboard />)
    const columnsButton = await screen.findByRole("button", {
      name: "Colonne",
    })
    expect(columnsButton).toBeDisabled()
    fireEvent.click(columnsButton)
    expect(
      screen.queryByRole("checkbox", { name: "Telefono" }),
    ).not.toBeInTheDocument()

    preferenceLoad.resolve({
      PEOPLE: ["person", "confirmation", "phone", "account"],
    })
    await waitFor(() => expect(columnsButton).toBeEnabled())
    fireEvent.click(columnsButton)
    fireEvent.click(screen.getByRole("checkbox", { name: "Telefono" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Account" }))

    await waitFor(() => {
      expect(api.saveManagementColumnPreferences).toHaveBeenCalledTimes(1)
    })
    firstSave.resolve()
    await waitFor(() => {
      expect(api.saveManagementColumnPreferences).toHaveBeenCalledTimes(2)
    })
    expect(api.saveManagementColumnPreferences.mock.calls[1][2]).toEqual(
      expect.objectContaining({
        PEOPLE: ["person", "confirmation"],
      }),
    )
    secondSave.resolve()
  })
})
