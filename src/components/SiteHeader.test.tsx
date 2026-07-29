import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SiteHeader } from "@/components/SiteHeader"

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: () => ({
    isManager: true,
    profile: { nome: "Marco", cognome: "Rossi" },
    user: { id: "manager-1" },
  }),
}))

vi.mock("@/components/management/ManagerPresence", () => ({
  ManagerPresence: () => null,
}))

vi.mock("@/components/notifications/NotificationBell", () => ({
  NotificationBell: () => null,
}))

describe("SiteHeader", () => {
  it("offers management as a violet circular mobile action with one exact label", async () => {
    render(<SiteHeader />)

    const managementLink = screen.getByRole("link", {
      name: "Gestione",
    })

    expect(managementLink).toHaveAttribute("href", "/gestione")
    expect(managementLink).toHaveClass("size-11", "bg-violet-600")
    expect(screen.getByText("Gestione")).toHaveClass(
      "sr-only",
      "sm:not-sr-only",
    )
    fireEvent.focus(managementLink)
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Gestione")
  })
})
