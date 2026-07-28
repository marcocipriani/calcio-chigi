"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { NextMatchSummary } from "@/components/formations/NextMatchCapsule"
import { fetchNextChigiMatch, fetchTeamLogoByName } from "@/lib/api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PublishedFormation = {
  id: string
  published_at: string
}

export function useNextMatchFormation(): {
  loading: boolean
  match: NextMatchSummary | null
  refresh: () => Promise<void>
} {
  const active = useRef(true)
  const [loading, setLoading] = useState(true)
  const [match, setMatch] = useState<NextMatchSummary | null>(null)

  const refresh = useCallback(async () => {
    if (!active.current) return
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

      const { data } = await supabaseBrowser
        .from("official_formations")
        .select("id,published_at")
        .eq("event_id", event.id)
        .eq("status", "PUBLISHED")
        .maybeSingle()
      if (!active.current) return

      const formation = data as PublishedFormation | null
      setMatch({
        id: event.id,
        opponent,
        opponentLogoUrl,
        startsAt: event.data_ora,
        publishedAt: formation?.published_at ?? null,
      })
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

  return { loading, match, refresh }
}
