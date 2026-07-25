import type {
  AccountStatus,
  MedicalCertificateStatus,
  MembershipCategory,
  MembershipStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/lib/domain"

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
  updatedAt?: string
  accountStatus: AccountStatus
  associationRequestId?: string | null
  payments: ManagementPayment[]
  certificateStatus: MedicalCertificateStatus
  certificateId?: string | null
  certificateExpiresOn?: string | null
}

export type ManagementFilters = {
  query: string
  category: MembershipCategory | "ALL"
  status: MembershipStatus | "ALL"
  tag: "EXT" | "AGG" | "TRAINING" | "ALL"
}

export function filterManagementRows(
  people: ManagementPerson[],
  filters: ManagementFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase("it")

  return people.filter((person) => {
    if (
      query &&
      ![
        person.nome,
        person.cognome,
        person.phone,
        person.department,
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

    if (filters.category !== "ALL" && person.category !== filters.category) {
      return false
    }
    if (filters.status !== "ALL" && person.status !== filters.status) {
      return false
    }
    if (filters.tag === "EXT" && !person.isExternal) return false
    if (filters.tag === "AGG" && !person.isAggregated) return false
    if (filters.tag === "TRAINING" && !person.trainingOnly) return false
    return true
  })
}

export function managementKpis(people: ManagementPerson[]) {
  return {
    total: people.length,
    confirmationsPending: people.filter(
      ({ status }) => status === "PENDING" || status === "INTERESTED",
    ).length,
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
  }
}
