"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ClipboardList, LogIn } from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { PublicTeam } from "@/components/team/PublicTeam"
import { OfficialFormationCard } from "@/components/formations/OfficialFormationCard"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/layout/PageContainer"

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
  const { isAssociated, loading, user } = useAppSession()
  const [builderOpen, setBuilderOpen] = useState(false)

  return (
    <PageContainer contentClassName="mx-auto max-w-7xl space-y-5 pb-24">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
        Squadra
      </h1>
      <PublicTeam />
      {isAssociated && <OfficialFormationCard />}

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold">Formazioni</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAssociated
                ? "Crea una formazione personale o consulta quella ufficiale della prossima partita."
                : "Accedi con un profilo approvato per creare e vedere le formazioni."}
            </p>
          </div>
          {!loading &&
            (isAssociated ? (
              <Button onClick={() => setBuilderOpen((current) => !current)}>
                <ClipboardList aria-hidden="true" />
                {builderOpen ? "Chiudi campo" : "Crea formazione"}
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={user ? "/profilo" : "/login"}>
                  <LogIn aria-hidden="true" />
                  {user ? "Stato account" : "Accedi"}
                </Link>
              </Button>
            ))}
        </div>
      </section>

      {isAssociated && builderOpen && <FormationBuilder />}
    </PageContainer>
  )
}
