import type { EventRosterProfile } from "@/lib/api"

export type MatchPlayer = {
  id: string
  nome: string
  cognome: string
  avatarUrl: string | null
  role: string | null
  birthDate: string | null
  /** false per chi è in formazione ma non più in rosa: le sue statistiche non si salvano. */
  inRoster: boolean
}

const ROLE_SHORT: Record<string, string> = {
  PORTIERE: "POR",
  DIFENSORE: "DIF",
  CENTROCAMPISTA: "CEN",
  ATTACCANTE: "ATT",
}
const ROLE_ORDER = ["POR", "DIF", "CEN", "ATT"]

export const roleShort = (role: string | null | undefined) => ROLE_SHORT[role?.toUpperCase() ?? ""] ?? "—"

const roleRank = (role: string | null) => {
  const index = ROLE_ORDER.indexOf(roleShort(role))
  return index === -1 ? ROLE_ORDER.length : index
}

/** Panchina e liste: POR, DIF, CEN, ATT, poi per cognome. */
export const byRole = (left: MatchPlayer, right: MatchPlayer) =>
  roleRank(left.role) - roleRank(right.role) || left.cognome.localeCompare(right.cognome, "it")

/** Prima chi ha lo stesso ruolo, poi gli altri nell'ordine di panchina. */
export const sameRoleFirst = (role: string | null) => (left: MatchPlayer, right: MatchPlayer) =>
  Number(roleShort(right.role) === roleShort(role)) - Number(roleShort(left.role) === roleShort(role)) ||
  byRole(left, right)

export function toMatchPlayer(profile: EventRosterProfile): MatchPlayer {
  return {
    id: profile.id,
    nome: profile.nome,
    cognome: profile.cognome,
    avatarUrl: profile.avatar_url ?? null,
    role: profile.ruolo ?? null,
    birthDate: profile.data_nascita ?? null,
    inRoster: true,
  }
}
