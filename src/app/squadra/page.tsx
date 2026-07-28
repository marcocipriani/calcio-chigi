"use client"

import { useState } from "react"
import dynamic from "next/dynamic"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import type { FormationBuilderMode } from "@/components/formations/FormationBuilder"
import { useNextMatchFormation } from "@/components/formations/useNextMatchFormation"
import { PageContainer } from "@/components/layout/PageContainer"
import { PublicTeam } from "@/components/team/PublicTeam"
import { TeamTitleBar } from "@/components/team/TeamTitleBar"
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
  const { isManager } = useAppSession()
  const {
    error: matchError,
    loading: matchLoading,
    match,
    refresh: refreshNextMatch,
  } = useNextMatchFormation()
  const [builderMode, setBuilderMode] =
    useState<FormationBuilderMode | null>(null)

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
      <PublicTeam />

      {builderMode && (
        <FormationBuilder
          key={builderMode}
          mode={builderMode}
          onPublished={refreshNextMatch}
        />
      )}
    </PageContainer>
  )
}
