import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import rows from "@/test/fixtures/crono-chigio.json"
import { CronoResultsTable } from "./CronoResultsTable"

it("sorts from controls and headers and filters profiles while retaining ranks", () => {
  render(<CronoResultsTable rows={rows} />)
  const table = screen.getByRole("table")
  const firstAthlete = () => within(table).getAllByRole("row")[1].children[1].textContent
  expect(firstAthlete()).toBe("Atleta A")
  fireEvent.change(screen.getByLabelText("Ordina per"), { target: { value: "best" } })
  expect(firstAthlete()).toBe("Atleta I")
  fireEvent.change(screen.getByLabelText("Direzione"), { target: { value: "desc" } })
  expect(firstAthlete()).toBe("Atleta K")
  fireEvent.click(screen.getByRole("button", { name: "Differenza (s)" }))
  expect(firstAthlete()).toBe("Atleta A")
  expect(screen.getByRole("columnheader", { name: /Differenza/ })).toHaveAttribute("aria-sort", "ascending")
  fireEvent.change(screen.getByLabelText("Profilo"), { target: { value: "🚀" } })
  expect(within(table).getAllByRole("row")).toHaveLength(8)
  expect(within(table).queryByText("Atleta I")).not.toBeInTheDocument()
})
