"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import type { FormationBuilderMode } from "@/components/formations/FormationBuilder"
import { useNextMatchFormation } from "@/components/formations/useNextMatchFormation"
import { PageContainer } from "@/components/layout/PageContainer"
import { PublicTeam } from "@/components/team/PublicTeam"
import { TeamTitleBar } from "@/components/team/TeamTitleBar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const FormationBuilder = dynamic(
  () =>
    import("@/components/formations/FormationBuilder").then(
      (module) => module.FormationBuilder,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="mt-5 h-[720px] w-full rounded-xl" />,
  },
)

export default function TeamPage() {
  // useSearchParams richiede un boundary Suspense per il prerender.
  return (
    <Suspense>
      <TeamPageContent />
    </Suspense>
  )
}

function TeamPageContent() {
  const { isAssociated, isManager } = useAppSession()
  const router = useRouter()
  // /squadra?formazione=<eventId>: link dalla pagina evento, apre la formazione ufficiale di quella partita.
  const searchParams = useSearchParams()
  const linkedEventId = isManager ? searchParams.get("formazione") : null
  const {
    error: matchError,
    loading: matchLoading,
    match,
    refresh: refreshNextMatch,
  } = useNextMatchFormation()
  const [builderMode, setBuilderMode] =
    useState<FormationBuilderMode | null>(null)
  const builderRef = useRef<HTMLElement>(null)
  // Una scelta esplicita (apri/chiudi) vince sul link e lo toglie dall'URL.
  const activeMode = builderMode ?? (linkedEventId ? "OFFICIAL" : null)
  const builderEventId = builderMode ? undefined : (linkedEventId ?? undefined)

  function chooseMode(mode: FormationBuilderMode | null) {
    setBuilderMode(mode)
    if (linkedEventId) router.replace("/squadra", { scroll: false })
  }

  useEffect(() => {
    if (!activeMode) return

    const builder = builderRef.current
    builder?.focus({ preventScroll: true })
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      builder?.scrollIntoView({ behavior: "smooth" })
    }
  }, [activeMode, builderEventId])

  return (
    <PageContainer contentClassName="mx-auto max-w-7xl space-y-5 pb-24">
      <TeamTitleBar
        isManager={isManager}
        match={match}
        matchError={matchError}
        matchLoading={matchLoading}
        onOpenOfficial={() => {
          if (isManager) chooseMode("OFFICIAL")
        }}
        onOpenPlayground={() => chooseMode("PLAYGROUND")}
      />

      {activeMode && (
        <section
          aria-label={
            activeMode === "PLAYGROUND"
              ? "Crea la tua formazione"
              : "Formazione ufficiale"
          }
          className="relative scroll-mt-20 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ref={builderRef}
          tabIndex={-1}
        >
          <Button
            aria-label="Chiudi formazione"
            className="absolute right-2 top-2 z-20"
            onClick={() => chooseMode(null)}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Chiudi
          </Button>
          <FormationBuilder
            eventId={builderEventId}
            key={`${activeMode}-${builderEventId ?? "next"}`}
            mode={activeMode}
            onPublished={async () => {
              await refreshNextMatch()
              // Aperta dal link della pagina evento: si torna lì a vedere la formazione.
              if (builderEventId) router.push(`/evento/${builderEventId}`)
            }}
          />
        </section>
      )}
      <PublicTeam canViewProfiles={isAssociated} />
    </PageContainer>
  )
}
