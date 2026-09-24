// 'YES' = in rosa, 'TRAINING_ONLY' = fa solo allenamenti (giocatore a tutti
// gli effetti ma senza tesseramento/numero), 'NO' = archiviato (sparito).
// Stati mutuamente esclusivi: non più un flag training_only combinabile.
export type MembershipStatus = "YES" | "TRAINING_ONLY" | "NO"

// Allineato al check constraint season_memberships_uniform_size_check.
export const UNIFORM_SIZES = ["S", "M", "L", "XL", "XXL"] as const

export type MembershipCategory = "PLAYER" | "STAFF"
export type RegistrationStatus = "TODO" | "SUBMITTED" | "ACTIVE"
export type PaymentStatus = "DUE" | "PENDING_REVIEW" | "PAID"
export type PaymentMethod = "CASH" | "BANK_TRANSFER"
export type MedicalCertificateStatus =
  | "MISSING"
  | "PENDING_REVIEW"
  | "VALID"
  | "REJECTED"
  | "EXPIRED"
export type EventCheckinStatus = "PRESENT" | "ABSENT"
export type AccountStatus = "NONE" | "REQUESTED" | "ACTIVE"

export interface Season {
  id?: string
  slug: string
  name: string
  starts_on: string
  ends_on: string
}

export interface SeasonMembership {
  id?: string
  profile_id?: string
  season_id?: string
  category: MembershipCategory
  status: MembershipStatus
  role?: string | null
  staff_function?: string | null
  jersey_number?: number | null
  uniform_size?: string | null
  asi_card_number?: string | null
  department?: string | null
  is_external?: boolean
  is_aggregated?: boolean
  operational_notes?: string | null
  next_contact_on?: string | null
  registration_status?: RegistrationStatus
  registration_completed_on?: string | null
  last_confirmation_requested_at?: string | null
  updated_at?: string
}

export interface PublicRosterMember {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  data_nascita: string | null
  role: string | null
  staff_function: string | null
  jersey_number: number | null
  category: MembershipCategory
  status: Extract<MembershipStatus, "YES">
}
