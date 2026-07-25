export type RegistrationStatus = "TODO" | "SUBMITTED" | "ACTIVE"
export type PaymentStatus = "DUE" | "PENDING_REVIEW" | "PAID"
export type CertificateStatus =
  | "MISSING"
  | "PENDING_REVIEW"
  | "VALID"
  | "REJECTED"
  | "EXPIRED"

export function canEditPassportPhoto(
  registrationStatus: RegistrationStatus,
  isManager: boolean,
  unlockedAt: string | null,
) {
  return (
    isManager ||
    registrationStatus !== "ACTIVE" ||
    unlockedAt !== null
  )
}

export function paymentStatusLabel(status: PaymentStatus) {
  return {
    DUE: "Da pagare",
    PENDING_REVIEW: "Da verificare",
    PAID: "Pagata",
  }[status]
}

export function certificateStatusLabel(status: CertificateStatus) {
  return {
    MISSING: "Mancante",
    PENDING_REVIEW: "Da verificare",
    VALID: "Valido",
    REJECTED: "Respinto",
    EXPIRED: "Scaduto",
  }[status]
}
