import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/squadra",
}))

import { BottomNav } from "@/components/BottomNav"

describe("BottomNav", () => {
  it("uses precise outline icons without filling their geometry", () => {
    const { container } = render(<BottomNav />)

    expect(container.querySelector(".lucide-calendar-range")).toBeTruthy()
    expect(container.querySelector(".lucide-shirt")).toBeTruthy()
    expect(container.querySelector(".lucide-trophy")).toBeTruthy()
    expect(
      container.querySelector(".lucide-chart-no-axes-combined"),
    ).toBeTruthy()
    expect(container.querySelector(".fill-current")).toBeNull()
    expect(
      [...container.querySelectorAll(".lucide")].every(
        (icon) => icon.getAttribute("stroke-width") === "2",
      ),
    ).toBe(true)
    expect(
      [...container.querySelectorAll(".lucide")].every(
        (icon) =>
          icon.getAttribute("fill") === "none" &&
          icon.classList.contains("size-5"),
      ),
    ).toBe(true)
  })

  it("uses the calendar pill pattern on mobile and desktop", () => {
    render(<BottomNav />)

    const navigation = screen.getByRole("navigation")
    expect(navigation).toHaveClass(
      "inset-x-2",
      "rounded-full",
      "border",
      "p-1",
      "md:bottom-4",
      "md:left-1/2",
    )

    const active = screen.getByRole("link", { name: "Squadra" })
    expect(active).toHaveClass(
      "rounded-full",
      "bg-violet-600",
      "text-white",
      "hover:bg-violet-700",
    )
    expect(active).not.toHaveClass("bg-violet-100/80")

    const inactive = screen.getByRole("link", { name: "Calendario" })
    expect(inactive).toHaveClass(
      "hover:bg-violet-50",
      "hover:text-violet-700",
    )
    expect(active.querySelector("svg")?.parentElement).toHaveClass(
      "motion-safe:group-hover:-translate-y-0.5",
    )
  })
})
