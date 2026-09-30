import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InjuryHistory } from "@/components/injuries/InjuryHistory"
import type { Injury } from "@/lib/injuries"

const api = vi.hoisted(() => ({
  deleteInjury: vi.fn(),
  fetchInjuries: vi.fn(),
  saveInjury: vi.fn(),
}))
vi.mock("@/lib/injuries", () => api)
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: {} }))

const open: Injury = {
  id: "injury-1",
  profileId: "profile-1",
  startedOn: "2026-09-12",
  endedOn: null,
  note: "caviglia",
}

describe("InjuryHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.saveInjury.mockResolvedValue(undefined)
    api.fetchInjuries.mockResolvedValue([{ ...open, endedOn: "2026-09-20" }])
  })

  it("is read-only on the player page", () => {
    render(<InjuryHistory injuries={[open]} />)

    expect(screen.getByText(/12 set 2026 – in corso/)).toBeVisible()
    expect(screen.getByText("caviglia")).toBeVisible()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("lets the manager mark the return and rereads the history", async () => {
    const onChanged = vi.fn()
    render(
      <InjuryHistory
        injuries={[open]}
        onChanged={onChanged}
        profileId="profile-1"
      />,
    )

    const save = screen.getByRole("button", {
      name: "Salva infortunio del 12 set 2026",
    })
    expect(save).toBeDisabled()

    fireEvent.change(
      screen.getByLabelText("Rientro infortunio del 12 set 2026"),
      { target: { value: "2026-09-20" } },
    )
    fireEvent.click(save)

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(api.saveInjury).toHaveBeenCalledWith(
      {},
      {
        id: "injury-1",
        profileId: "profile-1",
        startedOn: "2026-09-12",
        endedOn: "2026-09-20",
        note: "caviglia",
      },
    )
    expect(api.fetchInjuries).toHaveBeenCalledWith({}, ["profile-1"])
    expect(
      screen.getByLabelText("Rientro infortunio del 12 set 2026"),
    ).toHaveValue("2026-09-20")
  })

  it("opens a new injury from the empty row and reports a refusal", async () => {
    api.saveInjury.mockRejectedValue(
      new Error("Ha già un infortunio aperto: segna prima il rientro"),
    )
    const onChanged = vi.fn()
    render(
      <InjuryHistory injuries={[]} onChanged={onChanged} profileId="profile-1" />,
    )

    fireEvent.change(screen.getByLabelText("Inizio nuovo infortunio"), {
      target: { value: "2026-10-01" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Segna KO" }))

    await waitFor(() => expect(api.saveInjury).toHaveBeenCalledOnce())
    expect(api.saveInjury.mock.calls[0][1]).toMatchObject({
      id: undefined,
      profileId: "profile-1",
      startedOn: "2026-10-01",
      endedOn: null,
    })
    expect(onChanged).not.toHaveBeenCalled()
  })
})
