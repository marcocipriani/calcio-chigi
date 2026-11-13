import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import rows from "@/test/fixtures/crono-chigio.json"
import { CronoChigioSection } from "./CronoChigioSection"

vi.mock("file-saver", () => ({ saveAs: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("shows only the summary and a separate test-page link on every device", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }))
  render(<CronoChigioSection />)
  expect(await screen.findByRole("link", { name: "Vedi test completo" })).toHaveAttribute("href", "/crono-chigio")
  expect(screen.getByText(/14 partecipanti/)).toBeInTheDocument()
  expect(screen.getByText(/12 novembre 2026 · Ore 21:30/)).toBeInTheDocument()
  expect(screen.getByText(/20 °C.*Campo bagnato/)).toBeInTheDocument()
  expect(screen.getByText("7,03 s")).toBeInTheDocument()
  expect(screen.getByText("7,10 s")).toBeInTheDocument()
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.queryByText(/Miglior tempo:|Riservato alla squadra|Immagini da condividere/)).not.toBeInTheDocument()
})
it("opens complete results and CSV export only on the dedicated page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }))
  render(<CronoChigioSection fullPage />)
  expect(await screen.findByRole("table")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeInTheDocument()
  expect(screen.queryByText(/Scarica immagine|Immagini da condividere|Riservato alla squadra/)).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "Vedi test completo" })).not.toBeInTheDocument()
})
it("shows an error without results on a forbidden response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  render(<CronoChigioSection />)
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile caricare CronoChigio")
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
})
