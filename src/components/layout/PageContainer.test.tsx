import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PageContainer } from "@/components/layout/PageContainer"

describe("PageContainer", () => {
  it("keeps its viewport marker and width constraints when callers pass conflicting props", () => {
    render(
      <PageContainer
        className="max-w-none px-0"
        data-page-container={undefined}
      >
        Contenuto pagina
      </PageContainer>,
    )

    const container = screen.getByText("Contenuto pagina").parentElement!
    expect(container).toHaveAttribute("data-page-container")
    expect(container).toHaveClass("max-w-7xl", "px-2")
    expect(container).not.toHaveClass("max-w-none", "px-0")
  })
})
