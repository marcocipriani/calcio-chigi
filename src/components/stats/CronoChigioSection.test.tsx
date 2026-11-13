import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import rows from "@/test/fixtures/crono-chigio.json"
import { CronoChigioSection } from "./CronoChigioSection"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("renders both images in start order, all profiles and the warmup note", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }))
  const { container } = render(<CronoChigioSection players={[]} />)
  await screen.findByRole("button", { name: "Scarica immagine 2 di 2" })
  const images = container.querySelectorAll("[data-crono-image]")
  expect(images).toHaveLength(2)
  for (const image of images) {
    expect(image).toHaveTextContent("7,03 s")
    expect(image).toHaveTextContent("7,10 s")
    expect(image).toHaveTextContent("22,4 km/h")
    expect(image).toHaveTextContent("22,1 km/h")
    expect(image).not.toHaveTextContent("Podio")
  }
  expect(images[0]).toHaveTextContent("Atleta A")
  expect(images[1]).toHaveTextContent("Atleta N*")
  expect(screen.getByLabelText("3° miglior tempo personale").closest("p")).toHaveTextContent("Atleta G")
  expect(screen.getByLabelText("1° miglior tempo personale").closest("p")).toHaveTextContent("Atleta I")
  expect(container.querySelectorAll('[aria-label="Treno"]')).toHaveLength(7)
  expect(container.querySelectorAll('[aria-label="Razzo"]')).toHaveLength(7)
  for (const image of images) expect(image).toHaveTextContent("riscaldamento incompleto")
})
it("shows an error without results on a forbidden response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  const { container } = render(<CronoChigioSection players={[]} />)
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile caricare CronoChigio")
  expect(container.querySelectorAll("[data-crono-image]")).toHaveLength(0)
})

it("expands the compact mobile section and links to the dedicated page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }))
  const { container } = render(<CronoChigioSection players={[]} />)
  const button = await screen.findByRole("button", { name: "Vedi completo" })
  expect(button).toHaveAttribute("aria-expanded", "false")
  expect(container.querySelector("#crono-complete")).toHaveClass("hidden", "lg:block")
  expect(screen.getByRole("link", { name: "Pagina del test" })).toHaveAttribute("href", "/crono-chigio")
  fireEvent.click(button)
  expect(button).toHaveAttribute("aria-expanded", "true")
  expect(container.querySelector("#crono-complete")).not.toHaveClass("hidden")
})
