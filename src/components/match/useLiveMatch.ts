"use client"

import { useCallback, useEffect, useState } from "react"

import type { MatchSession, TimelineEntry } from "@/lib/match"
import { fetchMatch } from "@/lib/match-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { useOnResume } from "@/lib/useOnResume"

type LiveMatch = {
  session: MatchSession | null
  timeline: TimelineEntry[]
  loaded: boolean
}

/** Sessione e cronaca di una partita, aggiornate in realtime. */
export function useLiveMatch(eventId: string | null) {
  const [state, setState] = useState<LiveMatch>({ session: null, timeline: [], loaded: false })

  const reload = useCallback(async () => {
    if (!eventId) return
    try {
      const { session, timeline } = await fetchMatch(supabaseBrowser, eventId)
      setState({ session, timeline, loaded: true })
    } catch {
      // Rete assente: resta l'ultimo stato, si riprova al prossimo cambio o al ritorno.
      setState((previous) => ({ ...previous, loaded: true }))
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    void reload()
    const filter = `event_id=eq.${eventId}`
    const channel = supabaseBrowser
      .channel(`match:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_sessions", filter }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "match_timeline", filter }, () => void reload())
      .subscribe()
    return () => {
      void supabaseBrowser.removeChannel(channel)
    }
  }, [eventId, reload])

  useOnResume(() => void reload())

  return { ...state, reload, setState }
}

/** Ora corrente che si aggiorna da sola, per minuti e conti alla rovescia. */
export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs])
  return now
}
