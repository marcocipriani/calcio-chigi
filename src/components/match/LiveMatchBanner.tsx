"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import type { MatchSession } from "@/lib/match"
import { fetchLiveSessions } from "@/lib/match-api"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { useOnResume } from "@/lib/useOnResume"

import { liveStatusText } from "./LiveMatchBlock"
import { useNow } from "./useLiveMatch"

type LiveMatchRow = { session: MatchSession; opponent: string }

/** In home, mentre si gioca: risultato e minuto con il link alla diretta. */
export function LiveMatchBanner() {
  const [matches, setMatches] = useState<LiveMatchRow[]>([])
  const now = useNow(1000, matches.length > 0)

  const load = useCallback(async () => {
    try {
      const sessions = await fetchLiveSessions(supabaseBrowser)
      if (sessions.length === 0) {
        setMatches([])
        return
      }
      const { data } = await supabaseBrowser
        .from("events")
        .select("id, avversario, squadra_casa, squadra_ospite")
        .in("id", sessions.map(({ eventId }) => eventId))
      const opponentById = new Map(
        (data ?? []).map((event) => [
          event.id as string,
          (event.avversario as string | null) ??
            (String(event.squadra_casa ?? "").toLowerCase().includes("chigi")
              ? (event.squadra_ospite as string | null)
              : (event.squadra_casa as string | null)) ??
            "Avversario",
        ]),
      )
      setMatches(
        sessions.map((session) => ({
          session,
          opponent: opponentById.get(session.eventId) ?? "Avversario",
        })),
      )
    } catch {
      // Il banner è un di più: senza rete resta quello che c'era.
    }
  }, [])

  useEffect(() => {
    void load()
    const channel = supabaseBrowser
      .channel("match-sessions:home")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_sessions" }, () => void load())
      .subscribe()
    return () => {
      void supabaseBrowser.removeChannel(channel)
    }
  }, [load])

  useOnResume(() => void load())

  if (matches.length === 0) return null

  return (
    <div className="space-y-2">
      {matches.map(({ session, opponent }) => (
        <Link
          className="flex min-h-12 items-center gap-3 rounded-xl border border-secondary bg-secondary px-4 py-2 text-secondary-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={`/evento/${session.eventId}`}
          key={session.eventId}
        >
          <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black uppercase">
              Live · Chigi {session.scoreOurs}–{session.scoreTheirs} {opponent}
            </span>
            <span className="block text-[11px] font-semibold opacity-90">{liveStatusText(session, now)}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
