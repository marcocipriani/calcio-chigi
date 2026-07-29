import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PageTitleBar } from "@/components/layout/PageTitleBar"

describe("PageTitleBar", () => {
  it("renders the page hierarchy and the supplied slots without owning their state", () => {
    render(
      <PageTitleBar
        actions={
          <button
            aria-label="Crea evento"
            className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:px-3"
            type="button"
          >
            Crea evento
          </button>
        }
        context={<span>Partita tra 2 giorni</span>}
        filters={<button type="button">Filtra attività</button>}
        subtitle="Gli impegni della squadra"
        title="Calendario"
      />,
    )

    expect(
      screen.getByRole("heading", { level: 1, name: "Calendario" }),
    ).toBeVisible()
    expect(screen.getByText("Gli impegni della squadra")).toBeVisible()
    expect(screen.getByText("Partita tra 2 giorni")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Crea evento" }),
    ).toHaveClass("size-11", "sm:h-8", "sm:w-auto")
    expect(
      screen.getByRole("button", { name: "Filtra attività" }),
    ).toBeVisible()
  })

  it("omits optional slot wrappers when callers do not supply them", () => {
    render(<PageTitleBar title="Profilo" />)

    expect(
      screen.getByRole("heading", { level: 1, name: "Profilo" }),
    ).toBeVisible()
    expect(screen.queryByLabelText("Azioni pagina")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Filtri pagina")).not.toBeInTheDocument()
  })
})
