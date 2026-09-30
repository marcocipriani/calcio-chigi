import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import {
  deleteMembershipDocument,
  documentFileError,
  uploadMembershipDocument,
} from "@/lib/membership-documents"

function stubClient({
  insertError = null,
  removeError = null,
}: {
  insertError?: { code?: string; message: string } | null
  removeError?: { message: string } | null
} = {}) {
  const calls: string[] = []
  const bucket = {
    upload: vi.fn(async (...args: unknown[]) => {
      calls.push("upload")
      void args
      return { error: null }
    }),
    remove: vi.fn(async (...args: unknown[]) => {
      calls.push("remove")
      void args
      return { error: removeError }
    }),
  }
  const single = vi.fn(async () => {
    calls.push("insert")
    return insertError
      ? { data: null, error: insertError }
      : {
          data: {
            id: "doc-1",
            membership_id: "membership-1",
            kind: "IDENTITY",
            title: null,
            payment_id: null,
            document_path: "profile-1/membership-1/doc-1",
            content_type: "application/pdf",
            uploaded_by: "profile-1",
          },
          error: null,
        }
  })
  const insert = vi.fn((row: Record<string, unknown>) => {
    void row
    return { select: () => ({ single }) }
  })
  const eq = vi.fn(async () => {
    calls.push("delete")
    return { error: null }
  })
  const client = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => ({ insert, delete: () => ({ eq }) })),
  } as unknown as SupabaseClient
  return { bucket, calls, client, insert }
}

const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" })

describe("membership documents", () => {
  it("rejects unsupported or oversized files before uploading", () => {
    expect(
      documentFileError(new File(["x"], "a.txt", { type: "text/plain" })),
    ).toMatch(/PDF/)
    const big = new File(["x"], "big.pdf", { type: "application/pdf" })
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 })
    expect(documentFileError(big)).toMatch(/10 MB/)
    expect(documentFileError(pdf)).toBeNull()
  })

  it("uploads the file under the owner's folder, then inserts the row", async () => {
    const { bucket, calls, client, insert } = stubClient()

    const document = await uploadMembershipDocument(client, {
      profileId: "profile-1",
      membershipId: "membership-1",
      kind: "IDENTITY",
      file: pdf,
      title: "ignored",
    })

    expect(calls).toEqual(["upload", "insert"])
    expect(bucket.upload.mock.calls[0][0]).toMatch(
      /^profile-1\/membership-1\/[0-9a-f-]{36}$/,
    )
    expect(insert.mock.calls[0][0]).toMatchObject({
      kind: "IDENTITY",
      title: null,
      payment_id: null,
    })
    expect(document.path).toBe("profile-1/membership-1/doc-1")
  })

  it("removes the uploaded file when the row is rejected", async () => {
    const { bucket, calls, client } = stubClient({
      insertError: { code: "23505", message: "duplicate key" },
    })

    await expect(
      uploadMembershipDocument(client, {
        profileId: "profile-1",
        membershipId: "membership-1",
        kind: "IDENTITY",
        file: pdf,
      }),
    ).rejects.toThrow("Documento già presente")

    expect(calls).toEqual(["upload", "insert", "remove"])
    expect(bucket.remove).toHaveBeenCalledWith([
      bucket.upload.mock.calls[0][0],
    ])
  })

  it("deletes the file before the row and keeps the row if the file stays", async () => {
    const ok = stubClient()
    await deleteMembershipDocument(ok.client, { id: "doc-1", path: "p/m/doc-1" })
    expect(ok.calls).toEqual(["remove", "delete"])

    const failing = stubClient({ removeError: { message: "denied" } })
    await expect(
      deleteMembershipDocument(failing.client, { id: "doc-1", path: "p/m/doc-1" }),
    ).rejects.toThrow("denied")
    expect(failing.calls).toEqual(["remove"])
  })
})
