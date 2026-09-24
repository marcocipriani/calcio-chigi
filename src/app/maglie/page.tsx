"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Info, Settings2, Shirt, UsersRound } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { JerseyBoard } from "@/components/jersey/JerseyBoard"
import {
  formatJerseyTimestamp,
  JerseyDraftTable,
} from "@/components/jersey/JerseyDraftTable"
import { JerseyPreferencesForm } from "@/components/jersey/JerseyPreferencesForm"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchJerseyBoard,
  fetchJerseyDraft,
  fetchOwnJerseyPreferences,
  fetchOwnUniformSize,
  saveJerseyPreferences,
  saveOwnUniformSize,
  type JerseyBoardRow,
  type JerseyDraft,
  type OwnJerseyPreferences,
  type OwnUniformSize,
} from "@/lib/jersey-api"
import { UNIFORM_SIZES } from "@/lib/domain"
import { initialJerseyChoices } from "@/lib/jersey-numbers"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PageData = {
  board: JerseyBoardRow[]
  draft: JerseyDraft | null
  own: OwnJerseyPreferences | null
  size: OwnUniformSize | null
}

export default function JerseyNumbersPage() {
  const { replace } = useRouter()
  const {
    isAssociated,
    isManager,
    loading: sessionLoading,
    membership,
    profile,
    targetSeason,
    user,
  } = useAppSession()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formVersion, setFormVersion] = useState(0)

  const seasonId = targetSeason?.id
  const profileId = profile?.id
  const ownMembershipId =
    membership?.category === "PLAYER" && membership.status === "YES"
      ? membership.id
      : null

  const load = useCallback(async () => {
    if (!seasonId) return
    try {
      const [board, draft, own, size] = await Promise.all([
        fetchJerseyBoard(supabaseBrowser, seasonId),
        fetchJerseyDraft(supabaseBrowser, seasonId),
        ownMembershipId
          ? fetchOwnJerseyPreferences(supabaseBrowser, ownMembershipId)
          : Promise.resolve(null),
        ownMembershipId && profileId
          ? fetchOwnUniformSize(supabaseBrowser, profileId, seasonId)
          : Promise.resolve(null),
      ])
      setData({ board, draft, own, size })
      setError(null)
    } catch {
      setError("Impossibile caricare i numeri di maglia.")
    }
  }, [ownMembershipId, profileId, seasonId])

  useEffect(() => {
    if (sessionLoading) return
    if (!user) {
      replace("/login")
      return
    }
    if (!isAssociated) {
      replace("/squadra")
      return
    }
    void load()
  }, [isAssociated, load, replace, sessionLoading, user])

  async function save(
    choices: Parameters<typeof saveJerseyPreferences>[2],
    avoidNumbers: number[],
    noPreference: boolean,
  ) {
    if (!seasonId) return
    try {
      await saveJerseyPreferences(
        supabaseBrowser,
        seasonId,
        choices,
        avoidNumbers,
        noPreference,
      )
      toast.success("Preferenze salvate")
      await load()
      setFormVersion((current) => current + 1)
    } catch (saveError) {
      toast.error("Preferenze non salvate", {
        description:
          saveError instanceof Error ? saveError.message : undefined,
      })
    }
  }

  if (error) {
    return (
      <PageContainer contentClassName="mx-auto max-w-3xl">
        <p className="py-10 text-center" role="alert">
          {error}
        </p>
      </PageContainer>
    )
  }

  if (sessionLoading || !data || !targetSeason) {
    return (
      <PageContainer contentClassName="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    )
  }

  const ownRow =
    data.board.find(({ membershipId }) => membershipId === ownMembershipId) ??
    null
  const previousNumber = ownRow?.previousJerseyNumber ?? null
  const initialChoices = initialJerseyChoices(
    data.own?.choices ?? [],
    previousNumber,
  )
  const closed = Boolean(data.draft?.confirmedAt)
  const confirmedNumber =
    data.draft?.confirmedAt && ownMembershipId
      ? (data.draft.assignment[ownMembershipId] ?? null)
      : null

  return (
    <PageContainer contentClassName="mx-auto max-w-3xl pb-24">
      <main className="space-y-4">
        <PageTitleBar
          actions={
            isManager ? (
              <Button
                asChild
                className="bg-operative text-operative-foreground hover:bg-operative/90"
                size="sm"
              >
                <Link href="/gestione/maglie">
                  <Settings2 aria-hidden="true" />
                  Assegna
                </Link>
              </Button>
            ) : undefined
          }
          subtitle={targetSeason.name}
          title="Numeri di maglia"
        />

        <details className="group rounded-lg border bg-card text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Info aria-hidden="true" className="size-4 text-muted-foreground" />
            Come funziona
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-2 px-4 pb-3 text-muted-foreground">
            <p>
              Indica i numeri che vorresti, in ordine, oppure scegli “Non ho
              preferenze”: riceverai il numero libero più basso che nessuno ha
              scelto. Prima dell’assegnazione definitiva il manager
              pubblicherà qui un riepilogo con i numeri proposti a tutti.
            </p>
            <p>
              Puoi modificare le preferenze finché il manager non rende
              definitivi i numeri, ad esempio dopo esserti accordato con un
              compagno: il manager vede le modifiche.
            </p>
          </div>
        </details>

        {data.draft && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shirt aria-hidden="true" className="size-5 text-primary" />
                {data.draft.confirmedAt
                  ? "Numeri assegnati"
                  : "Riepilogo proposto"}
              </CardTitle>
              {confirmedNumber !== null && (
                <p className="text-sm">
                  Il tuo numero è il{" "}
                  <strong className="text-lg font-black">
                    #{confirmedNumber}
                  </strong>
                </p>
              )}
            </CardHeader>
            <CardContent>
              <JerseyDraftTable
                draft={data.draft}
                highlightMembershipId={ownMembershipId}
                rows={data.board}
              />
            </CardContent>
          </Card>
        )}

        {ownMembershipId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Le tue preferenze</CardTitle>
              {data.own && (
                <p className="text-xs text-muted-foreground">
                  Ultimo salvataggio: {formatJerseyTimestamp(data.own.updatedAt)}
                </p>
              )}
              {ownRow?.updatedByManager && (
                <p className="rounded-md bg-operative/10 px-2 py-1.5 text-xs font-medium text-foreground">
                  Queste preferenze sono state inserite dal manager: controllale
                  e modificale se serve.
                </p>
              )}
            </CardHeader>
            <CardContent>
              {closed ? (
                <p className="text-sm text-muted-foreground">
                  La scelta dei numeri è conclusa: le preferenze non sono più
                  modificabili.
                </p>
              ) : (
                <JerseyPreferencesForm
                  initialAvoidNumbers={data.own?.avoidNumbers ?? []}
                  initialChoices={initialChoices}
                  initialNoPreference={data.own?.noPreference ?? false}
                  key={`${ownMembershipId}:${formVersion}`}
                  onSave={save}
                  others={data.board.filter(
                    ({ membershipId }) => membershipId !== ownMembershipId,
                  )}
                  suggestedFromPreviousSeason={
                    !data.own && initialChoices.length > 0
                  }
                />
              )}
            </CardContent>
          </Card>
        )}

        {ownMembershipId && data.size && (
          <UniformSizeCard
            closed={closed}
            key={data.size.current ?? ""}
            onSave={async (size) => {
              try {
                await saveOwnUniformSize(supabaseBrowser, ownMembershipId, size)
                toast.success("Taglia salvata")
                await load()
              } catch (saveError) {
                toast.error("Taglia non salvata", {
                  description:
                    saveError instanceof Error ? saveError.message : undefined,
                })
              }
            }}
            size={data.size}
          />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UsersRound aria-hidden="true" className="size-5 text-primary" />
              Scelte della squadra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JerseyBoard
              highlightMembershipId={ownMembershipId}
              rows={data.board}
            />
          </CardContent>
        </Card>
      </main>
    </PageContainer>
  )
}

function UniformSizeCard({
  closed,
  onSave,
  size,
}: {
  closed: boolean
  onSave: (size: string) => Promise<void>
  size: OwnUniformSize
}) {
  const [value, setValue] = useState(size.current ?? size.previous ?? "")
  const [busy, setBusy] = useState(false)
  const proposed = !size.current && Boolean(size.previous)
  const dirty = value !== (size.current ?? "")

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Taglia divisa</CardTitle>
      </CardHeader>
      <CardContent>
        {closed ? (
          <p className="text-sm text-muted-foreground">
            {size.current ? (
              <>
                La tua taglia è la{" "}
                <strong className="text-foreground">{size.current}</strong>.
              </>
            ) : (
              "Nessuna taglia indicata: chiedi a un manager."
            )}
          </p>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              await onSave(value)
              setBusy(false)
            }}
          >
            <select
              aria-label="Taglia divisa"
              className="h-10 w-28 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setValue(event.target.value)}
              value={value}
            >
              <option value="">—</option>
              {UNIFORM_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Button disabled={busy || !value || (!dirty && !proposed)} type="submit">
              {busy ? "Salvataggio…" : "Salva"}
            </Button>
            {proposed && (
              <p className="basis-full text-xs text-muted-foreground">
                Proposta dall’anno scorso: conferma con Salva.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  )
}
