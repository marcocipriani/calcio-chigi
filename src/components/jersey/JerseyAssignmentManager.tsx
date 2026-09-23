"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Copy,
  History,
  RefreshCw,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { JerseyBoard, playerShortName } from "@/components/jersey/JerseyBoard"
import {
  formatJerseyTimestamp,
  JerseyDraftTable,
} from "@/components/jersey/JerseyDraftTable"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  confirmJerseyDraft,
  fetchJerseyBoard,
  fetchJerseyDraft,
  fetchJerseyPreferenceVersions,
  fetchSeasonAvoidedNumbers,
  publishJerseyDraft,
  sendJerseyPreferenceReminder,
  type JerseyBoardRow,
  type JerseyDraft,
  type JerseyPreferenceVersion,
} from "@/lib/jersey-api"
import {
  applyJerseyResolution,
  isValidJerseyNumber,
  JERSEY_LEVEL_LABEL,
  jerseyAssignmentIssues,
  preferencesChangedAfterDraft,
  proposeJerseyAssignment,
  type JerseyAssignment,
  type JerseyChoice,
  type JerseyPlayer,
} from "@/lib/jersey-numbers"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type ManagerData = {
  board: JerseyBoardRow[]
  draft: JerseyDraft | null
  avoided: Map<string, number[]>
  versions: JerseyPreferenceVersion[]
}

type PendingAction = "PUBLISH" | "CONFIRM" | null

/** La bozza copre la rosa attuale con gli stessi numeri dell'editor. */
function matchesDraft(assignment: JerseyAssignment, draft: JerseyAssignment) {
  return Object.entries(assignment).every(
    ([membershipId, number]) =>
      membershipId in draft && draft[membershipId] === number,
  )
}

function ChoiceChips({
  choices,
  noPreference,
  avoidNumbers,
}: {
  choices: JerseyChoice[]
  noPreference: boolean
  avoidNumbers: number[]
}) {
  if (!choices.length && !noPreference) {
    return (
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        Non ha ancora scelto
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1">
      {noPreference && (
        <span className="text-xs font-semibold text-muted-foreground">
          Nessuna preferenza: numero libero più basso
        </span>
      )}
      {choices.map(({ number, level }, rank) => (
        <span
          className={cn(
            "rounded-full border px-1.5 text-xs tabular-nums",
            level === "PREFERRED"
              ? "border-violet-300 bg-violet-50 font-bold text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
              : "text-muted-foreground",
          )}
          key={number}
          title={`${rank + 1}ª scelta · ${JERSEY_LEVEL_LABEL[level]}`}
        >
          {number}
        </span>
      ))}
      {avoidNumbers.map((number) => (
        <span
          className="rounded-full border border-dashed px-1.5 text-xs text-muted-foreground line-through tabular-nums"
          key={`avoid-${number}`}
          title="Da evitare"
        >
          {number}
        </span>
      ))}
    </span>
  )
}

export function JerseyAssignmentManager() {
  const { isManager, loading: sessionLoading, targetSeason, user } =
    useAppSession()
  const [data, setData] = useState<ManagerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assignment, setAssignment] = useState<JerseyAssignment>({})
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  const seasonId = targetSeason?.id

  const load = useCallback(async () => {
    if (!seasonId) return
    try {
      const [board, draft] = await Promise.all([
        fetchJerseyBoard(supabaseBrowser, seasonId),
        fetchJerseyDraft(supabaseBrowser, seasonId),
      ])
      const membershipIds = board.map(({ membershipId }) => membershipId)
      const [avoided, versions] = await Promise.all([
        fetchSeasonAvoidedNumbers(supabaseBrowser, membershipIds),
        fetchJerseyPreferenceVersions(supabaseBrowser, membershipIds),
      ])
      setData({ board, draft, avoided, versions })
      setError(null)
    } catch {
      setError("Impossibile caricare le preferenze di maglia.")
    }
  }, [seasonId])

  const players = useMemo<JerseyPlayer[]>(
    () =>
      (data?.board ?? []).map((row) => ({
        membershipId: row.membershipId,
        name: `${row.nome} ${row.cognome}`,
        choices: row.choices,
        noPreference: row.noPreference,
        avoidNumbers: data?.avoided.get(row.membershipId) ?? [],
        previousNumber: row.previousJerseyNumber,
      })),
    [data],
  )
  const proposal = useMemo(() => proposeJerseyAssignment(players), [players])

  useEffect(() => {
    if (sessionLoading || !isManager) return
    void load()
  }, [isManager, load, sessionLoading])

  // Si parte dalla bozza pubblicata; chi non c'è ancora riceve la proposta.
  useEffect(() => {
    if (!data) return
    setAssignment(
      Object.fromEntries(
        players.map(({ membershipId }) => [
          membershipId,
          data.draft && membershipId in data.draft.assignment
            ? data.draft.assignment[membershipId]
            : proposal.assignment[membershipId],
        ]),
      ),
    )
  }, [data, players, proposal])

  if (sessionLoading || (isManager && !data && !error)) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (!user || !isManager) {
    return (
      <div className="rounded-lg border p-6 text-center" role="alert">
        <p className="text-sm font-semibold">Area riservata ai manager.</p>
      </div>
    )
  }

  if (error || !data || !targetSeason) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
        role="alert"
      >
        <p className="text-sm font-semibold">
          {error ?? "Nessuna stagione disponibile."}
        </p>
        <Button
          className="mt-3"
          onClick={() => void load()}
          size="sm"
          variant="outline"
        >
          Riprova
        </Button>
      </div>
    )
  }

  const rowsById = new Map(data.board.map((row) => [row.membershipId, row]))
  const nameOf = (membershipId: string) => {
    const row = rowsById.get(membershipId)
    return row ? playerShortName(row) : "?"
  }
  const issues = jerseyAssignmentIssues(players, assignment)
  const duplicateNumbers = new Set(
    issues.flatMap((issue) => (issue.kind === "DUPLICATE" ? [issue.number] : [])),
  )
  const unassigned = issues.filter(({ kind }) => kind === "UNASSIGNED").length
  const missing = data.board.filter(({ updatedAt }) => !updatedAt)
  const closed = Boolean(data.draft?.confirmedAt)
  const changedAfterDraft = data.board.filter(({ updatedAt }) =>
    preferencesChangedAfterDraft(updatedAt, data.draft?.publishedAt ?? null),
  )
  const unpublishedChanges =
    !data.draft || !matchesDraft(assignment, data.draft.assignment)
  const canConfirm =
    Boolean(data.draft) && !unpublishedChanges && !data.draft?.confirmedAt
  const versionsByMembership = new Map<string, JerseyPreferenceVersion[]>()
  for (const version of data.versions) {
    versionsByMembership.set(version.membershipId, [
      ...(versionsByMembership.get(version.membershipId) ?? []),
      version,
    ])
  }

  function setNumber(membershipId: string, value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 2)
    const number = Number(digits)
    setAssignment((current) => ({
      ...current,
      [membershipId]: digits && isValidJerseyNumber(number) ? number : null,
    }))
  }

  async function runPending() {
    if (!seasonId || !pending) return
    setBusy(true)
    try {
      if (pending === "PUBLISH") {
        await publishJerseyDraft(supabaseBrowser, seasonId, assignment)
        toast.success("Bozza pubblicata e notificata alla squadra")
      } else {
        await confirmJerseyDraft(supabaseBrowser, seasonId)
        toast.success("Numeri di maglia assegnati")
      }
      await load()
    } catch (actionError) {
      toast.error(
        pending === "PUBLISH" ? "Bozza non pubblicata" : "Numeri non assegnati",
        {
          description:
            actionError instanceof Error ? actionError.message : undefined,
        },
      )
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  async function remind() {
    if (!seasonId) return
    setBusy(true)
    try {
      const sent = await sendJerseyPreferenceReminder(supabaseBrowser, seasonId)
      if (sent) toast.success(`Promemoria inviato a ${sent} giocatori`)
      else toast.info("Nessun giocatore con account da sollecitare")
    } catch (remindError) {
      toast.error("Promemoria non inviato", {
        description:
          remindError instanceof Error ? remindError.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyWhatsAppMessage() {
    const message = [
      `⚽ Numeri di maglia ${targetSeason?.name ?? ""}`.trim(),
      "",
      `Indicate in app i numeri che preferite (fino a 5, in ordine) oppure che non avete preferenze: ${window.location.origin}/maglie`,
      "Prima dell'assegnazione pubblicheremo il riepilogo.",
      "",
      `Mancano ancora: ${missing.map(playerShortName).join(", ")}`,
    ].join("\n")
    try {
      await navigator.clipboard.writeText(message)
      toast.success("Messaggio copiato")
    } catch {
      toast.error("Copia non riuscita")
    }
  }

  return (
    <div className="space-y-4">
      <PageTitleBar
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/gestione">
              <ArrowLeft aria-hidden="true" />
              Gestione
            </Link>
          </Button>
        }
        subtitle={targetSeason.name}
        title="Numeri di maglia"
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [
            "Hanno scelto",
            `${data.board.length - missing.length}/${data.board.length}`,
          ],
          ["Conflitti", proposal.conflicts.length],
          ["Senza numero", unassigned],
          ["Modificate dopo la bozza", changedAfterDraft.length],
        ].map(([label, value]) => (
          <div className="rounded-lg border bg-card p-3" key={label}>
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
              {label}
            </dt>
            <dd className="text-2xl font-black tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {!closed && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Chi deve ancora scegliere</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {missing.length
                ? missing.map(playerShortName).join(", ")
                : "Tutti i giocatori in rosa hanno indicato le preferenze."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !missing.length}
                onClick={() => void remind()}
                size="sm"
                variant="outline"
              >
                <BellRing aria-hidden="true" />
                Invia notifica ai mancanti
              </Button>
              <Button
                disabled={!missing.length}
                onClick={() => void copyWhatsAppMessage()}
                size="sm"
                variant="outline"
              >
                <Copy aria-hidden="true" />
                Copia messaggio WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {proposal.conflicts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle
                aria-hidden="true"
                className="size-5 text-amber-600"
              />
              Conflitti da decidere
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {proposal.conflicts.map((conflict) => (
              <div
                className="rounded-lg border p-3"
                key={`${conflict.level}-${conflict.number}`}
              >
                <p className="text-sm">
                  <strong className="text-lg font-black">
                    #{conflict.number}
                  </strong>{" "}
                  {conflict.level === "PREFERRED"
                    ? "preferito da"
                    : "accettabile per"}{" "}
                  {conflict.contenders
                    .map(
                      ({ membershipId, rank, isReconfirmation }) =>
                        `${nameOf(membershipId)} (${rank + 1}ª${
                          isReconfirmation ? ", possibile riconferma" : ""
                        })`,
                    )
                    .join(", ")}
                </p>
                {conflict.contenders.some(
                  ({ isReconfirmation }) => isReconfirmation,
                ) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chi lo aveva la scorsa stagione potrebbe vincere per
                    riconferma: decidi tu.
                  </p>
                )}
                {conflict.resolutions.length ? (
                  <div className="mt-2 grid gap-1.5">
                    {conflict.resolutions.map((resolution) => (
                      <Button
                        className="h-auto min-h-10 justify-start whitespace-normal text-left"
                        key={resolution.winnerId}
                        onClick={() =>
                          setAssignment((current) =>
                            applyJerseyResolution(
                              current,
                              conflict.number,
                              resolution.winnerId,
                            ),
                          )
                        }
                        size="sm"
                        variant="outline"
                      >
                        <span>
                          <strong>
                            #{conflict.number} a {nameOf(resolution.winnerId)}
                          </strong>
                          {resolution.fallbacks.map((fallback) => (
                            <span
                              className="block text-xs font-normal text-muted-foreground"
                              key={fallback.membershipId}
                            >
                              {nameOf(fallback.membershipId)} resta sul{" "}
                              {fallback.number} (
                              {JERSEY_LEVEL_LABEL[fallback.level].toLowerCase()})
                            </span>
                          ))}
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Nessuna soluzione con gli accettabili indicati: assegna a
                    mano o chiedi ai giocatori di accordarsi.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-2 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Assegnazione</CardTitle>
            <Button
              onClick={() => setAssignment(proposal.assignment)}
              size="sm"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" />
              Rigenera proposta
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.draft
              ? data.draft.confirmedAt
                ? `Numeri definitivi dal ${formatJerseyTimestamp(data.draft.confirmedAt)}.`
                : `Bozza pubblicata il ${formatJerseyTimestamp(data.draft.publishedAt)}.`
              : "Nessuna bozza pubblicata."}{" "}
            {unpublishedChanges &&
              "Ci sono modifiche non pubblicate: per renderle definitive vanno prima pubblicate."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y rounded-lg border">
            {data.board.map((row) => {
              const number = assignment[row.membershipId] ?? null
              const avoidNumbers = data.avoided.get(row.membershipId) ?? []
              const versions = versionsByMembership.get(row.membershipId) ?? []
              const changed = changedAfterDraft.includes(row)
              const avoidedPick = number !== null && avoidNumbers.includes(number)
              return (
                <li className="p-2.5" key={row.membershipId}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Input
                      aria-invalid={
                        avoidedPick ||
                        (number !== null && duplicateNumbers.has(number))
                      }
                      aria-label={`Numero di ${row.nome} ${row.cognome}`}
                      className="h-10 w-16 shrink-0 text-center text-base font-black tabular-nums"
                      inputMode="numeric"
                      onChange={(event) =>
                        setNumber(row.membershipId, event.target.value)
                      }
                      placeholder="—"
                      value={number ?? ""}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                        {row.nome} {row.cognome}
                        {row.previousJerseyNumber !== null && (
                          <Badge variant="outline">
                            anno scorso #{row.previousJerseyNumber}
                          </Badge>
                        )}
                        {changed && (
                          <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            Modificate dopo la bozza
                          </Badge>
                        )}
                      </p>
                      <div className="mt-1">
                        <ChoiceChips
                          avoidNumbers={avoidNumbers}
                          choices={row.choices}
                          noPreference={row.noPreference}
                        />
                      </div>
                      {row.updatedAt && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Ultimo aggiornamento:{" "}
                          {formatJerseyTimestamp(row.updatedAt)}
                        </p>
                      )}
                    </div>
                    {versions.length > 0 && (
                      <Button
                        aria-expanded={openHistory === row.membershipId}
                        onClick={() =>
                          setOpenHistory((current) =>
                            current === row.membershipId
                              ? null
                              : row.membershipId,
                          )
                        }
                        size="sm"
                        variant="ghost"
                      >
                        <History aria-hidden="true" />
                        {versions.length}
                        <span className="sr-only">versioni giornaliere</span>
                      </Button>
                    )}
                  </div>
                  {(avoidedPick ||
                    (number !== null && duplicateNumbers.has(number))) && (
                    <p className="mt-1 text-xs font-semibold text-destructive">
                      {avoidedPick
                        ? `Il ${number} è tra i numeri da evitare.`
                        : `Il ${number} è assegnato a più giocatori.`}
                    </p>
                  )}
                  {openHistory === row.membershipId && (
                    <ol className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                      {versions.map((version) => (
                        <li
                          className="flex flex-wrap items-center gap-2"
                          key={version.versionOn}
                        >
                          <span className="w-20 shrink-0 font-semibold tabular-nums">
                            {version.versionOn.split("-").reverse().join("/")}
                          </span>
                          <ChoiceChips
                            avoidNumbers={version.avoidNumbers}
                            choices={version.choices}
                            noPreference={version.noPreference}
                          />
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={busy || duplicateNumbers.size > 0 || !data.board.length}
              onClick={() => setPending("PUBLISH")}
              variant={canConfirm ? "outline" : "default"}
            >
              <Send aria-hidden="true" />
              {data.draft ? "Ripubblica bozza" : "Pubblica bozza"}
            </Button>
            <Button
              disabled={busy || !canConfirm}
              onClick={() => setPending("CONFIRM")}
            >
              <CheckCircle2 aria-hidden="true" />
              Rendi definitivi
            </Button>
          </div>
        </CardContent>
      </Card>

      {data.draft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Bozza visibile alla squadra</CardTitle>
          </CardHeader>
          <CardContent>
            <JerseyDraftTable draft={data.draft} rows={data.board} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Tabellone richieste</CardTitle>
        </CardHeader>
        <CardContent>
          <JerseyBoard rows={data.board} />
        </CardContent>
      </Card>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
        open={pending !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "PUBLISH"
                ? "Pubblicare la bozza?"
                : "Rendere definitivi i numeri?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "PUBLISH"
                ? `Tutti i giocatori vedranno il riepilogo in app e riceveranno una notifica.${
                    unassigned ? ` ${unassigned} giocatori restano senza numero.` : ""
                  }${closed ? " La scelta dei numeri si riapre finché non confermi di nuovo." : ""}`
                : "I numeri della bozza pubblicata diventano quelli ufficiali della stagione e compaiono in rosa, profilo e storico. I giocatori non potranno più modificare le preferenze."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void runPending()
              }}
            >
              {pending === "PUBLISH" ? "Pubblica" : "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
