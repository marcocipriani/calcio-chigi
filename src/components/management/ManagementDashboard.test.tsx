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
    actions,
    context,
    title,
  }: {
    actions: React.ReactNode
    context: React.ReactNode
    title: string
  }) => (
    <header>
      <h1>{title}</h1>
      {context}
      {actions}
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
  { ...person("luca", "Luca", "Verdi", "PLAYER"), birthDate: "2000-01-01" },
  { ...person("anna", "Anna", "Rossi", "STAFF"), passportPhotoPath: "photos/anna.jpg" },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish
    reject = fail
  })
  return { promise, reject, resolve }
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

  it("keeps search, columns, result count and selection in one compact tool group", async () => {
    render(<ManagementDashboard />)

    const tools = await screen.findByRole("group", {
      name: "Strumenti dashboard",
    })
    expect(
      within(tools).getByPlaceholderText("Cerca persona, telefono…"),
    ).toBeVisible()
    expect(within(tools).getByRole("button", { name: /Colonne/ })).toBeVisible()
    expect(within(tools).getByText("2 risultati · 0 selezionati")).toBeVisible()
    expect(
      within(tools).getByRole("button", { name: "Seleziona visibili" }),
    ).toBeVisible()
  })

  it("uses column-filtered rows for the result count and visible selection", async () => {
    render(<ManagementDashboard />)

    const table = await screen.findByRole("table")
    fireEvent.click(screen.getByRole("button", { name: "Filtri" }))
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Filtra Persona" }),
      { target: { value: "U35" } },
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
      within(table).getByRole("checkbox", { name: "Seleziona Luca Verdi" }),
    ).toBeChecked()
    expect(
      within(table).queryByRole("checkbox", { name: "Seleziona Anna Rossi" }),
    ).not.toBeInTheDocument()
  })

  it("drops a selection that leaves the visible rows", async () => {
    render(<ManagementDashboard />)

    const table = await screen.findByRole("table")
    fireEvent.click(
      within(table).getByRole("checkbox", { name: "Seleziona Anna Rossi" }),
    )
    await waitFor(() => {
      expect(
        screen.getByText("2 risultati · 1 selezionati"),
      ).toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByPlaceholderText("Cerca persona, telefono…"),
      { target: { value: "Luca" } },
    )

    await waitFor(() => {
      expect(
        screen.getByText("1 risultati · 0 selezionati"),
      ).toBeInTheDocument()
    })
  })

  it("clears column filters and sorting when the view changes", async () => {
    render(<ManagementDashboard />)
    await screen.findByRole("table")

    fireEvent.click(screen.getByRole("button", { name: "Filtri" }))
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Filtra Persona" }),
      { target: { value: "U35" } },
    )
    await waitFor(() => {
      expect(
        screen.getByText("1 risultati · 0 selezionati"),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("tab", { name: /Quote/ }))
    fireEvent.click(screen.getByRole("tab", { name: /Persone/ }))

    await waitFor(() => {
      expect(
        screen.getByText("2 risultati · 0 selezionati"),
      ).toBeInTheDocument()
    })
  })

  it("switches the desktop layout from the list to the cards", async () => {
    render(<ManagementDashboard />)
    await screen.findByRole("table")

    fireEvent.click(screen.getByRole("button", { name: "Vista schede" }))

    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument()
    })
    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(
      screen.getByRole("button", { name: "Vista schede" }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("offers the mass actions only next to an existing selection", async () => {
    render(<ManagementDashboard />)

    const table = await screen.findByRole("table")
    expect(
      screen.queryByRole("button", { name: "Archivia i selezionati" }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      within(table).getByRole("checkbox", { name: "Seleziona Luca Verdi" }),
    )

    const actionsGroup = screen.getByRole("group", {
      name: "Selezione e azioni di massa",
    })
    for (const name of [
      "Registra quota",
      "Imposta scadenza",
      "Archivia i selezionati",
      "Invia notifica",
    ]) {
      expect(within(actionsGroup).getByRole("button", { name })).toBeVisible()
    }

    fireEvent.click(
      within(actionsGroup).getByRole("button", { name: "Deseleziona" }),
    )
    expect(
      screen.queryByRole("button", { name: "Registra quota" }),
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

  it("uses the semantic destructive foreground for account rejection", async () => {
    api.fetchManagementPeople.mockResolvedValue([
      {
        ...currentRoster[0],
        accountStatus: "PENDING",
        associationRequestId: "request-1",
      },
    ])

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Account/ }))
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /Rifiuta account di/ }))[0],
    )

    expect(
      await screen.findByRole("button", { name: "Elimina account" }),
    ).toHaveClass("text-destructive-foreground")
  })

  it("shows loading while passport signatures are pending", async () => {
    const pending = deferred<{
      data: Array<{
        error: string | null
        path: string | null
        signedUrl: string | null
      }>
      error: null
    }>()
    storage.createSignedUrls.mockReturnValue(pending.promise)

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))

    const table = await screen.findByRole("table")
    expect(await within(table).findByText("Caricamento…")).toBeVisible()
    expect(within(table).queryByText("photos/anna.jpg")).not.toBeInTheDocument()

    pending.resolve({
      data: [
        {
          error: null,
          path: "photos/anna.jpg",
          signedUrl: "https://signed.example/anna.jpg",
        },
      ],
      error: null,
    })
  })

  it("marks every existing passport photo unavailable after a batch error", async () => {
    storage.createSignedUrls.mockResolvedValue({
      data: null,
      error: new Error("storage unavailable"),
    })

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))

    const table = await screen.findByRole("table")
    expect(await within(table).findByText("Non disponibile")).toBeVisible()
    expect(within(table).queryByText("photos/anna.jpg")).not.toBeInTheDocument()
  })

  it("marks an individual passport photo unavailable when signing omits its URL", async () => {
    storage.createSignedUrls.mockResolvedValue({
      data: [
        {
          error: "Object not found",
          path: "photos/anna.jpg",
          signedUrl: null,
        },
      ],
      error: null,
    })

    render(<ManagementDashboard />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("tab", { name: /Tesseramenti/ }))

    const table = await screen.findByRole("table")
    expect(await within(table).findByText("Non disponibile")).toBeVisible()
    expect(within(table).queryByText("photos/anna.jpg")).not.toBeInTheDocument()
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
    const [trigger] = await screen.findAllByRole("button", {
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

  it("blocks a failed selected season instead of exposing the previous roster", async () => {
    const failedSeason = deferred<ManagementPerson[]>()
    const retry = deferred<ManagementPerson[]>()
    let failedSeasonAttempts = 0
    api.fetchManagementPeople.mockImplementation(
      async (_client, selectedSeasonSlug: string) => {
        if (selectedSeasonSlug === "2026-2027") return currentRoster
        failedSeasonAttempts += 1
        return failedSeasonAttempts === 1
          ? failedSeason.promise
          : retry.promise
      },
    )

    render(<ManagementDashboard />)
    const table = await screen.findByRole("table")
    fireEvent.click(
      within(table).getByRole("checkbox", { name: "Seleziona Luca Verdi" }),
    )
    expect(screen.getByText("2 risultati · 1 selezionati")).toBeVisible()

    fireEvent.change(screen.getByRole("combobox", { name: "Stagione" }), {
      target: { value: "2025-2026" },
    })
    await act(async () => {
      failedSeason.reject(new Error("season B unavailable"))
      await Promise.resolve()
    })

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(
      "Rosa della stagione 2025–2026 non disponibile",
    )
    expect(within(alert).getByRole("button", { name: "Riprova" })).toBeVisible()
    expect(screen.queryByText("Luca Verdi")).not.toBeInTheDocument()
    expect(screen.getByText("0 risultati · 0 selezionati")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Registra quota" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Seleziona visibili" }),
    ).toBeDisabled()

    fireEvent.click(within(alert).getByRole("button", { name: "Riprova" }))
    await waitFor(() => {
      expect(
        api.fetchManagementPeople.mock.calls.filter(
          ([, selectedSeasonSlug]) =>
            selectedSeasonSlug === "2025-2026",
        ),
      ).toHaveLength(2)
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
      PEOPLE: ["person", "phone", "account"],
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
        PEOPLE: ["person"],
      }),
    )
    secondSave.resolve()
  })
})
