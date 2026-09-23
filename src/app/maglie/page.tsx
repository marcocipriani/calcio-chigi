"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Info, Settings2, Shirt, UsersRound } from "lucide-react"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchJerseyBoard,
  fetchJerseyDraft,
  fetchOwnJerseyPreferences,
  saveJerseyPreferences,
  type JerseyBoardRow,
  type JerseyDraft,
  type OwnJerseyPreferences,
} from "@/lib/jersey-api"
import { initialJerseyChoices } from "@/lib/jersey-numbers"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PageData = {
  board: JerseyBoardRow[]
  draft: JerseyDraft | null
  own: OwnJerseyPreferences | null
}

export default function JerseyNumbersPage() {
  const { replace } = useRouter()
  const {
    isAssociated,
    isManager,
    loading: sessionLoading,
    membership,
    targetSeason,
    user,
  } = useAppSession()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formVersion, setFormVersion] = useState(0)

  const seasonId = targetSeason?.id
  const ownMembershipId =
    membership?.category === "PLAYER" && membership.status === "YES"
      ? membership.id
      : null

  const load = useCallback(async () => {
    if (!seasonId) return
    try {
      const [board, draft, own] = await Promise.all([
        fetchJerseyBoard(supabaseBrowser, seasonId),
        fetchJerseyDraft(supabaseBrowser, seasonId),
        ownMembershipId
          ? fetchOwnJerseyPreferences(supabaseBrowser, ownMembershipId)
          : Promise.resolve(null),
      ])
      setData({ board, draft, own })
      setError(null)
    } catch {
      setError("Impossibile caricare i numeri di maglia.")
    }
  }, [ownMembershipId, seasonId])

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
              <Button asChild size="sm" variant="outline">
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

        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Come funziona</AlertTitle>
          <AlertDescription>
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
          </AlertDescription>
        </Alert>

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
