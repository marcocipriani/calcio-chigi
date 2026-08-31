import type {
  AccountStatus,
  MedicalCertificateStatus,
  MembershipCategory,
  MembershipStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/lib/domain"
import type { AttendanceSummary } from "@/lib/management-attendance"
import { romeDateKey } from "@/lib/season"

export type ManagementPayment = {
  id?: string
  status: PaymentStatus
  amountDue: number
  description?: string
  dueOn?: string | null
  method?: "CASH" | "BANK_TRANSFER" | null
}

export type ManagementPerson = {
  id: string
  profileId: string
  userId?: string | null
  nome: string
  cognome: string
  avatarUrl?: string | null
  birthDate?: string | null
  joinedOn?: string | null
  phone?: string | null
  operationalEmail?: string | null
  category: MembershipCategory
  status: MembershipStatus
  role?: string | null
  staffFunction?: string | null
  jerseyNumber?: number | null
  department?: string | null
  asiCardNumber?: string | null
  uniformSize?: string | null
  isExternal: boolean
  isAggregated: boolean
  trainingOnly: boolean
  operationalNotes?: string | null
  nextContactOn?: string | null
  registrationStatus: RegistrationStatus
  registrationCompletedOn?: string | null
  passportPhotoPath?: string | null
  isManager?: boolean
  profileUpdatedAt: string
  membershipUpdatedAt: string
  privateUpdatedAt?: string | null
  accountStatus: AccountStatus
  associationRequestId?: string | null
  payments: ManagementPayment[]
  certificateStatus: MedicalCertificateStatus
  certificateId?: string | null
  certificateExpiresOn?: string | null
  certificateVisitOn?: string | null
  certificateLaboratory?: string | null
  certificateDocumentPath?: string | null
  attendance?: AttendanceSummary
}

export function effectiveCertificateStatus(
  status: MedicalCertificateStatus,
  expiresOn: string | null | undefined,
  today = romeDateKey(new Date()),
): MedicalCertificateStatus {
  return status === "VALID" && expiresOn && expiresOn < today
    ? "EXPIRED"
    : status
}

export type ManagementFilters = {
  query: string
  /** true = mostra solo gli archiviati (elenco separato). */
  archived?: boolean
}

export function filterManagementRows(
  people: ManagementPerson[],
  filters: ManagementFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase("it")

  return people.filter((person) => {
    if ((person.status === "NO") !== Boolean(filters.archived)) return false

    if (
      query &&
      ![
        person.nome,
        person.cognome,
        person.phone,
        person.role,
        person.staffFunction,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(query)
    ) {
      return false
    }

    return true
  })
}

export function managementKpis(allPeople: ManagementPerson[]) {
  const people = allPeople.filter(({ status }) => status !== "NO")

  return {
    total: people.length,
    registrationsOpen: people.filter(
      ({ registrationStatus }) => registrationStatus !== "ACTIVE",
    ).length,
    paymentsOpen: people.filter(({ payments }) =>
      payments.some(({ status }) => status !== "PAID"),
    ).length,
    certificatesOpen: people.filter(
      ({ category, certificateStatus }) =>
        category === "PLAYER" &&
        certificateStatus !== "VALID",
    ).length,
    accountsOpen: people.filter(
      ({ accountStatus }) => accountStatus !== "ACTIVE",
    ).length,
    archived: allPeople.length - people.length,
  }
}
