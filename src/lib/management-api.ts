import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  AccountStatus,
  MedicalCertificateStatus,
  MembershipCategory,
  MembershipStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/lib/domain"
import type {
  ManagementPayment,
  ManagementPerson,
} from "@/lib/management"

type UnknownRow = Record<string, unknown>

function asText(value: unknown) {
  return typeof value === "string" ? value : null
}

function groupBy<T extends UnknownRow>(rows: T[], key: keyof T) {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const value = String(row[key])
    grouped.set(value, [...(grouped.get(value) ?? []), row])
  }
  return grouped
}

export async function fetchManagementPeople(
  client: SupabaseClient,
  seasonSlug: string,
): Promise<ManagementPerson[]> {
  const { data: season, error: seasonError } = await client
    .from("seasons")
    .select("id")
    .eq("slug", seasonSlug)
    .single()
  if (seasonError) throw seasonError

  const { data: memberships, error: membershipsError } = await client
    .from("season_memberships")
    .select("*")
    .eq("season_id", season.id)
  if (membershipsError) throw membershipsError
  if (!memberships?.length) return []

  const membershipIds = memberships.map(({ id }) => id)
  const profileIds = memberships.map(({ profile_id }) => profile_id)

  const [
    { data: profiles, error: profilesError },
    { data: privateDetails, error: privateError },
    { data: payments, error: paymentsError },
    { data: certificates, error: certificatesError },
    { data: requests, error: requestsError },
  ] = await Promise.all([
    client.from("profiles").select("*").in("id", profileIds),
    client
      .from("profile_private_details")
      .select("profile_id, phone, operational_email")
      .in("profile_id", profileIds),
    client.from("payments").select("*").in("membership_id", membershipIds),
    client
      .from("medical_certificates")
      .select("*")
      .in("membership_id", membershipIds)
      .order("created_at", { ascending: false }),
    client
      .from("account_association_requests")
      .select("id, profile_id, status, requested_at")
      .in("profile_id", profileIds),
  ])

  const firstError = [
    profilesError,
    privateError,
    paymentsError,
    certificatesError,
    requestsError,
  ].find(Boolean)
  if (firstError) throw firstError

  const profilesById = new Map(
    ((profiles ?? []) as UnknownRow[]).map((row) => [String(row.id), row]),
  )
  const privateByProfile = new Map(
    ((privateDetails ?? []) as UnknownRow[]).map((row) => [
      String(row.profile_id),
      row,
    ]),
  )
  const paymentsByMembership = groupBy(
    (payments ?? []) as UnknownRow[],
    "membership_id",
  )
  const certificatesByMembership = groupBy(
    (certificates ?? []) as UnknownRow[],
    "membership_id",
  )
  const requestsByProfile = new Map(
    ((requests ?? []) as UnknownRow[]).map((row) => [
      String(row.profile_id),
      row,
    ]),
  )

  return (memberships as UnknownRow[])
    .map((membership): ManagementPerson | null => {
      const profileId = String(membership.profile_id)
      const profile = profilesById.get(profileId)
      if (!profile) return null
      const details = privateByProfile.get(profileId)
      const request = requestsByProfile.get(profileId)
      const latestCertificate =
        certificatesByMembership.get(String(membership.id))?.[0]
      const accountStatus: AccountStatus = profile.user_id
        ? "ACTIVE"
        : request?.status === "PENDING"
          ? "REQUESTED"
          : "NONE"

      return {
        id: String(membership.id),
        profileId,
        userId: asText(profile.user_id),
        nome: String(profile.nome),
        cognome: String(profile.cognome),
        avatarUrl: asText(profile.avatar_url),
        birthDate: asText(profile.data_nascita),
        joinedOn: asText(profile.joined_on),
        phone: asText(details?.phone),
        operationalEmail: asText(details?.operational_email),
        category: membership.category as MembershipCategory,
        status: membership.status as MembershipStatus,
        role: asText(membership.role),
        staffFunction: asText(membership.staff_function),
        jerseyNumber:
          typeof membership.jersey_number === "number"
            ? membership.jersey_number
            : null,
        department: asText(membership.department),
        asiCardNumber: asText(membership.asi_card_number),
        uniformSize: asText(membership.uniform_size),
        isExternal: Boolean(membership.is_external),
        isAggregated: Boolean(membership.is_aggregated),
        trainingOnly: Boolean(membership.training_only),
        operationalNotes: asText(membership.operational_notes),
        nextContactOn: asText(membership.next_contact_on),
        registrationStatus:
          membership.registration_status as RegistrationStatus,
        registrationCompletedOn: asText(
          membership.registration_completed_on,
        ),
        passportPhotoPath: asText(membership.passport_photo_path),
        isManager: Boolean(profile.is_manager),
        updatedAt: asText(membership.updated_at) ?? undefined,
        accountStatus,
        associationRequestId: request ? String(request.id) : null,
        payments: (paymentsByMembership.get(String(membership.id)) ?? []).map(
          (payment): ManagementPayment => ({
            id: String(payment.id),
            status: payment.status as PaymentStatus,
            amountDue: Number(payment.amount_due),
            description: String(payment.description),
            dueOn: asText(payment.due_on),
            method: (asText(payment.method) as ManagementPayment["method"]) ?? null,
          }),
        ),
        certificateStatus:
          (latestCertificate?.status as MedicalCertificateStatus) ?? "MISSING",
        certificateId: latestCertificate
          ? String(latestCertificate.id)
          : null,
        certificateExpiresOn: asText(latestCertificate?.expires_on),
      }
    })
    .filter((person): person is ManagementPerson => Boolean(person))
    .sort((left, right) =>
      `${left.cognome} ${left.nome}`.localeCompare(
        `${right.cognome} ${right.nome}`,
        "it",
      ),
    )
}

export async function createManagementPerson(
  client: SupabaseClient,
  input: {
    seasonSlug: string
    nome: string
    cognome: string
    category: MembershipCategory
    status: MembershipStatus
    phone?: string
    role?: string
    staffFunction?: string
    trainingOnly?: boolean
    joinedOn?: string
  },
) {
  const { error } = await client.rpc("manager_create_person", {
    p_season_slug: input.seasonSlug,
    p_nome: input.nome,
    p_cognome: input.cognome,
    p_category: input.category,
    p_status: input.status,
    p_phone: input.phone || null,
    p_role: input.role || null,
    p_staff_function: input.staffFunction || null,
    p_training_only: Boolean(input.trainingOnly),
    p_joined_on: input.joinedOn || null,
  })
  if (error) throw error
}
