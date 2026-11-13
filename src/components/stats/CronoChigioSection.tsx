"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CronoResultsTable } from "@/components/stats/CronoResultsTable"
import { Button } from "@/components/ui/button"
import { cronoNumber, CRONO_DISCLAIMER, type CronoResult } from "@/lib/crono-chigio"
import type { SeasonPlayerDirectoryEntry } from "@/lib/season-statistics"

export function CronoChigioSection({ players = [], fullPage = false }: { players?: SeasonPlayerDirectoryEntry[]; fullPage?: boolean }) {
  const [rows, setRows] = useState<CronoResult[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    fetch("/api/crono-chigio", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Caricamento non riuscito")
        return response.json() as Promise<CronoResult[]>
      })
      .then(setRows)
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [attempt])

  return <section aria-labelledby="crono-title" className="min-w-0 space-y-4">
    <div><h2 id="crono-title" className="font-bold">{fullPage ? "Test del 12 novembre 2026" : "CronoChigio"}</h2><p className="text-sm text-muted-foreground">Sei un Razzo o un Treno?</p></div>
    {failed ? <div role="alert" className="space-y-2 text-sm"><p>Impossibile caricare CronoChigio.</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}>Riprova</Button></div> : !rows ? <p role="status" className="text-sm text-muted-foreground">Caricamento tempi…</p> : <>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><p className="font-bold">{rows.length} partecipanti · 43,35 m · Due giri</p><p className="text-sm text-muted-foreground">12 novembre 2026 · Ore 21:30</p></div>
        <p className="text-sm text-muted-foreground">Romulea, San Giovanni, Roma · 20 °C · Nessuna pioggia durante il test · Campo bagnato</p>
        <div className="grid gap-2 sm:grid-cols-2">{(["first", "total"] as const).map((field, index) => {
          const time = rows.reduce((sum, row) => sum + row[field], 0) / (100 * rows.length)
          const speed = rows.reduce((sum, row) => sum + 43.35 / (row[field] / 100) * 3.6, 0) / rows.length
          return <p key={field} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">Media Giro {index + 1}: <b className="tabular-nums">{cronoNumber(time)} s</b> · <b className="tabular-nums">{cronoNumber(speed, 1)} km/h</b></p>
        })}</div>
        {!fullPage && <Button asChild variant="outline"><Link href="/crono-chigio">Vedi test completo</Link></Button>}
      </div>
      {fullPage && <>
        <CronoResultsTable rows={rows} players={players} />
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <h3 className="font-bold">Metodo e condizioni</h3>
          <p>Campo 105 × 67 m. Percorso di 43,35 m: dalla porta alla fine dell’area (16,50 m), poi al bordo vicino del cerchio di centrocampo (26,85 m). Velocità = distanza / tempo × 3,6. Dimensioni comunicate dall’organizzatore, senza rilievo indipendente.</p>
          <p>Profili relativi ai 14 partecipanti, solo sul Giro 2: si confronta il rapporto fra velocità media iniziale e lanciata con il rapporto di riferimento del gruppo, calcolato sui tempi medi dei tratti. Sopra il riferimento: Razzo; sotto o alla pari: Treno. Nessun arrotondamento intermedio. Profili e posizioni mantengono il riferimento all’intero gruppo anche quando filtri la tabella.</p>
          <p>Le medie del gruppo sono medie aritmetiche dei tempi e delle velocità individuali. Nel Giro 1 non sono stati rilevati intertempi.</p>
          <p>{CRONO_DISCLAIMER} I profili non sono misure dirette di accelerazione o velocità massima.</p>
        </div>
      </>}
    </>}
  </section>
}
