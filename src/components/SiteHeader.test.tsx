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
    expect(managementLink).toHaveClass(
      "border-violet-300",
      "text-violet-700",
      "hover:bg-violet-50",
    )
    expect(managementLink).not.toHaveClass("bg-violet-600")
    expect(managementLink.querySelector(".lucide-users-round")).toBeTruthy()
    expect(screen.getByLabelText("Manager e stato attività").parentElement)
      .toContainElement(managementLink)

    const profileAvatar = screen
      .getByRole("link", { name: "Marco Rossi" })
      .querySelector('[data-slot="avatar"]')
    expect(profileAvatar).toHaveClass("ring-emerald-500")
    expect(profileAvatar).not.toHaveClass("ring-violet-500")
  })

  it("keeps a compact app title visible on mobile", () => {
    render(<SiteHeader />)

    expect(screen.getByText("Calcio Chigi", { exact: true })).toHaveClass(
      "sm:hidden",
    )
    expect(screen.getByText("Calcio Circolo Chigi")).toHaveClass("sm:inline")
  })

  it("uses consistent mobile touch targets for header actions", () => {
    render(<SiteHeader />)

    expect(screen.getByRole("button", { name: "Cambia tema" })).toHaveClass(
      "size-11",
      "sm:size-9",
    )
    expect(screen.getByRole("link", { name: "Marco Rossi" })).toHaveClass(
      "flex",
      "size-11",
    )
  })
})
