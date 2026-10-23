import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PaymentEntryDialog } from "@/components/payments/PaymentEntryDialog"
import { remainingAmount, type CashRecipient } from "@/lib/payments"

const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {}, error: null }))
vi.mock("@/lib/supabaseBrowser", () => ({ supabaseBrowser: { rpc } }))

const recipients: CashRecipient[] = [
  { id: "staff-1", nome: "Sara", cognome: "Alise", group: "STAFF" },
  { id: "manager-1", nome: "Marco", cognome: "Cipriani", group: "MANAGER" },
  { id: "player-1", nome: "Luca", cognome: "Bianchi", group: "PLAYER" },
  { id: "me", nome: "Io", cognome: "Stesso", group: "PLAYER" },
]

function renderDialog() {
  return render(
    <PaymentEntryDialog
      currentProfileId="me"
      description="Quota – rata 1/2"
      mode="player"
      onOpenChange={() => {}}
      onSaved={() => {}}
      open
      ownerName="Io Stesso"
      ownerProfileId="me"
      paymentId="payment-1"
      recipients={recipients}
      remaining={150}
      settings={{ iban: "IT60X0542811101000000123456", holder: "Circolo" }}
    />,
  )
}

describe("PaymentEntryDialog", () => {
  it("shows the IBAN for bank transfers", () => {
    renderDialog()
    expect(screen.getByText("IT60X0542811101000000123456")).toBeInTheDocument()
    expect(screen.getByText("Quota – rata 1/2 – Io Stesso")).toBeInTheDocument()
  })

  it("groups cash recipients staff, manager, players without the owner", async () => {
    renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Contanti" }))
    const select = screen.getByLabelText("A chi li hai dati")
    const groups = Array.from(select.querySelectorAll("optgroup")).map(
      (group) => group.label,
    )
    expect(groups).toEqual(["Staff", "Manager", "Calciatori"])
    expect(screen.queryByRole("option", { name: "Stesso Io" })).toBeNull()

    fireEvent.change(select, { target: { value: "staff-1" } })
    fireEvent.change(screen.getByLabelText("Importo (€)"), {
      target: { value: "100" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Dichiara" }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "declare_payment_entry",
        expect.objectContaining({
          p_amount: 100,
          p_method: "CASH",
          p_cash_recipient_id: "staff-1",
        }),
      ),
    )
  })
})

describe("remainingAmount", () => {
  it("ignores rejected entries", () => {
    const entry = (amount: number, status: "PENDING" | "VERIFIED" | "REJECTED") => ({
      id: String(amount),
      amount,
      paidOn: "2026-10-01",
      method: "BANK_TRANSFER" as const,
      cashRecipientId: null,
      status,
      rejectionReason: null,
    })
    expect(
      remainingAmount(300, [entry(100, "VERIFIED"), entry(50, "PENDING"), entry(80, "REJECTED")]),
    ).toBe(150)
  })
})
