import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PassportPhotoPreview } from "@/components/management/PassportPhotoPreview"

describe("PassportPhotoPreview", () => {
  it("opens the private passport photo in a dialog", () => {
    render(
      <PassportPhotoPreview
        personName="Anna Rossi"
        state={{
          status: "ready",
          signedUrl: "https://signed.example/photo.jpg",
        }}
      />,
    )

    const trigger = screen.getByRole("button", {
      name: "Apri fototessera di Anna Rossi",
    })
    expect(within(trigger).getByRole("img")).toHaveAttribute(
      "src",
      "https://signed.example/photo.jpg",
    )

    fireEvent.click(trigger)

    expect(
      screen.getByRole("dialog", { name: "Fototessera di Anna Rossi" }),
    ).toBeVisible()
  })

  it("shows a missing state without a preview trigger", () => {
    render(
      <PassportPhotoPreview
        personName="Anna Rossi"
        state={{ status: "missing" }}
      />,
    )

    expect(screen.getByText("Mancante")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "Apri fototessera di Anna Rossi",
      }),
    ).not.toBeInTheDocument()
  })

  it("distinguishes loading from a missing photo", () => {
    render(
      <PassportPhotoPreview
        personName="Anna Rossi"
        state={{ status: "loading" }}
      />,
    )

    expect(screen.getByText("Caricamento…")).toBeVisible()
    expect(screen.queryByText("Mancante")).not.toBeInTheDocument()
  })

  it("shows an unavailable state without exposing a private path", () => {
    render(
      <PassportPhotoPreview
        personName="Anna Rossi"
        state={{ status: "unavailable" }}
      />,
    )

    expect(screen.getByText("Non disponibile")).toBeVisible()
    expect(screen.queryByText("photos/anna.jpg")).not.toBeInTheDocument()
  })
})
