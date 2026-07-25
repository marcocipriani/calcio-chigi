import { describe, expect, it } from "vitest"

import {
  canEditPassportPhoto,
  paymentStatusLabel,
  certificateStatusLabel,
} from "./profile-operations"

describe("profile operations", () => {
  it("locks the passport photo after registration for players", () => {
    expect(canEditPassportPhoto("ACTIVE", false, null)).toBe(false)
    expect(canEditPassportPhoto("ACTIVE", false, "2026-09-01T10:00:00Z")).toBe(true)
    expect(canEditPassportPhoto("ACTIVE", true, null)).toBe(true)
    expect(canEditPassportPhoto("TODO", false, null)).toBe(true)
  })

  it("uses operational Italian labels for payment states", () => {
    expect(paymentStatusLabel("DUE")).toBe("Da pagare")
    expect(paymentStatusLabel("PENDING_REVIEW")).toBe("Da verificare")
    expect(paymentStatusLabel("PAID")).toBe("Pagata")
  })

  it("distinguishes certificate review and validity states", () => {
    expect(certificateStatusLabel("MISSING")).toBe("Mancante")
    expect(certificateStatusLabel("PENDING_REVIEW")).toBe("Da verificare")
    expect(certificateStatusLabel("VALID")).toBe("Valido")
    expect(certificateStatusLabel("REJECTED")).toBe("Respinto")
    expect(certificateStatusLabel("EXPIRED")).toBe("Scaduto")
  })
})
