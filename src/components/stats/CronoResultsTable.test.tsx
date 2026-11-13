import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { saveAs } from "file-saver"
import rows from "@/test/fixtures/crono-chigio.json"
import { CronoResultsTable } from "./CronoResultsTable"

vi.mock("file-saver", () => ({ saveAs: vi.fn() }))
it("sorts and filters while preserving ranks and putting the profile first", () => {
  render(<CronoResultsTable rows={rows} />)
  const table = screen.getByRole("table")
  const body = table.querySelector("tbody")!
  const firstAthlete = () => within(body).getAllByRole("row")[0].children[2].textContent
  expect(table.querySelectorAll("thead tr")[1].firstElementChild).toHaveTextContent("Profilo G2")
  expect(screen.getByRole("columnheader", { name: "Giro 1 · 43,35 m" })).toHaveAttribute("colspan", "2")
  expect(screen.getByRole("columnheader", { name: "Giro 2 · Totale e tratti" })).toHaveAttribute("colspan", "6")
  expect(firstAthlete()).toContain("Atleta A")
  fireEvent.change(screen.getByLabelText("Ordina per"), { target: { value: "best" } })
  expect(firstAthlete()).toContain("Atleta I")
  fireEvent.change(screen.getByLabelText("Direzione"), { target: { value: "desc" } })
  expect(firstAthlete()).toContain("Atleta K")
  fireEvent.click(screen.getByRole("button", { name: "Differenza (s)" }))
  expect(firstAthlete()).toContain("Atleta A")
  expect(screen.getByRole("columnheader", { name: /Differenza/ })).toHaveAttribute("aria-sort", "ascending")
  fireEvent.change(screen.getByLabelText("Profilo"), { target: { value: "🚀" } })
  expect(within(body).getAllByRole("row")).toHaveLength(7)
  expect(within(table).queryByText("Atleta I")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }))
  expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), "CronoChigio-2026-11-12.csv")
})
it("shows roster names and avatars and bolds the better personal total", () => {
  const { container } = render(<CronoResultsTable rows={rows} players={[{ season_id: "season", profile_id: "player", nome: "Mario", cognome: "Atleta A", avatar_url: "https://example.com/avatar.png", role: null, jersey_number: null }]} />)
  const name = screen.getByText("Mario Atleta A")
  const row = name.closest("tr")!
  expect(row.querySelector('[data-slot="avatar"]')).toBeTruthy()
  expect(within(row).getByText("7,25").tagName).not.toBe("STRONG")
  expect(within(row).getAllByText("6,85").every((element) => element.tagName === "STRONG")).toBe(true)
  expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(14)
  fireEvent.change(screen.getByLabelText("Ordina per"), { target: { value: "name" } })
  expect(container.querySelector("tbody tr")?.children[2]).toHaveTextContent("Atleta B")
})
