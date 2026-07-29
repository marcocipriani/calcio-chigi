"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceStrict } from "date-fns"
import { it } from "date-fns/locale"
import { usePathname } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type ManagerPresenceRow = {
  id: string
  nome: string
  cognome: string
  avatar_url: string | null
  lastSeenAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function activityLastSeenAt(value: unknown): string | null {
  const activity = Array.isArray(value) ? value[0] : value
  return isRecord(activity) && typeof activity.last_seen_at === "string"
    ? activity.last_seen_at
    : null
}

function normalizeManagerRows(data: unknown): ManagerPresenceRow[] {
  if (!Array.isArray(data)) return []

  return data.flatMap((row): ManagerPresenceRow[] => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      typeof row.nome !== "string" ||
      typeof row.cognome !== "string"
    ) {
      return []
    }

    return [
      {
        id: row.id,
        nome: row.nome,
        cognome: row.cognome,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
        lastSeenAt: activityLastSeenAt(row.manager_activity),
      },
    ]
  })
}

export type PresenceState = "ONLINE" | "RECENT" | "STALE" | "NEVER"

export function presenceState(
  lastSeenAt: string | null | undefined,
  now = new Date(),
): { state: PresenceState; label: string; color: string } {
  if (!lastSeenAt) {
    return { state: "NEVER", label: "Mai attivo", color: "bg-slate-400" }
  }

  const lastSeen = new Date(lastSeenAt)
  if (Number.isNaN(lastSeen.getTime())) {
    return { state: "NEVER", label: "Mai attivo", color: "bg-slate-400" }
  }

  const elapsed = now.getTime() - lastSeen.getTime()
  if (elapsed < 3 * 60_000) {
    return { state: "ONLINE", label: "Online", color: "bg-emerald-500" }
  }

  const label = `Attivo ${formatDistanceStrict(lastSeen, now, {
    addSuffix: true,
    locale: it,
  })}`
  if (elapsed <= 24 * 60 * 60_000) {
    return { state: "RECENT", label, color: "bg-amber-400" }
  }

  return { state: "STALE", label, color: "bg-slate-400" }
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
    setManagers(normalizeManagerRows(data))
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
        const presence = presenceState(manager.lastSeenAt)
        const name = `${manager.nome} ${manager.cognome}`

        return (
          <Tooltip key={manager.id}>
            <TooltipTrigger asChild>
              <span
                aria-label={`${name}, ${presence.label}`}
                className="relative rounded-full"
                tabIndex={0}
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
            </TooltipTrigger>
            <TooltipContent>{`${name} · ${presence.label}`}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
