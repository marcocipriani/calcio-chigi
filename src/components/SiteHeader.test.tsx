import { render, screen } from "@testing-library/react"
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
  ManagerPresence: () => <div aria-label="Manager e stato attività" />,
}))

vi.mock("@/components/notifications/NotificationBell", () => ({
  NotificationBell: () => null,
}))

describe("SiteHeader", () => {
  it("groups the management action with manager presence", () => {
    render(<SiteHeader />)

    const managementLink = screen.getByRole("link", {
      name: "Gestione squadra",
    })

    expect(managementLink).toHaveAttribute("href", "/gestione")
    expect(managementLink).not.toHaveClass("bg-violet-600")
    expect(managementLink.querySelector(".lucide-users-round")).toBeTruthy()
    expect(screen.getByLabelText("Manager e stato attività").parentElement)
      .toContainElement(managementLink)
  })
})
