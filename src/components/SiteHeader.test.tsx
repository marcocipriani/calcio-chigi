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
      "border-operative/40",
      "text-operative",
      "hover:bg-operative/10",
    )
    expect(managementLink).not.toHaveClass("bg-operative")
    expect(managementLink.querySelector(".lucide-users-round")).toBeTruthy()
    expect(screen.getByLabelText("Manager e stato attività").parentElement)
      .toContainElement(managementLink)

    const profileAvatar = screen
      .getByRole("link", { name: "Marco Rossi" })
      .querySelector('[data-slot="avatar"]')
    expect(profileAvatar).toHaveClass("ring-operative")
    expect(profileAvatar).not.toHaveClass("ring-emerald-500")
  })

  it("shows one app title and only zooms the logo on hover", () => {
    render(<SiteHeader />)

    const logo = screen.getByRole("img", { name: "Logo Circolo Chigi" })
    expect(logo).toHaveAttribute(
      "src",
      expect.stringContaining("logo-circolo-chigi-mark"),
    )
    expect(logo).toHaveClass("motion-safe:group-hover:scale-105")
    expect(logo.className).not.toMatch(/rotate/)
    expect(screen.getByText("Calcio Chigi", { exact: true })).toBeVisible()
    expect(screen.queryByText("Calcio Circolo Chigi")).not.toBeInTheDocument()
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
