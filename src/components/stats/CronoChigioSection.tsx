"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { CronoResultsTable } from "@/components/stats/CronoResultsTable"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cronoMetrics, cronoNumber, cronoRank, CRONO_DISCLAIMER, type CronoResult } from "@/lib/crono-chigio"
import type { SeasonPlayerDirectoryEntry } from "@/lib/season-statistics"

const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f'’\s-]/g, "").toLowerCase()

const medals = ["", "🥇", "🥈", "🥉"]

export function CronoInfographic({ rows, players, part }: {
  rows: CronoResult[]
  players: SeasonPlayerDirectoryEntry[]
  part: number
}) {
  const groupMeans = (["first", "total"] as const).map((field) => ({
    time: rows.reduce((sum, row) => sum + row[field], 0) / (100 * rows.length),
    speed: rows.reduce((sum, row) => sum + 43.35 / (row[field] / 100) * 3.6, 0) / rows.length,
  }))
  return (
    <div data-crono-image={part + 1} className="@container overflow-hidden rounded-xl border border-blue-200 bg-white text-slate-900">
      <header className="bg-blue-950 px-3 py-2 text-white">
        <p className="border-b border-blue-200/25 pb-1 text-right text-[10px] leading-tight font-semibold text-blue-200">Crono Chigio · novembre 2026 · {part + 1}/2</p>
        <h3 className="mt-1 text-[28px] leading-none font-black tracking-tight">CronoChigio</h3>
        <p className="text-sm leading-tight font-bold text-blue-100">Sei un Razzo o un Treno?</p>
        <p className="mt-1 text-xs leading-tight font-bold">Test di velocità sui 43,35 m</p>
        <p className="text-[10px] leading-tight text-blue-100">(Porta — 16,50 m — Fine area — 26,85 m — Bordo vicino del cerchio)</p>
        <div className="mt-1 text-[11px] leading-tight text-blue-100"><p><b className="text-white">Condizioni:</b> 12/11/2026 · 21:30 · Romulea, San Giovanni, Roma</p><p>20 °C · Non pioveva · Campo bagnato · 105 × 67 m</p></div>
      </header>
      <div className="border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-950">
        <p className="text-[10px] leading-tight font-bold uppercase tracking-wide">Medie del gruppo · 14 giocatori</p>
        <div className="grid grid-cols-2 gap-2">
          {groupMeans.map((mean, index) => <p key={index} className="text-xs leading-snug"><span className="font-bold">Giro {index + 1}</span> · <b className="text-[17px] tabular-nums">{cronoNumber(mean.time)} s</b> · <b className="text-[17px] tabular-nums">{cronoNumber(mean.speed, 1)} km/h</b></p>)}
        </div>
        <p className="text-[10px] leading-tight text-slate-600">Medie individuali · Medaglie sul miglior totale fra i due giri.</p>
      </div>
      <div className="px-3">
        {rows.slice(part * 7, part * 7 + 7).map((row, index) => {
          const metrics = cronoMetrics(row, rows)
          const rank = cronoRank(rows, row.total)
          const firstRank = cronoRank(rows, row.first, "first")
          const bestRank = cronoRank(rows, Math.min(row.first, row.total), "best")
          const matches = players.filter((p) => normalize(p.cognome) === normalize(row.name) && (!row.firstName || normalize(p.nome) === normalize(row.firstName)))
          const player = matches.length === 1 ? matches[0] : undefined
          const delta = `${metrics.delta > 0 ? "+" : metrics.delta < 0 ? "−" : ""}${cronoNumber(Math.abs(metrics.delta) / 100)}`
          return (
            <div key={row.name} className="border-b border-slate-200 py-2 last:border-0">
              <div className="grid grid-cols-[minmax(0,1fr)_78px_minmax(0,1fr)] items-start gap-x-1 @min-[500px]:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_68px_minmax(0,1fr)]">
                <div className="col-span-3 mb-1 flex min-w-0 items-center gap-1.5 @min-[500px]:col-span-1 @min-[500px]:row-span-2 @min-[500px]:mb-0 @min-[500px]:self-start">
                  <span className="w-3 shrink-0 text-[10px] text-slate-500">{part * 7 + index + 1}</span>
                  <Avatar className="size-12 border border-slate-200">
                    <AvatarImage src={player?.avatar_url ?? undefined} alt="" className="object-cover" />
                    <AvatarFallback className="bg-blue-100 text-sm text-blue-900">{row.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[20px] leading-tight font-extrabold tracking-tight">{row.name}{row.incompleteWarmup ? "*" : ""}{medals[bestRank] && <> <span role="img" aria-label={`${bestRank}° miglior tempo personale`}>{medals[bestRank]}</span></>}</p>
                    <p className="text-[13px] leading-snug text-slate-500">Giro 1: {firstRank}°</p>
                    <p className="text-[13px] leading-snug text-slate-500">Giro 2: {rank}° <span role="img" aria-label={metrics.emoji === "🚀" ? "Razzo" : "Treno"}>{metrics.emoji}</span></p>
                  </div>
                </div>
                <div className="text-center"><p className="text-[11px] font-bold text-slate-500">Giro 1 · s</p><p className="text-[34px] leading-tight font-bold tabular-nums tracking-tight">{cronoNumber(row.first / 100)}</p></div>
                <div aria-label={`Differenza ${delta} secondi`} className={`relative mt-7 flex h-6 items-center justify-center ${metrics.delta < 0 ? "text-emerald-700" : metrics.delta > 0 ? "text-red-700" : "text-slate-600"}`}>
                  <span aria-hidden="true" className="absolute left-[-12px] right-[-24px] top-1/2 border-t border-current" />
                  <span className="relative whitespace-nowrap bg-white px-0.5 text-[19px] leading-tight font-extrabold tabular-nums tracking-tight">{delta}<span className="text-[11px]"> s</span></span>
                </div>
                <div className="text-right"><p className="text-[11px] font-bold text-blue-900">Giro 2 · s</p><p className="text-[34px] leading-tight font-black tabular-nums tracking-tight text-blue-900">{cronoNumber(row.total / 100)}</p></div>
                <div className="col-start-1 mt-1 text-center text-[13px] leading-snug tabular-nums text-slate-600 [&_b]:text-[14px] @min-[500px]:col-start-2">
                  <p>Media <b className="text-slate-900">{cronoNumber(metrics.firstSpeed, 1)}</b> km/h</p>
                </div>
                <div className="col-span-2 col-start-2 mt-1 text-right text-[13px] leading-snug tabular-nums text-slate-600 [&_b]:text-[14px] @min-[500px]:col-start-3">
                  <p>Media <b className="text-blue-900">{cronoNumber(metrics.totalSpeed, 1)}</b> km/h</p>
                  <p>1° tratto <b className="text-slate-900">{cronoNumber(row.split / 100)} s</b> · <b>{cronoNumber(metrics.splitSpeed, 1)}</b> km/h</p>
                  <p>2° tratto <b className="text-slate-900">{cronoNumber(metrics.second / 100)} s</b> · <b>{cronoNumber(metrics.secondSpeed, 1)}</b> km/h</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <footer className="space-y-1 border-t border-blue-100 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
        <p><b>🚀 Razzo:</b> partenza relativamente più forte. <b>🚆 Treno:</b> tratto lanciato relativamente più forte (parità inclusa). Profili rispetto al gruppo, non misure dirette di accelerazione o velocità massima.</p>
        <p><b>* {rows.filter((row) => row.incompleteWarmup).map((row) => row.name).join(", ")}:</b> riscaldamento incompleto perché arrivato in ritardo.</p>
        <p>{CRONO_DISCLAIMER}</p>
      </footer>
    </div>
  )
}

export function CronoChigioSection({ players, fullPage = false }: { players: SeasonPlayerDirectoryEntry[]; fullPage?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [rows, setRows] = useState<CronoResult[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState<number | null>(null)
  const panels = useRef<(HTMLDivElement | null)[]>([])

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

  async function download(part: number) {
    const panel = panels.current[part]
    if (!panel) return
    setExporting(part)
    let clone: HTMLDivElement | undefined
    try {
      await document.fonts.ready
      const names = rows?.slice(part * 7, part * 7 + 7).map((row) => normalize(row.name)) ?? []
      await Promise.all(players.filter((player) => names.includes(normalize(player.cognome)) && player.avatar_url).map(async (player) => {
        const image = new Image()
        image.src = player.avatar_url!
        await image.decode().catch(() => undefined)
      }))
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const { toPng } = await import("html-to-image")
      clone = panel.cloneNode(true) as HTMLDivElement
      Object.assign(clone.style, { width: "540px", position: "fixed", left: "-10000px", top: "0" })
      document.body.appendChild(clone)
      const data = await toPng(clone, {
        pixelRatio: 2,
        style: { position: "static", left: "auto", top: "auto" },
        backgroundColor: "#ffffff",
      })
      const link = document.createElement("a")
      link.download = `CronoChigio-2026-11-12-${part + 1}.png`
      link.href = data
      link.click()
    } catch {
      toast.error("Impossibile creare l’immagine. Riprova.")
    } finally {
      clone?.remove()
      setExporting(null)
    }
  }

  return (
    <section aria-labelledby="crono-title" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="crono-title" className="font-bold">{fullPage ? "Test del 12 novembre 2026" : "CronoChigio"}</h2><p className="text-sm text-muted-foreground">Sei un Razzo o un Treno? · Riservato alla squadra</p></div>
        {!fullPage && <Button asChild variant="outline"><Link href="/crono-chigio">Pagina del test</Link></Button>}
      </div>
      {failed ? <div role="alert" className="space-y-2 text-sm"><p>Impossibile caricare CronoChigio.</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}>Riprova</Button></div> : !rows ? <p role="status" className="text-sm text-muted-foreground">Caricamento tempi…</p> : <>
        {!fullPage && <div className="space-y-3 rounded-xl border bg-card p-4 lg:hidden">
          <div><p className="font-bold">12 novembre 2026 · Romulea</p><p className="text-sm text-muted-foreground">{rows.length} giocatori · 43,35 m · Due giri</p></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>🚀 {rows.filter((row) => cronoMetrics(row, rows).emoji === "🚀").length} Razzo</span><span>🚆 {rows.filter((row) => cronoMetrics(row, rows).emoji === "🚆").length} Treno</span></div>
          <p className="text-sm">Miglior tempo: <b>{rows.reduce((best, row) => Math.min(row.first, row.total) < Math.min(best.first, best.total) ? row : best).name} · {cronoNumber(Math.min(...rows.map((row) => Math.min(row.first, row.total))) / 100)} s</b></p>
          <Button variant="outline" className="w-full" aria-expanded={expanded} aria-controls="crono-complete" onClick={() => setExpanded(!expanded)}>{expanded ? "Riduci" : "Vedi completo"}</Button>
        </div>}
        <div id="crono-complete" className={`space-y-5 ${!fullPage && !expanded ? "hidden lg:block" : ""}`}>
          <CronoResultsTable rows={rows} />
          <div>
            <h3 className="mb-2 font-bold">Immagini da condividere</h3>
            <p className="mb-3 text-xs text-muted-foreground">Ordine di partenza · Due immagini scaricabili. Chi riceve un’immagine può inoltrarla.</p>
            <div className="grid gap-4 xl:grid-cols-2">{[0, 1].map((part) => <div key={part} className="min-w-0 space-y-2">
              <div ref={(element) => { panels.current[part] = element }}><CronoInfographic rows={rows} players={players} part={part} /></div>
              <Button variant="outline" disabled={exporting !== null} onClick={() => download(part)}>{exporting === part ? "Creazione immagine…" : `Scarica immagine ${part + 1} di 2`}</Button>
            </div>)}</div>
          </div>
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <h3 className="font-bold">Metodo e condizioni</h3>
            <p>12 novembre 2026, ore 21:30 · Campo Romulea, San Giovanni, Roma · 105 × 67 m · 20 °C, nessuna pioggia durante il test, campo bagnato.</p>
            <p>43,35 m totali: dalla porta alla fine dell’area (16,50 m), poi al bordo vicino del cerchio di centrocampo (26,85 m). Velocità = distanza / tempo × 3,6. Dimensioni comunicate dall’organizzatore, senza rilievo indipendente.</p>
            <p>Profili relativi ai 14 partecipanti, solo sul Giro 2: si confronta il rapporto fra velocità media iniziale e lanciata con il rapporto di riferimento del gruppo, calcolato sui tempi medi dei tratti. Sopra il riferimento: Razzo; sotto o alla pari: Treno. Nessun arrotondamento intermedio. I profili restano riferiti all’intero gruppo anche quando filtri la tabella.</p>
            <p>Medaglie sul miglior totale personale fra i due giri, un posto per atleta. A parità di tempo si condivide la posizione. Le medie del gruppo sono medie aritmetiche dei tempi e delle velocità individuali.</p>
            <p>{CRONO_DISCLAIMER} I profili non sono misure dirette di accelerazione o velocità massima.</p>
          </div>
        </div>
      </>}
    </section>
  )
}
