import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ColumnCustomizer } from "@/components/management/ColumnCustomizer"

describe("ColumnCustomizer", () => {
  it("hides optional columns while keeping the required person column", () => {
    const onChange = vi.fn()
    const onReset = vi.fn()

    render(
      <ColumnCustomizer
        availableColumns={[
          { id: "person", label: "Persona", required: true },
          { id: "phone", label: "Telefono" },
          { id: "account", label: "Account" },
        ]}
        columns={["person", "phone", "account"]}
        onChange={onChange}
        onReset={onReset}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Colonne" }))
    expect(screen.getByRole("checkbox", { name: "Persona" })).toBeDisabled()

    fireEvent.click(screen.getByRole("checkbox", { name: "Telefono" }))

    expect(onChange).toHaveBeenCalledWith(["person", "account"])
  })

  it("reorders visible columns and resets the view", () => {
    const onChange = vi.fn()
    const onReset = vi.fn()

    render(
      <ColumnCustomizer
        availableColumns={[
          { id: "person", label: "Persona", required: true },
          { id: "phone", label: "Telefono" },
          { id: "account", label: "Account" },
        ]}
        columns={["person", "phone", "account"]}
        onChange={onChange}
        onReset={onReset}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Colonne" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Sposta Account in alto" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Ripristina colonne" }))

    expect(onChange).toHaveBeenCalledWith(["person", "account", "phone"])
    expect(onReset).toHaveBeenCalledOnce()
  })
})
