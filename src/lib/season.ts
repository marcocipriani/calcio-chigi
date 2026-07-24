import type {
  MembershipStatus,
  Season,
  SeasonMembership,
} from "@/lib/domain"

export const SEASONS = [
  {
    slug: "2025-2026",
    name: "Stagione 2025–2026",
    starts_on: "2025-08-01",
    ends_on: "2026-07-31",
  },
  {
    slug: "2026-2027",
    name: "Stagione 2026–2027",
    starts_on: "2026-08-01",
    ends_on: "2027-07-31",
  },
] as const satisfies readonly Season[]

const ROME_TIME_ZONE = "Europe/Rome"

function datePartsAt(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  return Object.fromEntries(
    parts
      .filter(({ type }) => type === "year" || type === "month" || type === "day")
      .map(({ type, value }) => [type, value]),
  ) as Record<"year" | "month" | "day", string>
}

export function romeDateKey(date: Date) {
  const { year, month, day } = datePartsAt(date)
  return `${year}-${month}-${day}`
}

export function activeSeasonAt(date = new Date()): (typeof SEASONS)[number] {
  const key = romeDateKey(date)
  return (
    SEASONS.find(
      ({ starts_on, ends_on }) => key >= starts_on && key <= ends_on,
    ) ?? SEASONS.at(-1)!
  )
}

export type AgeBand = "UNDER_30" | "30_35" | "OVER_35" | "UNKNOWN"

export function ageBand(
  dateOfBirth: string | null | undefined,
  at = new Date(),
): AgeBand {
  if (!dateOfBirth) return "UNKNOWN"

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return "UNKNOWN"

  const [, birthYear, birthMonth, birthDay] = match
  const current = datePartsAt(at)
  let age = Number(current.year) - Number(birthYear)
  const birthdayPassed =
    current.month > birthMonth ||
    (current.month === birthMonth && current.day >= birthDay)

  if (!birthdayPassed) age -= 1
  if (age < 30) return "UNDER_30"
  if (age <= 35) return "30_35"
  return "OVER_35"
}

export function canJoinMatchFormation(
  membership: Pick<
    SeasonMembership,
    "category" | "status" | "training_only"
  >,
) {
  return (
    membership.category === "PLAYER" &&
    (membership.status === "YES" || membership.status === "MAYBE") &&
    !membership.training_only
  )
}

export function shouldPromptForSeasonConfirmation(
  status: MembershipStatus,
  lastRequestedAt: string | null | undefined,
  now = new Date(),
) {
  if (status !== "PENDING") return false
  if (!lastRequestedAt) return true

  const lastRequested = new Date(lastRequestedAt)
  if (Number.isNaN(lastRequested.getTime())) return true

  return romeDateKey(lastRequested) !== romeDateKey(now)
}
