import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PersonDrawer } from "@/components/management/PersonDrawer"
import type { ManagementPerson } from "@/lib/management"

vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: {} }))
const jerseyApi = vi.hoisted(() => ({
  fetchJerseyHistory: vi.fn().mockResolvedValue([
    {
      seasonId: "season-2025",
      seasonName: "Stagione 2025–2026",
      startsOn: "2025-08-01",
      jerseyNumber: 8,
    },
  ]),
}))
vi.mock("@/lib/jersey-api", () => jerseyApi)
const managementApi = vi.hoisted(() => ({
  trashPerson: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/management-api", () => managementApi)

const person: ManagementPerson = {
  id: "membership-1",
  profileId: "profile-1",
  nome: "Luca",
  cognome: "Verdi",
  category: "PLAYER",
  status: "YES",
  role: "Difensore",
  jerseyNumber: 8,
  isExternal: false,
  isAggregated: false,
  trainingOnly: false,
  registrationStatus: "TODO",
  profileUpdatedAt: "2026-07-25T00:00:00.000Z",
  membershipUpdatedAt: "2026-07-25T00:00:00.000Z",
  accountStatus: "NONE",
  payments: [{ status: "DUE", amountDue: 80 }],
  certificateStatus: "MISSING",
}

function renderDrawer(overrides: Partial<ManagementPerson> = {}) {
  const onOpenChange = vi.fn()
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(
    <PersonDrawer
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      person={{ ...person, ...overrides }}
    />,
  )
  const content = screen.getByRole("dialog")
  const scrollArea = content.querySelector<HTMLElement>(".overflow-y-auto")
  const footer = content.querySelector<HTMLElement>(
    '[data-slot="dialog-footer"]',
  )
  if (!scrollArea || !footer) throw new Error("Scheda persona senza corpo o footer")
  return { content, footer, onOpenChange, onSaved, scrollArea }
}

describe("PersonDrawer", () => {
  it("mantiene il corpo scorrevole tra header e footer fissi", () => {
    const { content, scrollArea } = renderDrawer()

    // Il contenitore deve essere una colonna flex: con `grid` le tracce non si
    // stringono sotto `max-height` e il corpo sfora invece di scorrere.
    // Su mobile occupa lo schermo intero; da `sm` torna finestra centrata.
    expect(content).toHaveClass(
      "flex",
      "flex-col",
      "overflow-hidden",
      "h-dvh",
      "sm:max-h-[calc(100dvh-2rem)]",
    )
    expect(
      content.querySelector('[data-slot="dialog-header"]'),
    ).toHaveClass("shrink-0")

    const form = scrollArea.parentElement
    expect(form?.tagName).toBe("FORM")
    expect(form).toHaveClass("flex", "flex-col", "flex-1", "min-h-0")
    expect(form).not.toHaveClass("contents")

    // `min-h-0` è ciò che permette al corpo di restringersi e scorrere.
    expect(scrollArea).toHaveClass("flex-1", "min-h-0", "overflow-y-auto")
  })

  it("tiene il footer fuori dall'area scorrevole", () => {
    const { footer, scrollArea } = renderDrawer()

    expect(scrollArea.contains(footer)).toBe(false)
    expect(footer.parentElement).toBe(scrollArea.parentElement)
    expect(footer).toHaveClass("shrink-0")
    expect(
      screen.getByRole("button", { name: "Salva modifiche" }),
    ).toBeInTheDocument()
  })

  it("mostra le sezioni della scheda dentro l'area scorrevole", () => {
    const { scrollArea } = renderDrawer()

    for (const section of ["Persona e contatti", "Documenti", "Pagamenti", "Operativo"]) {
      expect(
        scrollArea.contains(screen.getByRole("heading", { name: section })),
      ).toBe(true)
    }
  })

  it("chiude dall'header senza sovrapporsi al pulsante avatar", () => {
    const { content, onOpenChange } = renderDrawer()
    const header = content.querySelector('[data-slot="dialog-header"]')!

    const close = within(content).getByRole("button", { name: "Chiudi" })
    expect(header.contains(close)).toBe(true)
    expect(close).toHaveClass("size-11")
    fireEvent.click(close)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("sposta nel cestino solo dopo conferma", async () => {
    const { onOpenChange, onSaved } = renderDrawer()

    fireEvent.click(screen.getByRole("button", { name: "Elimina" }))
    expect(managementApi.trashPerson).not.toHaveBeenCalled()
    const confirm = screen.getByRole("alertdialog", {
      name: "Eliminare Luca Verdi?",
    })
    expect(confirm).toHaveTextContent("30 giorni")

    fireEvent.click(
      within(confirm).getByRole("button", { name: "Sposta nel cestino" }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(managementApi.trashPerson).toHaveBeenCalledWith(
      expect.anything(),
      "profile-1",
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("non offre l'eliminazione per i manager", () => {
    renderDrawer({ isManager: true })

    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull()
  })

  it("mostra lo storico dei numeri di maglia", async () => {
    renderDrawer()

    const history = await screen.findByRole("region", { name: "Storico maglie" })
    expect(
      await within(history).findByText("Stagione 2025–2026"),
    ).toBeInTheDocument()
    expect(history).toHaveTextContent("#8")
    expect(jerseyApi.fetchJerseyHistory).toHaveBeenCalledWith(
      expect.anything(),
      "profile-1",
    )
  })
})
