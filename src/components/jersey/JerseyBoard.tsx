import { cn } from "@/lib/utils"
import type { JerseyBoardRow } from "@/lib/jersey-api"
import { JERSEY_LEVEL_LABEL, type JerseyLevel } from "@/lib/jersey-numbers"

type Claim = {
  membershipId: string
  name: string
  level: JerseyLevel
  rank: number
}

export function playerShortName({
  nome,
  cognome,
}: Pick<JerseyBoardRow, "nome" | "cognome">) {
  return `${nome} ${cognome.slice(0, 1)}.`.trim()
}

export function jerseyClaimsByNumber(rows: JerseyBoardRow[]) {
  const claims = new Map<number, Claim[]>()
  for (const row of rows) {
    row.choices.forEach(({ number, level }, rank) => {
      claims.set(number, [
        ...(claims.get(number) ?? []),
        {
          membershipId: row.membershipId,
          name: playerShortName(row),
          level,
          rank,
        },
      ])
    })
  }
  return new Map(
    [...claims].sort(([left], [right]) => left - right),
  )
}

/** Tabellone dei numeri richiesti: chi vuole cosa e con quale livello. */
export function JerseyBoard({
  rows,
  highlightMembershipId,
}: {
  rows: JerseyBoardRow[]
  highlightMembershipId?: string | null
}) {
  const claims = jerseyClaimsByNumber(rows)
  const missing = rows.filter(({ updatedAt }) => !updatedAt)
  const indifferent = rows.filter(({ noPreference }) => noPreference)

  return (
    <div className="space-y-3">
      {claims.size ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {[...claims].map(([number, numberClaims]) => {
            const contested =
              numberClaims.filter(({ level }) => level === "PREFERRED")
                .length > 1
            return (
              <li
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-2.5",
                  contested &&
                    "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
                )}
                key={number}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-lg font-black tabular-nums">
                  {number}
                </span>
                <div className="flex min-w-0 flex-wrap gap-1">
                  {numberClaims.map((claim) => (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                        claim.level === "PREFERRED"
                          ? "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                          : "text-muted-foreground",
                        claim.membershipId === highlightMembershipId &&
                          "ring-2 ring-violet-500",
                      )}
                      key={claim.membershipId}
                      title={`${claim.rank + 1}ª scelta · ${JERSEY_LEVEL_LABEL[claim.level]}`}
                    >
                      <span className="font-semibold">{claim.name}</span>
                      <span className="sr-only">
                        {`${claim.rank + 1}ª scelta, ${JERSEY_LEVEL_LABEL[claim.level]}`}
                      </span>
                      <span aria-hidden="true" className="tabular-nums">
                        {claim.rank + 1}ª
                      </span>
                    </span>
                  ))}
                  {contested && (
                    <span className="w-full text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      Conteso tra più preferiti
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nessuno ha ancora indicato i propri numeri.
        </p>
      )}

      {indifferent.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Nessuna preferenza ({indifferent.length}):
          </span>{" "}
          {indifferent.map(playerShortName).join(", ")}
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Devono ancora scegliere ({missing.length}):
          </span>{" "}
          {missing.map(playerShortName).join(", ")}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full border border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950" />
          Preferito
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full border" />
          Accettabile
        </span>
        <span>1ª, 2ª… = ordine di preferenza</span>
      </p>
    </div>
  )
}
