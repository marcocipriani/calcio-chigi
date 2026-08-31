import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const supabase = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({
      eq: async () => ({ data: [], error: null }),
    }),
  })),
  rpc: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: supabase }))
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { EventRosterPanel } from "@/components/events/EventRosterPanel"

const roster = [
  {
    id: "player-1",
    nome: "Piero",
    cognome: "Player",
    ruolo: "ATTACCANTE",
    avatar_url: null,
    data_nascita: "1995-01-01",
    is_staff: false,
    training_only: false,
    status: "PRESENTE",
    vote_time: "2026-08-30T18:00:00.000Z",
    modified_by: "player-1",
  },
  {
    id: "player-2",
    nome: "Marco",
    cognome: "Secondo",
    ruolo: "DIFENSORE",
    avatar_url: null,
    data_nascita: "1995-01-01",
    is_staff: false,
    training_only: false,
    status: null,
    vote_time: null,
    modified_by: null,
  },
  {
    id: "staff-1",
    nome: "Sara",
    cognome: "Staff",
    ruolo: null,
    avatar_url: null,
    data_nascita: null,
    is_staff: true,
    training_only: false,
    status: "PRESENTE",
    vote_time: null,
    modified_by: null,
  },
]

function renderPanel(isManager = true) {
  return render(
    <EventRosterPanel
      eventDate={new Date("2026-08-31T18:00:00.000Z")}
      eventId="event-1"
      isManager={isManager}
      isMatch={false}
      managerProfileId="manager-1"
      namesByProfileId={{}}
      roster={roster}
    />,
  )
}

describe("EventRosterPanel", () => {
  it("checks in a single player from the availability row", async () => {
    supabase.rpc.mockClear()
    renderPanel()

    fireEvent.click(await screen.findByLabelText("Check-in Piero Player"))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("set_event_checkin", {
        p_event_id: "event-1",
        p_profile_id: "player-1",
        p_status: "PRESENT",
      }),
    )
  })

  it("applies the bulk switch to the selected rows only", async () => {
    supabase.rpc.mockClear()
    renderPanel()

    fireEvent.click(await screen.findByLabelText("Seleziona Marco Secondo"))
    fireEvent.click(screen.getByLabelText("Check-in dei selezionati"))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1))
    expect(supabase.rpc).toHaveBeenCalledWith("set_event_checkin", {
      p_event_id: "event-1",
      p_profile_id: "player-2",
      p_status: "PRESENT",
    })
  })

  it("keeps staff and non managers out of the check-in controls", async () => {
    const { unmount } = renderPanel()
    expect(await screen.findByText(/Staff Sara/)).toBeVisible()
    expect(
      screen.queryByLabelText("Check-in Sara Staff"),
    ).not.toBeInTheDocument()

    unmount()
    renderPanel(false)
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Check-in dei selezionati"),
      ).not.toBeInTheDocument(),
    )
  })
})
