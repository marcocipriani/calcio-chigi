import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import RegolamentoPage from "./page"

describe("RegolamentoPage", () => {
  it("mostra indice, testo e link al PDF", () => {
    render(<RegolamentoPage />)

    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/docs/regolamento-2026-2027.pdf",
    )
    expect(
      screen.getByRole("heading", { level: 2, name: "Art. 1 Organizzazione e scopo" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: "All. 1 Allegato n.1 – Arti&Mestieri" }),
    ).toBeInTheDocument()
  })

  it("cerca ignorando gli accenti ed evidenzia il testo originale", async () => {
    const { container } = render(<RegolamentoPage />)

    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca nel regolamento" }), {
      target: { value: "fuoriquota" },
    })

    expect(await screen.findByText(/sezioni contengono “fuoriquota”/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 2, name: /Coppe ed eventi sportivi/ })).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: /Adempimenti pre-gara/ })).toBeInTheDocument()
    // Il paragrafo sulle ammende resta sotto il proprio sottotitolo, non sotto "Art. 3 – Fuoriquota".
    expect(
      screen.getByRole("heading", { level: 3, name: "Art. 4 – Sanzioni Amministrative" }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "responsabilita" } })

    expect(
      await screen.findByRole("heading", { level: 2, name: /Responsabilità ed assicurazioni/ }),
    ).toBeInTheDocument()
    const marks = [...container.querySelectorAll("mark")].map((mark) => mark.textContent)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((text) => text?.toLowerCase() === "responsabilità")).toBe(true)

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "xyzxyz" } })
    expect(await screen.findByText("Nessun risultato per “xyzxyz”.")).toBeInTheDocument()
  })
})
