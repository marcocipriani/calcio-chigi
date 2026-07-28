"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { NextMatchSummary } from "@/components/formations/NextMatchCapsule"
import { fetchNextChigiMatch, fetchTeamLogoByName } from "@/lib/api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PublishedFormation = {
  published_at: string
}

function normalizeError(cause: unknown) {
  if (cause instanceof Error) return cause
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return new Error(cause.message)
  }
  return new Error("Impossibile caricare la formazione ufficiale")
}

export function useNextMatchFormation(): {
  error: Error | null
  loading: boolean
  match: NextMatchSummary | null
  refresh: () => Promise<void>
} {
  const active = useRef(true)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [match, setMatch] = useState<NextMatchSummary | null>(null)

  const refresh = useCallback(async () => {
    if (!active.current) return
    setError(null)
    setLoading(true)

    try {
      const event = await fetchNextChigiMatch(supabaseBrowser)
      if (!active.current) return
      if (!event?.data_ora) {
        setMatch(null)
        return
      }

      const opponent =
        event.avversario ??
        (event.squadra_casa?.toLocaleLowerCase("it").includes("chigi")
          ? event.squadra_ospite
          : event.squadra_casa) ??
        "Avversario da definire"
      const opponentLogoUrl = await fetchTeamLogoByName(
        supabaseBrowser,
        opponent,
      )
      if (!active.current) return

      const { data, error: formationError } = await supabaseBrowser
        .from("public_published_formation_summaries")
        .select("published_at")
        .eq("event_id", event.id)
        .maybeSingle()
      if (!active.current) return
      if (formationError) throw formationError

      const formation = data as PublishedFormation | null
      setMatch({
        id: event.id,
        opponent,
        opponentLogoUrl,
        startsAt: event.data_ora,
        publishedAt: formation?.published_at ?? null,
      })
    } catch (cause) {
      if (!active.current) return
      setMatch(null)
      setError(normalizeError(cause))
    } finally {
      if (active.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    active.current = true
    void refresh()
    return () => {
      active.current = false
    }
  }, [refresh])

  return { error, loading, match, refresh }
}
