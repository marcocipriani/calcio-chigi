import type {
  AccountStatus,
  MedicalCertificateStatus,
  MembershipCategory,
  MembershipStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/lib/domain"
import type { Injury } from "@/lib/injuries"
import type { AttendanceSummary } from "@/lib/management-attendance"
import type { MembershipDocument } from "@/lib/membership-documents"
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
  documents?: MembershipDocument[]
  /** Storia infortuni, dal più recente. */
  injuries?: Injury[]
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

/** Solo allenamenti = giocatore senza tesseramento né certificato finché non entra in rosa. */
export type PersonGroup = "PLAYER" | "TRAINING_ONLY" | "STAFF"

export const PERSON_GROUPS: Array<{ id: PersonGroup; label: string }> = [
  { id: "PLAYER", label: "Giocatori" },
  { id: "TRAINING_ONLY", label: "Solo allenamenti" },
  { id: "STAFF", label: "Staff" },
]

export function personGroup({
  category,
  status,
}: Pick<ManagementPerson, "category" | "status">): PersonGroup {
  if (category === "STAFF") return "STAFF"
  return status === "TRAINING_ONLY" ? "TRAINING_ONLY" : "PLAYER"
}

/** Chi compare in ogni vista; assente = tutti. Lo staff non paga quote. */
export const VIEW_GROUPS: Partial<Record<string, PersonGroup[]>> = {
  ATTENDANCE: ["PLAYER", "TRAINING_ONLY"],
  PAYMENTS: ["PLAYER", "TRAINING_ONLY"],
  REGISTRATIONS: ["PLAYER", "STAFF"],
  CERTIFICATES: ["PLAYER"],
}

export function viewGroups(view: string): PersonGroup[] {
  return VIEW_GROUPS[view] ?? PERSON_GROUPS.map(({ id }) => id)
}

export type ManagementFilters = {
  query: string
  /** true = mostra solo gli archiviati (elenco separato). */
  archived?: boolean
  group?: PersonGroup
}

export function filterManagementRows(
  people: ManagementPerson[],
  filters: ManagementFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase("it")

  return people.filter((person) => {
    if ((person.status === "NO") !== Boolean(filters.archived)) return false
    if (filters.group && personGroup(person) !== filters.group) return false

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
  const inView = (view: string) =>
    people.filter((person) => viewGroups(view).includes(personGroup(person)))

  return {
    total: people.length,
    registrationsOpen: inView("REGISTRATIONS").filter(
      ({ registrationStatus }) => registrationStatus !== "ACTIVE",
    ).length,
    paymentsOpen: inView("PAYMENTS").filter(({ payments }) =>
      payments.some(({ status }) => status !== "PAID"),
    ).length,
    certificatesOpen: inView("CERTIFICATES").filter(
      ({ certificateStatus }) => certificateStatus !== "VALID",
    ).length,
    accountsOpen: people.filter(
      ({ accountStatus }) => accountStatus !== "ACTIVE",
    ).length,
    archived: allPeople.length - people.length,
  }
}
