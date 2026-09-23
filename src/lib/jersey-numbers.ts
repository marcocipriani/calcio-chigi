export const JERSEY_MIN = 1
export const JERSEY_MAX = 99
export const MAX_JERSEY_CHOICES = 5
export const MAX_AVOIDED_NUMBERS = 10

export type JerseyLevel = "PREFERRED" | "ACCEPTABLE"

export type JerseyChoice = {
  number: number
  level: JerseyLevel
}

export type JerseyPlayer = {
  membershipId: string
  name: string
  choices: JerseyChoice[]
  noPreference: boolean
  avoidNumbers: number[]
  previousNumber: number | null
}

export type JerseyAssignment = Record<string, number | null>

export type JerseyContender = {
  membershipId: string
  rank: number
  isReconfirmation: boolean
}

export type JerseyResolution = {
  winnerId: string
  // Chi rinuncia al numero e dove finisce nella proposta.
  fallbacks: Array<{
    membershipId: string
    number: number
    level: JerseyLevel
  }>
}

export type JerseyConflict = {
  number: number
  level: JerseyLevel
  contenders: JerseyContender[]
  resolutions: JerseyResolution[]
}

export type JerseyProposal = {
  assignment: JerseyAssignment
  conflicts: JerseyConflict[]
}

export const JERSEY_LEVEL_LABEL: Record<JerseyLevel, string> = {
  PREFERRED: "Preferito",
  ACCEPTABLE: "Accettabile",
}

export function isValidJerseyNumber(value: number) {
  return (
    Number.isInteger(value) && value >= JERSEY_MIN && value <= JERSEY_MAX
  )
}

/** Stesse regole di `save_jersey_preferences`: il primo errore o null. */
export function validateJerseyPreferences(
  choices: JerseyChoice[],
  avoidNumbers: number[],
  noPreference = false,
): string | null {
  if (noPreference) choices = []
  else if (choices.length < 1 || choices.length > MAX_JERSEY_CHOICES) {
    return `Indica da 1 a ${MAX_JERSEY_CHOICES} numeri`
  }
  const numbers = choices.map(({ number }) => number)
  if (![...numbers, ...avoidNumbers].every(isValidJerseyNumber)) {
    return `I numeri vanno da ${JERSEY_MIN} a ${JERSEY_MAX}`
  }
  const duplicate = numbers.find(
    (number, index) => numbers.indexOf(number) !== index,
  )
  if (duplicate !== undefined) {
    return `Il numero ${duplicate} è indicato più volte`
  }
  if (!noPreference && !choices.some(({ level }) => level === "PREFERRED")) {
    return "Serve almeno un numero preferito"
  }
  if (new Set(avoidNumbers).size > MAX_AVOIDED_NUMBERS) {
    return `Puoi escludere al massimo ${MAX_AVOIDED_NUMBERS} numeri`
  }
  if (avoidNumbers.some((number) => numbers.includes(number))) {
    return "Un numero scelto non può essere anche da evitare"
  }
  return null
}

export function parseJerseyChoices(value: unknown): JerseyChoice[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const { number, level } = item as Record<string, unknown>
    if (typeof number !== "number" || !isValidJerseyNumber(number)) return []
    if (level !== "PREFERRED" && level !== "ACCEPTABLE") return []
    return [{ number, level }]
  })
}

/**
 * Proposta automatica.
 *
 * 1. Un numero voluto come PREFERITO da più giocatori non va a nessuno: è un
 *    conflitto che decide il manager.
 * 2. Ogni giocatore riceve il primo preferito non conteso.
 * 3. Chi resta senza numero scende sugli accettabili liberi, in ordine; un
 *    accettabile voluto da più giocatori ancora senza numero è a sua volta un
 *    conflitto.
 *
 * 4. Chi non ha preferenze riceve il numero libero più basso che nessuno ha
 *    indicato, esclusi i suoi numeri da evitare.
 *
 * Per ogni conflitto la proposta indica le soluzioni praticabili: chi può
 * prendere il numero mentre gli altri restano sul loro ripiego.
 */
export function proposeJerseyAssignment(
  players: JerseyPlayer[],
): JerseyProposal {
  const assignment: JerseyAssignment = Object.fromEntries(
    players.map(({ membershipId }) => [membershipId, null]),
  )
  const assignedNumbers = new Set<number>()

  const preferredClaims = new Map<number, JerseyContender[]>()
  for (const player of players) {
    player.choices.forEach(({ number, level }, rank) => {
      if (level !== "PREFERRED") return
      preferredClaims.set(number, [
        ...(preferredClaims.get(number) ?? []),
        {
          membershipId: player.membershipId,
          rank,
          isReconfirmation: player.previousNumber === number,
        },
      ])
    })
  }
  const contestedPreferred = new Set(
    [...preferredClaims]
      .filter(([, claims]) => claims.length > 1)
      .map(([number]) => number),
  )

  for (const player of players) {
    const choice = player.choices.find(
      ({ number, level }) =>
        level === "PREFERRED" && !contestedPreferred.has(number),
    )
    if (!choice) continue
    assignment[player.membershipId] = choice.number
    assignedNumbers.add(choice.number)
  }

  // Gli accettabili si assegnano a giri: a ogni giro ogni giocatore ancora
  // senza numero punta al suo primo accettabile libero.
  const contestedAcceptable = new Map<number, JerseyContender[]>()
  for (;;) {
    const targets = new Map<number, JerseyContender[]>()
    for (const player of players) {
      if (assignment[player.membershipId] !== null) continue
      const rank = player.choices.findIndex(
        ({ number, level }) =>
          level === "ACCEPTABLE" &&
          !assignedNumbers.has(number) &&
          !contestedPreferred.has(number) &&
          !contestedAcceptable.has(number),
      )
      if (rank < 0) continue
      const { number } = player.choices[rank]
      targets.set(number, [
        ...(targets.get(number) ?? []),
        {
          membershipId: player.membershipId,
          rank,
          isReconfirmation: player.previousNumber === number,
        },
      ])
    }
    if (!targets.size) break

    for (const [number, claims] of targets) {
      if (claims.length === 1) {
        assignment[claims[0].membershipId] = number
        assignedNumbers.add(number)
      } else {
        contestedAcceptable.set(number, claims)
      }
    }
  }

  const chosenNumbers = new Set(
    players.flatMap(({ choices }) => choices.map(({ number }) => number)),
  )
  for (const player of players) {
    if (!player.noPreference || assignment[player.membershipId] !== null) {
      continue
    }
    // ponytail: scansione lineare 1-99, la rosa non arriva mai a cento
    for (let number = JERSEY_MIN; number <= JERSEY_MAX; number++) {
      if (
        assignedNumbers.has(number) ||
        chosenNumbers.has(number) ||
        player.avoidNumbers.includes(number)
      ) {
        continue
      }
      assignment[player.membershipId] = number
      assignedNumbers.add(number)
      break
    }
  }

  const playersById = new Map(
    players.map((player) => [player.membershipId, player]),
  )
  const conflicts: JerseyConflict[] = [
    ...[...contestedPreferred].map((number) => ({
      number,
      level: "PREFERRED" as const,
      contenders: preferredClaims.get(number) ?? [],
    })),
    ...[...contestedAcceptable].map(([number, contenders]) => ({
      number,
      level: "ACCEPTABLE" as const,
      contenders,
    })),
  ]
    .map((conflict) => ({
      ...conflict,
      resolutions: conflictResolutions(
        conflict.number,
        conflict.contenders,
        assignment,
        playersById,
      ),
    }))
    .sort((left, right) => left.number - right.number)

  return { assignment, conflicts }
}

function conflictResolutions(
  number: number,
  contenders: JerseyContender[],
  assignment: JerseyAssignment,
  playersById: Map<string, JerseyPlayer>,
): JerseyResolution[] {
  return contenders.flatMap(({ membershipId: winnerId }) => {
    const fallbacks = contenders
      .filter(({ membershipId }) => membershipId !== winnerId)
      .map(({ membershipId }) => {
        const fallback = assignment[membershipId]
        const choice = playersById
          .get(membershipId)
          ?.choices.find((candidate) => candidate.number === fallback)
        return fallback !== null && fallback !== number && choice
          ? { membershipId, number: fallback, level: choice.level }
          : null
      })
    if (fallbacks.some((fallback) => fallback === null)) return []
    return [
      {
        winnerId,
        fallbacks: fallbacks.filter(
          (fallback): fallback is NonNullable<typeof fallback> =>
            fallback !== null,
        ),
      },
    ]
  })
}

/** Applica una soluzione: il vincitore prende il numero, gli altri restano. */
export function applyJerseyResolution(
  assignment: JerseyAssignment,
  number: number,
  winnerId: string,
): JerseyAssignment {
  const next = { ...assignment }
  for (const [membershipId, assigned] of Object.entries(next)) {
    if (assigned === number) next[membershipId] = null
  }
  next[winnerId] = number
  return next
}

export type JerseyAssignmentIssue =
  | { kind: "DUPLICATE"; number: number; membershipIds: string[] }
  | { kind: "AVOIDED"; number: number; membershipId: string }
  | { kind: "UNASSIGNED"; membershipId: string }

/** Problemi di un'assegnazione modificata a mano, prima di pubblicarla. */
export function jerseyAssignmentIssues(
  players: JerseyPlayer[],
  assignment: JerseyAssignment,
): JerseyAssignmentIssue[] {
  const issues: JerseyAssignmentIssue[] = []
  const holders = new Map<number, string[]>()
  for (const player of players) {
    const number = assignment[player.membershipId] ?? null
    if (number === null) {
      issues.push({ kind: "UNASSIGNED", membershipId: player.membershipId })
      continue
    }
    holders.set(number, [...(holders.get(number) ?? []), player.membershipId])
    if (player.avoidNumbers.includes(number)) {
      issues.push({
        kind: "AVOIDED",
        number,
        membershipId: player.membershipId,
      })
    }
  }
  for (const [number, membershipIds] of holders) {
    if (membershipIds.length > 1) {
      issues.push({ kind: "DUPLICATE", number, membershipIds })
    }
  }
  return issues
}

/** Preferenze salvate dopo la pubblicazione della bozza. */
export function preferencesChangedAfterDraft(
  preferencesUpdatedAt: string | null,
  draftPublishedAt: string | null,
) {
  if (!preferencesUpdatedAt || !draftPublishedAt) return false
  return Date.parse(preferencesUpdatedAt) > Date.parse(draftPublishedAt)
}

/** Scelte iniziali del modulo: il numero dell'anno scorso come preferito. */
export function initialJerseyChoices(
  saved: JerseyChoice[],
  previousNumber: number | null,
): JerseyChoice[] {
  if (saved.length) return saved
  return previousNumber !== null && isValidJerseyNumber(previousNumber)
    ? [{ number: previousNumber, level: "PREFERRED" }]
    : []
}
