import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PassportPhotoPreview } from "@/components/management/PassportPhotoPreview"

describe("PassportPhotoPreview", () => {
  it("opens the private passport photo in a dialog", () => {
    render(
      <PassportPhotoPreview
        personName="Anna Rossi"
        signedUrl="https://signed.example/photo.jpg"
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
    render(<PassportPhotoPreview personName="Anna Rossi" signedUrl={undefined} />)

    expect(screen.getByText("Mancante")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "Apri fototessera di Anna Rossi",
      }),
    ).not.toBeInTheDocument()
  })
})
