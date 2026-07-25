"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bell, BellRing, CheckCheck, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  enablePushNotifications,
  supportsWebPush,
} from "@/lib/push"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type NotificationRow = {
  notification_id: string
  read_at: string | null
  created_at: string
  notification: {
    id: string
    title: string
    body: string
    deep_link: string | null
    critical: boolean
    created_at: string
  }
}

const relativeFormatter = new Intl.RelativeTimeFormat("it", { numeric: "auto" })

function relativeTime(value: string) {
  const delta = new Date(value).getTime() - Date.now()
  const minutes = Math.round(delta / 60_000)
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour")
  return relativeFormatter.format(Math.round(hours / 24), "day")
}

export function NotificationBell() {
  const { user, unreadNotifications, refresh } = useAppSession()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    const { data, error } = await supabaseBrowser
      .from("notification_recipients")
      .select(
        "notification_id, read_at, created_at, notification:notifications(id, title, body, deep_link, critical, created_at)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)

    if (!error) setItems((data ?? []) as unknown as NotificationRow[])
  }, [user])

  useEffect(() => {
    void load()
    if (!user) return

    const channel = supabaseBrowser
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_recipients",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabaseBrowser.removeChannel(channel)
    }
  }, [load, user])

  useEffect(() => {
    if (!user || !supportsWebPush()) return
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
  }, [user])

  const unread = useMemo(
    () =>
      items.length > 0
        ? items.filter((item) => !item.read_at).length
        : unreadNotifications,
    [items, unreadNotifications],
  )

  if (!user) return null

  async function markRead(notificationId: string) {
    if (!user) return
    const readAt = new Date().toISOString()
    setItems((current) =>
      current.map((item) =>
        item.notification_id === notificationId
          ? { ...item, read_at: readAt }
          : item,
      ),
    )
    await supabaseBrowser
      .from("notification_recipients")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .eq("notification_id", notificationId)
    await refresh()
  }

  async function markAllRead() {
    if (!user || unread === 0) return
    const readAt = new Date().toISOString()
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    )
    await supabaseBrowser
      .from("notification_recipients")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null)
    await refresh()
  }

  async function enablePush() {
    if (!user) return
    setPushBusy(true)
    try {
      await enablePushNotifications(supabaseBrowser, user.id)
      setPushEnabled(true)
      toast.success("Notifiche push attivate")
    } catch (error) {
      const message =
        error instanceof Error && error.message === "IOS_INSTALL_REQUIRED"
          ? "Su iPhone aggiungi prima l’app alla schermata Home."
          : error instanceof Error && error.message === "PUSH_PERMISSION_DENIED"
            ? "Permesso notifiche negato nelle impostazioni del browser."
            : "Notifiche push non disponibili su questo dispositivo."
      toast.error(message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={
            unread > 0
              ? `Notifiche, ${unread} non lette`
              : "Notifiche, nessuna non letta"
          }
          className="relative rounded-full"
          size="icon"
          variant="ghost"
        >
          {unread > 0 ? (
            <BellRing aria-hidden="true" className="size-5" />
          ) : (
            <Bell aria-hidden="true" className="size-5" />
          )}
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(380px,calc(100vw-1rem))] overflow-hidden p-0"
        sideOffset={8}
      >
        <div className="flex min-h-11 items-center justify-between border-b px-3">
          <div>
            <p className="text-sm font-semibold">Notifiche</p>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} da leggere` : "Tutto letto"}
            </p>
          </div>
          <Button
            disabled={unread === 0}
            onClick={markAllRead}
            size="sm"
            variant="ghost"
          >
            <CheckCheck aria-hidden="true" />
            Segna tutte
          </Button>
        </div>

        {!pushEnabled && supportsWebPush() && (
          <div className="border-b bg-muted/35 p-3">
            <Button
              className="w-full justify-start"
              disabled={pushBusy}
              onClick={enablePush}
              size="sm"
              variant="outline"
            >
              <Smartphone aria-hidden="true" />
              {pushBusy ? "Attivazione…" : "Attiva notifiche su questo dispositivo"}
            </Button>
          </div>
        )}

        <div className="max-h-[min(440px,65dvh)] overflow-y-auto">
          {items.map((item) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    item.read_at ? "bg-transparent" : "bg-primary",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium leading-tight">
                      {item.notification.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relativeTime(item.notification.created_at)}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {item.notification.body}
                  </span>
                </span>
              </>
            )

            const className =
              "flex min-h-16 w-full gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

            return item.notification.deep_link ? (
              <Link
                className={className}
                href={item.notification.deep_link}
                key={item.notification_id}
                onClick={() => void markRead(item.notification_id)}
              >
                {content}
              </Link>
            ) : (
              <button
                className={className}
                key={item.notification_id}
                onClick={() => void markRead(item.notification_id)}
                type="button"
              >
                {content}
              </button>
            )
          })}
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nessuna notifica.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
