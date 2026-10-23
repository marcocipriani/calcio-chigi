import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MatchSession, TimelineEntry } from "@/lib/match"
import { readQueue } from "@/lib/match-queue"

const mocks = vi.hoisted(() => ({
  session: { isManager: true, profile: { id: "manager" }, loading: false },
  live: { session: null as MatchSession | null, timeline: [] as TimelineEntry[] },
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
  rpc: vi.fn(),
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({ useAppSession: () => mocks.session }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/components/match/useLiveMatch", () => ({
  useLiveMatch: () => ({ ...mocks.live, loaded: true, reload: vi.fn().mockResolvedValue(undefined) }),
  useNow: () => new Date("2026-10-24T19:20:00.000Z"),
}))
vi.mock("@/lib/api", () => ({
  fetchEventById: vi.fn().mockResolvedValue({
    id: "event-1",
    tipo: "PARTITA",
    data_ora: "2026-10-24T19:00:00.000Z",
    squadra_casa: "CIRC. CHIGI",
    squadra_ospite: "PSICOLOGOL",
    avversario: "PSICOLOGOL",
    season_id: "season-1",
    cancellato: false,
  }),
  fetchRosterForEvent: vi.fn().mockResolvedValue(
    [
      ["rossi", "Mario", "Rossi", "ATTACCANTE"],
      ["verdi", "Luca", "Verdi", "CENTROCAMPISTA"],
      ["neri", "Paolo", "Neri", "ATTACCANTE"],
    ].map(([id, nome, cognome, ruolo]) => ({
      id,
      nome,
      cognome,
      ruolo,
      avatar_url: null,
      data_nascita: "1980-01-01",
      numero_maglia: null,
      dipartimento: null,
      tags: [],
      is_staff: false,
      training_only: false,
    })),
  ),
  fetchAttendanceForEvent: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/supabaseBrowser", () => {
  const query = {
    select: () => query,
    eq: () => query,
    lt: () => query,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
  }
  return { supabaseBrowser: { from: () => query, rpc: mocks.rpc } }
})

import { MatchMode } from "@/components/match/MatchMode"

function liveSession(overrides: Partial<MatchSession> = {}): MatchSession {
  return {
    eventId: "event-1",
    status: "FIRST_HALF",
    periodMinutes: 35,
    periodStartedAt: "2026-10-24T19:00:00.000Z",
    addedMinutes: 0,
    timeoutUsed: false,
    lineup: {
      module: "4-4-2",
      starters: [
        { profileId: "rossi", positionKey: "ATT1" },
        { profileId: "verdi", positionKey: "CC1" },
      ],
      bench: ["neri"],
    },
    scoreOurs: 0,
    scoreTheirs: 0,
    operatorProfileId: "manager",
    operatorSince: "2026-10-24T19:00:00.000Z",
    operatorName: "Marta Manager",
    finishedAt: null,
    ...overrides,
  }
}

const entry = (fields: Partial<TimelineEntry>): TimelineEntry => ({
  id: crypto.randomUUID(),
  kind: "SUB",
  period: 1,
  minute: 10,
  stoppage: 0,
  occurredAt: "2026-10-24T19:10:00.000Z",
  profileId: null,
  assistProfileId: null,
  subInProfileId: null,
  playerName: null,
  assistName: null,
  subInName: null,
  ...fields,
})

beforeEach(() => {
  window.localStorage.clear()
  mocks.session = { isManager: true, profile: { id: "manager" }, loading: false }
  mocks.live = { session: liveSession(), timeline: [] }
  // Offline: gli eventi restano in coda e si possono controllare.
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code: "", message: "Failed to fetch" } })
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
})

const queuedKinds = () => readQueue("event-1").map(({ kind, profileId }) => `${kind}:${profileId ?? ""}`)

describe("MatchMode", () => {
  it("records a goal without assist from the player's avatar", async () => {
    render(<MatchMode eventId="event-1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Mario Rossi/ }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: /Goal/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Nessun assist" }))

    await waitFor(() => expect(queuedKinds()).toEqual(["GOAL:rossi"]))
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chigi 1–0 PSICOLOGOL")
    expect(screen.getByRole("status")).toHaveTextContent("1 evento da inviare")
  })

  it("asks for the red card on the second yellow", async () => {
    mocks.live.timeline = [entry({ kind: "YELLOW", profileId: "verdi" })]
    render(<MatchMode eventId="event-1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Luca Verdi/ }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: /Giallo/ }))
    expect(within(dialog).getByText("Secondo giallo: espulso?")).toBeVisible()
    fireEvent.click(within(dialog).getByRole("button", { name: /Espulso/ }))

    await waitFor(() => expect(queuedKinds()).toEqual(["YELLOW:verdi", "RED:verdi"]))
  })

  it("warns past the substitution limit but still records the change", async () => {
    mocks.live.timeline = [1, 2, 3].map((index) =>
      entry({ id: `sub-${index}`, kind: "SUB", profileId: "x", subInProfileId: "y", occurredAt: `2026-10-24T19:0${index}:00.000Z` }),
    )
    render(<MatchMode eventId="event-1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Mario Rossi/ }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: /Cambio/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: /Paolo Neri/ }))

    await waitFor(() => expect(queuedKinds()).toEqual(["SUB:rossi"]))
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining("Limite di cambi raggiunto (3/3)"))
  })

  it("undoes a queued event before it is sent", async () => {
    render(<MatchMode eventId="event-1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Goal PSICOLOGOL/ }))
    await waitFor(() => expect(queuedKinds()).toEqual(["GOAL_AGAINST:"]))
    fireEvent.click(screen.getByRole("button", { name: /Annulla: Goal avversario/ }))
    await waitFor(() => expect(queuedKinds()).toEqual([]))
  })

  it("lets another manager take control and keeps players out", async () => {
    mocks.live.session = liveSession({ operatorProfileId: "luca", operatorName: "Luca Vice" })
    const { unmount } = render(<MatchMode eventId="event-1" />)
    expect(await screen.findByRole("button", { name: "Prendi il controllo" })).toBeVisible()
    expect(screen.queryByRole("button", { name: /Mario Rossi/ })).not.toBeInTheDocument()
    unmount()

    mocks.session = { isManager: false, profile: { id: "player" }, loading: false }
    render(<MatchMode eventId="event-1" />)
    expect(await screen.findByText("La modalità partita è riservata ai manager.")).toBeVisible()
  })
})
