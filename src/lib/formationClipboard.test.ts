import { beforeEach, describe, expect, it, vi } from "vitest"

import { copyOfficialFormationMessage } from "@/lib/formationClipboard"

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

describe("copyOfficialFormationMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reports clipboard rejection without throwing into formation state", async () => {
    const writeText = vi
      .fn<(message: string) => Promise<void>>()
      .mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"))

    await expect(
      copyOfficialFormationMessage("formazione invariata", writeText),
    ).resolves.toBe(false)
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Impossibile copiare il messaggio WhatsApp. La formazione è rimasta invariata.",
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  it("confirms a successful official WhatsApp copy", async () => {
    const writeText = vi.fn<(message: string) => Promise<void>>().mockResolvedValue()

    await expect(
      copyOfficialFormationMessage("formazione", writeText),
    ).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("formazione")
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Messaggio WhatsApp copiato",
    )
  })
})
