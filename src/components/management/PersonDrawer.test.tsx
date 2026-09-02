import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PersonDrawer } from "@/components/management/PersonDrawer"
import type { ManagementPerson } from "@/lib/management"

vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: {} }))

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

function renderDrawer() {
  render(
    <PersonDrawer
      onOpenChange={vi.fn()}
      onSaved={vi.fn().mockResolvedValue(undefined)}
      person={person}
    />,
  )
  const content = screen.getByRole("dialog")
  const scrollArea = content.querySelector<HTMLElement>(".overflow-y-auto")
  const footer = content.querySelector<HTMLElement>(
    '[data-slot="dialog-footer"]',
  )
  if (!scrollArea || !footer) throw new Error("Scheda persona senza corpo o footer")
  return { content, footer, scrollArea }
}

describe("PersonDrawer", () => {
  it("mantiene il corpo scorrevole tra header e footer fissi", () => {
    const { content, scrollArea } = renderDrawer()

    // Il contenitore deve essere una colonna flex: con `grid` le tracce non si
    // stringono sotto `max-height` e il corpo sfora invece di scorrere.
    expect(content).toHaveClass(
      "flex",
      "flex-col",
      "overflow-hidden",
      "max-h-[calc(100dvh-1rem)]",
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
})
