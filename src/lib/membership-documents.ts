import type { SupabaseClient } from "@supabase/supabase-js"

export const DOCUMENT_BUCKET = "membership-documents"
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]

export type DocumentKind =
  | "IDENTITY"
  | "REGISTRATION_FORM"
  | "PAYMENT_RECEIPT"
  | "OTHER"

export type MembershipDocument = {
  id: string
  membershipId: string
  kind: DocumentKind
  title: string | null
  paymentId: string | null
  path: string
  contentType: string
  uploadedBy: string | null
}

export const documentKindLabel: Record<DocumentKind, string> = {
  IDENTITY: "Documento d’identità",
  REGISTRATION_FORM: "Modulo di iscrizione",
  PAYMENT_RECEIPT: "Ricevuta",
  OTHER: "Altro documento",
}

const COLUMNS =
  "id, membership_id, kind, title, payment_id, document_path, content_type, uploaded_by"

function toDocument(row: Record<string, unknown>): MembershipDocument {
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    kind: row.kind as DocumentKind,
    title: typeof row.title === "string" ? row.title : null,
    paymentId: typeof row.payment_id === "string" ? row.payment_id : null,
    path: String(row.document_path),
    contentType: String(row.content_type),
    uploadedBy: typeof row.uploaded_by === "string" ? row.uploaded_by : null,
  }
}

/** Messaggio se il file non è caricabile, altrimenti null. */
export function documentFileError(file: File) {
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) {
    return "Usa un PDF o un’immagine JPG, PNG o WebP"
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return "Il documento non può superare 10 MB"
  }
  return null
}

export async function fetchMembershipDocuments(
  client: SupabaseClient,
  membershipIds: string[],
): Promise<MembershipDocument[]> {
  if (!membershipIds.length) return []
  const { data, error } = await client
    .from("membership_documents")
    .select(COLUMNS)
    .in("membership_id", membershipIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(toDocument)
}

export async function uploadMembershipDocument(
  client: SupabaseClient,
  input: {
    profileId: string
    membershipId: string
    kind: DocumentKind
    file: File
    title?: string
    paymentId?: string
  },
): Promise<MembershipDocument> {
  const fileError = documentFileError(input.file)
  if (fileError) throw new Error(fileError)

  const id = crypto.randomUUID()
  const path = `${input.profileId}/${input.membershipId}/${id}`
  const { error: uploadError } = await client.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, input.file, { contentType: input.file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await client
    .from("membership_documents")
    .insert({
      id,
      membership_id: input.membershipId,
      kind: input.kind,
      title: input.kind === "OTHER" ? input.title?.trim() : null,
      payment_id: input.kind === "PAYMENT_RECEIPT" ? input.paymentId : null,
      document_path: path,
      content_type: input.file.type,
    })
    .select(COLUMNS)
    .single()
  if (error) {
    // Senza riga il file resterebbe orfano.
    await client.storage.from(DOCUMENT_BUCKET).remove([path])
    throw new Error(
      error.code === "23505"
        ? "Documento già presente, eliminalo prima di sostituirlo"
        : error.message,
    )
  }
  return toDocument(data as Record<string, unknown>)
}

/** Prima il file, poi la riga: se il file non si toglie, si può riprovare. */
export async function deleteMembershipDocument(
  client: SupabaseClient,
  document: Pick<MembershipDocument, "id" | "path">,
) {
  const { error: removeError } = await client.storage
    .from(DOCUMENT_BUCKET)
    .remove([document.path])
  if (removeError) throw new Error(removeError.message)

  const { error } = await client
    .from("membership_documents")
    .delete()
    .eq("id", document.id)
  if (error) throw new Error(error.message)
}
