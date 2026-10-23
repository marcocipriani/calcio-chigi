import type { SupabaseClient } from "@supabase/supabase-js"

export type PaymentMethod = "CASH" | "BANK_TRANSFER"
export type PaymentEntryStatus = "PENDING" | "VERIFIED" | "REJECTED"
export type CashRecipientGroup = "STAFF" | "MANAGER" | "PLAYER"

export type PaymentEntry = {
  id: string
  amount: number
  paidOn: string
  method: PaymentMethod
  cashRecipientId: string | null
  status: PaymentEntryStatus
  rejectionReason: string | null
}

export type CashRecipient = {
  id: string
  nome: string
  cognome: string
  group: CashRecipientGroup
}

export type PaymentSettings = { iban: string; holder: string }

/** Colonne dei versamenti da incorporare nella select di `payments`. */
export const PAYMENT_ENTRY_COLUMNS =
  "payment_entries(id, amount, paid_on, method, cash_recipient_id, status, rejection_reason, created_at)"

export const methodLabel: Record<PaymentMethod, string> = {
  CASH: "Contanti",
  BANK_TRANSFER: "Bonifico",
}

export const entryStatusLabel: Record<PaymentEntryStatus, string> = {
  PENDING: "Da verificare",
  VERIFIED: "Confermato",
  REJECTED: "Rifiutato",
}

export const recipientGroupLabel: Record<CashRecipientGroup, string> = {
  STAFF: "Staff",
  MANAGER: "Manager",
  PLAYER: "Calciatori",
}

export function toPaymentEntries(rows: unknown): PaymentEntry[] {
  return ((rows ?? []) as Record<string, unknown>[])
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      paidOn: String(row.paid_on),
      method: row.method as PaymentMethod,
      cashRecipientId: (row.cash_recipient_id as string | null) ?? null,
      status: row.status as PaymentEntryStatus,
      rejectionReason: (row.rejection_reason as string | null) ?? null,
    }))
}

/** Quanto resta da dichiarare: i versamenti rifiutati non contano. */
export function remainingAmount(amountDue: number, entries: PaymentEntry[]) {
  const committed = entries
    .filter(({ status }) => status !== "REJECTED")
    .reduce((sum, { amount }) => sum + amount, 0)
  return Math.max(0, Math.round((amountDue - committed) * 100) / 100)
}

export function paidAmount(entries: PaymentEntry[]) {
  return entries
    .filter(({ status }) => status === "VERIFIED")
    .reduce((sum, { amount }) => sum + amount, 0)
}

export function formatEuro(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" })
}

export async function fetchCashRecipients(
  client: SupabaseClient,
): Promise<CashRecipient[]> {
  const { data, error } = await client.rpc("payment_cash_recipients")
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    nome: String(row.nome),
    cognome: String(row.cognome),
    group: row.recipient_group as CashRecipientGroup,
  }))
}

export async function fetchPaymentSettings(
  client: SupabaseClient,
): Promise<PaymentSettings | null> {
  const { data, error } = await client
    .from("payment_settings")
    .select("iban, holder")
    .maybeSingle()
  if (error) throw error
  return data ? { iban: String(data.iban), holder: String(data.holder) } : null
}
