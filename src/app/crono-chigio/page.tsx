"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAppSession } from "@/components/auth/AppSessionProvider"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { CronoChigioSection } from "@/components/stats/CronoChigioSection"
import { Button } from "@/components/ui/button"
import { fetchSeasonPlayerDirectory } from "@/lib/api"
import type { SeasonPlayerDirectoryEntry } from "@/lib/season-statistics"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

export default function CronoChigioPage() {
  const { isAssociated, loading } = useAppSession()
  const [players, setPlayers] = useState<SeasonPlayerDirectoryEntry[] | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  useEffect(() => {
    if (loading || !isAssociated) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabaseBrowser.from("seasons").select("id").eq("slug", "2026-2027").single()
        if (error || !data) throw new Error("Stagione non disponibile")
        const roster = await fetchSeasonPlayerDirectory(supabaseBrowser, data.id)
        if (active) setPlayers(roster)
      } catch {
        if (active) { setPlayers([]); setAvatarError(true) }
      }
    })()
    return () => { active = false }
  }, [isAssociated, loading])

  return <PageContainer contentClassName="space-y-5 pb-24">
    <PageTitleBar title="CronoChigio" subtitle="Tempi, velocità medie e profili del test" actions={<Button asChild variant="outline"><Link href="/statistiche">Statistiche</Link></Button>} />
    {loading ? <p role="status">Verifica accesso…</p> : !isAssociated ? <div className="space-y-3 rounded-xl border p-5"><p>Questo test è riservato ai membri attivi della squadra.</p><Button asChild><Link href="/login?next=%2Fcrono-chigio">Accedi</Link></Button></div> : players === null ? <p role="status">Caricamento squadra…</p> : <>
      {avatarError && <p role="status" className="text-sm text-muted-foreground">Avatar non disponibili: vengono mostrate le iniziali. Ricarica la pagina per riprovare.</p>}
      <CronoChigioSection players={players} fullPage />
    </>}
  </PageContainer>
}
