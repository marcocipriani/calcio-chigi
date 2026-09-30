import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  MembershipDocuments,
  PaymentReceipt,
  type MembershipDocumentsState,
} from "@/components/documents/MembershipDocuments"
import type { MembershipDocument } from "@/lib/membership-documents"

const storage = vi.hoisted(() => ({
  createSignedUrl: vi.fn().mockResolvedValue({
    data: { signedUrl: "https://signed.example/file" },
    error: null,
  }),
}))
vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: { storage: { from: () => storage } },
}))

function doc(overrides: Partial<MembershipDocument>): MembershipDocument {
  return {
    id: "doc-1",
    membershipId: "membership-1",
    kind: "IDENTITY",
    title: null,
    paymentId: null,
    path: "profile-1/membership-1/doc-1",
    contentType: "image/png",
    uploadedBy: "profile-1",
    ...overrides,
  }
}

function state(documents: MembershipDocument[]): MembershipDocumentsState {
  return {
    documents,
    busy: false,
    upload: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

describe("MembershipDocuments", () => {
  it("shows each slot as uploaded or missing and lets only the uploader delete", () => {
    render(
      <MembershipDocuments
        canDelete={({ uploadedBy }) => uploadedBy === "profile-1"}
        state={state([
          doc({}),
          doc({
            id: "doc-2",
            kind: "OTHER",
            title: "Liberatoria foto",
            uploadedBy: "manager-1",
          }),
        ])}
      />,
    )

    expect(screen.getByText("Caricato")).toBeVisible()
    expect(screen.getByText("Mancante")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Elimina Documento d’identità" }),
    ).toBeVisible()
    expect(screen.getByText("Liberatoria foto")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Elimina Liberatoria foto" }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText("Carica Modulo di iscrizione")).toBeEnabled()
  })

  it("needs a title before adding another document", () => {
    const current = state([])
    render(<MembershipDocuments canDelete={() => true} state={current} />)

    const input = screen.getByLabelText("Aggiungi documento")
    expect(input).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Titolo del nuovo documento"), {
      target: { value: "Liberatoria" },
    })
    expect(input).toBeEnabled()

    const file = new File(["x"], "doc.pdf", { type: "application/pdf" })
    fireEvent.change(input, { target: { files: [file] } })
    expect(current.upload).toHaveBeenCalledWith({
      kind: "OTHER",
      file,
      title: "Liberatoria",
    })
  })

  it("previews images inline and PDFs in the browser viewer", async () => {
    render(
      <>
        <MembershipDocuments
          canDelete={() => false}
          state={state([doc({})])}
        />
        <PaymentReceipt
          canDelete={() => false}
          paymentId="payment-1"
          state={state([
            doc({
              id: "doc-3",
              kind: "PAYMENT_RECEIPT",
              paymentId: "payment-1",
              contentType: "application/pdf",
            }),
          ])}
        />
      </>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Apri Documento d’identità" }),
    )
    expect(
      await screen.findByRole("img", { name: "Documento d’identità" }),
    ).toHaveAttribute("src", "https://signed.example/file")
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    })

    fireEvent.click(screen.getByRole("button", { name: "Apri Ricevuta" }))
    expect(await screen.findByTitle("Ricevuta")).toHaveAttribute(
      "src",
      "https://signed.example/file",
    )
  })
})
