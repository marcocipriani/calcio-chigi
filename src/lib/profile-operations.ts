import type {
  MedicalCertificateStatus as CertificateStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/lib/domain"

export type { CertificateStatus, PaymentStatus, RegistrationStatus }

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

export function registrationStatusLabel(status: RegistrationStatus) {
  return {
    TODO: "Da fare",
    SUBMITTED: "In verifica",
    ACTIVE: "Tesserato",
  }[status]
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
