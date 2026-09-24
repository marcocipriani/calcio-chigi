import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Event } from "@/lib/types"

vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: {} }))
vi.mock("@/lib/api", () => ({
  fetchPlaces: vi.fn(async () => ["SS Romulea", "C.S. CAVALIERI", "VIGOR PERCONTI"]),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { EventDialog } from "@/components/EventDialog"

const baseEvent: Event = {
  id: "event-1",
  created_at: "2026-09-01T00:00:00.000Z",
  season_id: "season-1",
  tipo: "ALLENAMENTO",
  data_ora: "2026-10-08T19:00:00.000Z",
  luogo: "SS Romulea",
  giocata: false,
  cancellato: false,
}

function renderDialog(eventToEdit: Event | null = null) {
  const onSave = vi.fn(async (payload: Partial<Event>) => {
    void payload
  })
  render(
    <EventDialog eventToEdit={eventToEdit} onOpenChange={vi.fn()} onSave={onSave} open />,
  )
  return onSave
}

describe("EventDialog", () => {
  it("defaults a new training to SS Romulea on campo a 11", async () => {
    const onSave = renderDialog()

    expect(await screen.findByRole("combobox", { name: "Luogo" })).toHaveTextContent("SS Romulea")
    fireEvent.click(screen.getByRole("button", { name: "Salva Modifiche" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      tipo: "ALLENAMENTO",
      luogo: "SS Romulea",
      tipo_campo: "a11",
    })
  })

  it("selects a known pitch regardless of casing instead of asking for a new one", async () => {
    renderDialog({ ...baseEvent, luogo: "Vigor Perconti" })

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Luogo" })).toHaveTextContent("VIGOR PERCONTI"),
    )
    expect(screen.queryByLabelText("Nuovo campo")).not.toBeInTheDocument()
  })

  it("shows a free-text field for a pitch that is not in the list", async () => {
    renderDialog({ ...baseEvent, luogo: "CAMPO NUOVO" })

    expect(await screen.findByLabelText("Nuovo campo")).toHaveValue("CAMPO NUOVO")
    expect(screen.getByRole("combobox", { name: "Luogo" })).toHaveTextContent("Altro…")
  })

  it("saves a friendly with opponent but without tournament phase or round", async () => {
    const onSave = renderDialog({
      ...baseEvent,
      tipo: "AMICHEVOLE",
      avversario: "RADIOTAXI 3570",
      squadra_casa: "CIRC. CHIGI",
      squadra_ospite: "RADIOTAXI 3570",
      fase: "FASE_1",
      giornata: 3,
    })

    expect(await screen.findByLabelText("Avversario / Titolo")).toHaveValue("RADIOTAXI 3570")
    expect(screen.queryByText("Fase torneo")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Salva Modifiche" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      tipo: "AMICHEVOLE",
      avversario: "RADIOTAXI 3570",
      fase: null,
      giornata: null,
      tipo_campo: null,
    })
  })

  it("keeps tournament phase and round on a tournament match", async () => {
    const onSave = renderDialog({
      ...baseEvent,
      tipo: "PARTITA",
      luogo: "C.S. CAVALIERI",
      avversario: "VVF",
      squadra_casa: "CIRC. CHIGI",
      squadra_ospite: "VVF",
      fase: "FASE_1",
      giornata: 3,
    })

    expect(await screen.findByText("Fase torneo")).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Luogo" })).toHaveTextContent("C.S. CAVALIERI"),
    )
    fireEvent.click(screen.getByRole("button", { name: "Salva Modifiche" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      tipo: "PARTITA",
      luogo: "C.S. CAVALIERI",
      fase: "FASE_1",
      giornata: 3,
    })
  })
})
