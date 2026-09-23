import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { JerseyPreferencesForm } from "@/components/jersey/JerseyPreferencesForm"
import type { JerseyBoardRow } from "@/lib/jersey-api"

const teammate: JerseyBoardRow = {
  membershipId: "membership-2",
  profileId: "profile-2",
  nome: "Bruno",
  cognome: "Bomber",
  avatarUrl: null,
  role: null,
  jerseyNumber: null,
  previousJerseyNumber: null,
  choices: [{ number: 10, level: "PREFERRED" }],
  updatedAt: "2026-09-20T10:00:00Z",
}

describe("JerseyPreferencesForm", () => {
  it("proposes last season's number and saves ranked choices with numbers to avoid", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <JerseyPreferencesForm
        initialAvoidNumbers={[]}
        initialChoices={[{ number: 10, level: "PREFERRED" }]}
        onSave={onSave}
        others={[teammate]}
        suggestedFromPreviousSeason
      />,
    )

    expect(screen.getByText(/numero della scorsa stagione/i)).toBeVisible()
    expect(screen.getByText("Lo vogliono anche:", { exact: false })).toHaveTextContent(
      "Bruno B. (preferito)",
    )

    fireEvent.click(screen.getByRole("button", { name: /Aggiungi numero/i }))
    fireEvent.change(screen.getByLabelText("Numero 2ª scelta"), {
      target: { value: "14" },
    })
    fireEvent.change(screen.getByLabelText("Numero da evitare"), {
      target: { value: "13" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Escludi" }))
    fireEvent.click(screen.getByRole("button", { name: /Salva preferenze/i }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [
          { number: 10, level: "PREFERRED" },
          { number: 14, level: "ACCEPTABLE" },
        ],
        [13],
      ),
    )
  })

  it("blocks saving without a preferred number", () => {
    const onSave = vi.fn()
    render(
      <JerseyPreferencesForm
        initialAvoidNumbers={[]}
        initialChoices={[{ number: 7, level: "PREFERRED" }]}
        onSave={onSave}
        others={[]}
        suggestedFromPreviousSeason={false}
      />,
    )

    fireEvent.click(
      screen.getAllByRole("radio", { name: "Accettabile" })[0],
    )
    fireEvent.click(screen.getByRole("button", { name: /Salva preferenze/i }))

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Serve almeno un numero preferito",
    )
    expect(onSave).not.toHaveBeenCalled()
  })
})
