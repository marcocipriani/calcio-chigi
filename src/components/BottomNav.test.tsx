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
  })

  it("becomes a restrained floating pill on desktop with motion-safe feedback", () => {
    render(<BottomNav />)

    const navigation = screen.getByRole("navigation")
    expect(navigation).toHaveClass(
      "md:bottom-4",
      "md:left-1/2",
      "md:rounded-full",
    )

    const active = screen.getByRole("link", { name: "Squadra" })
    expect(active).toHaveClass("text-violet-700")
    expect(active.querySelector("svg")?.parentElement).toHaveClass(
      "motion-safe:group-hover:-translate-y-0.5",
    )
  })
})
