"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type ManagerPresenceRow = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  manager_activity:
    | { last_seen_at: string; last_route: string | null }
    | { last_seen_at: string; last_route: string | null }[]
    | null
}

function activityOf(row: ManagerPresenceRow) {
  return Array.isArray(row.manager_activity)
    ? row.manager_activity[0] ?? null
    : row.manager_activity
}

function presenceState(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return { label: "mai attivo", color: "bg-slate-400" }
  const minutes = (Date.now() - new Date(lastSeenAt).getTime()) / 60_000
  if (minutes < 3) return { label: "attivo ora", color: "bg-emerald-500" }
  if (minutes < 15) return { label: "attivo di recente", color: "bg-amber-400" }
  return { label: "non attivo di recente", color: "bg-slate-400" }
}

export function ManagerPresence() {
  const pathname = usePathname()
  const [managers, setManagers] = useState<ManagerPresenceRow[]>([])

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from("profiles")
      .select(
        "id, nome, cognome, avatar_url, manager_activity(last_seen_at, last_route)",
      )
      .eq("is_manager", true)
      .order("cognome")
    setManagers((data ?? []) as unknown as ManagerPresenceRow[])
  }, [])

  useEffect(() => {
    let active = true

    async function touch() {
      await supabaseBrowser.rpc("touch_manager_activity", {
        p_route: pathname,
      })
      if (active) await load()
    }

    void touch()
    const interval = window.setInterval(() => void touch(), 120_000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") void touch()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [load, pathname])

  return (
    <div
      aria-label="Manager e stato attività"
      className="hidden -space-x-2 lg:flex"
    >
      {managers.slice(0, 5).map((manager) => {
        const activity = activityOf(manager)
        const presence = presenceState(activity?.last_seen_at)
        const name = `${manager.nome} ${manager.cognome}`

        return (
          <span
            aria-label={`${name}, ${presence.label}`}
            className="relative rounded-full"
            key={manager.id}
            title={`${name} · ${presence.label}`}
          >
            <Avatar className="size-8 border-2 border-background ring-2 ring-violet-500">
              <AvatarImage
                alt=""
                className="object-cover"
                src={manager.avatar_url ?? undefined}
              />
              <AvatarFallback className="bg-violet-600 text-[10px] font-bold text-white">
                {manager.nome[0]}
                {manager.cognome[0]}
              </AvatarFallback>
            </Avatar>
            <span
              aria-hidden="true"
              className={cn(
                "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background",
                presence.color,
              )}
            />
          </span>
        )
      })}
    </div>
  )
}
