"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
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
  const { isAssociated, isManager } = useAppSession()
  const {
    error: matchError,
    loading: matchLoading,
    match,
    refresh: refreshNextMatch,
  } = useNextMatchFormation()
  const [builderMode, setBuilderMode] =
    useState<FormationBuilderMode | null>(null)
  const builderRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!builderMode) return

    const builder = builderRef.current
    builder?.focus({ preventScroll: true })
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      builder?.scrollIntoView({ behavior: "smooth" })
    }
  }, [builderMode])

  return (
    <PageContainer contentClassName="mx-auto max-w-7xl space-y-5 pb-24">
      <TeamTitleBar
        isManager={isManager}
        match={match}
        matchError={matchError}
        matchLoading={matchLoading}
        onOpenOfficial={() => {
          if (isManager) setBuilderMode("OFFICIAL")
        }}
        onOpenPlayground={() => setBuilderMode("PLAYGROUND")}
      />

      {builderMode && (
        <section
          aria-label={
            builderMode === "PLAYGROUND"
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
            onClick={() => setBuilderMode(null)}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Chiudi
          </Button>
          <FormationBuilder
            key={builderMode}
            mode={builderMode}
            onPublished={refreshNextMatch}
          />
        </section>
      )}
      <PublicTeam canViewProfiles={isAssociated} />
    </PageContainer>
  )
}
