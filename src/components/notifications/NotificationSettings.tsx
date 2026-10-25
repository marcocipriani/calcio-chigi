"use client"

import { useCallback, useEffect, useState } from "react"
import { BellRing, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { enablePushNotifications, supportsWebPush } from "@/lib/push"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

// I tipi sono notifications.type (vedi create_notification): uno spento non
// arriva né in campanella né come push. Le critiche arrivano sempre.
const GROUPS: { title: string; managerOnly?: boolean; items: { type: string; label: string }[] }[] = [
  {
    title: "Partite in diretta",
    items: [
      { type: "MATCH_START", label: "Calcio d’inizio" },
      { type: "MATCH_GOAL", label: "Goal del Chigi" },
      { type: "MATCH_GOAL_AGAINST", label: "Goal degli avversari" },
      { type: "MATCH_END", label: "Fischio finale" },
    ],
  },
  {
    title: "Squadra",
    items: [
      { type: "CHIGIO_DORO_OPEN", label: "Chigio d’Oro aperto" },
      { type: "CHIGIO_DORO_CLOSED", label: "Chigio d’Oro: chi ha vinto" },
      { type: "JERSEY_NUMBERS", label: "Numeri di maglia" },
      { type: "MANAGER_MESSAGE", label: "Messaggi dei manager" },
    ],
  },
  {
    title: "Manager",
    managerOnly: true,
    items: [
      { type: "CHIGIO_DORO_CHECKIN_REMINDER", label: "Promemoria check-in" },
      { type: "MATCH_AUTO_CLOSED", label: "Partita chiusa in automatico" },
    ],
  },
]

const PUSH_ERRORS: Record<string, string> = {
  IOS_INSTALL_REQUIRED: "Su iPhone aggiungi prima l’app alla schermata Home.",
  PUSH_PERMISSION_DENIED: "Permesso notifiche negato nelle impostazioni del browser.",
}

/** Push su questo dispositivo: se è già iscritto e come iscriverlo. */
export function usePushDevice() {
  const { user } = useAppSession()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const supported = supportsWebPush()

  useEffect(() => {
    if (!user || !supportsWebPush()) return
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setEnabled(Boolean(subscription)))
  }, [user])

  const enable = useCallback(async () => {
    if (!user) return
    setBusy(true)
    try {
      await enablePushNotifications(supabaseBrowser, user.id)
      setEnabled(true)
      toast.success("Notifiche push attivate")
    } catch (error) {
      toast.error(
        (error instanceof Error && PUSH_ERRORS[error.message]) ||
          "Notifiche push non disponibili su questo dispositivo.",
      )
    } finally {
      setBusy(false)
    }
  }, [user])

  return { supported, enabled, busy, enable }
}

export function NotificationSettings() {
  const { user, isManager } = useAppSession()
  const device = usePushDevice()
  // Senza riga in notification_preferences il tipo è attivo.
  const [muted, setMuted] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    void supabaseBrowser
      .from("notification_preferences")
      .select("category, push_enabled")
      .eq("user_id", user.id)
      .then(({ data }) =>
        setMuted(new Set((data ?? []).filter(({ push_enabled }) => !push_enabled).map(({ category }) => category))),
      )
  }, [user])

  async function toggle(type: string, enabled: boolean) {
    if (!user) return
    const change = (current: Set<string>, on: boolean) => {
      const next = new Set(current)
      if (on) next.delete(type)
      else next.add(type)
      return next
    }
    setMuted((current) => change(current, enabled))
    const { error } = await supabaseBrowser.from("notification_preferences").upsert({
      user_id: user.id,
      category: type,
      push_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      setMuted((current) => change(current, !enabled))
      toast.error("Preferenza non salvata")
    }
  }

  // Dal link della campanella (/profilo#notifiche): la card arriva dopo il caricamento del profilo.
  useEffect(() => {
    if (user && window.location.hash === "#notifiche") {
      document.getElementById("notifiche")?.scrollIntoView({ block: "start" })
    }
  }, [user])

  if (!user) return null

  return (
    <Card className="scroll-mt-20" id="notifiche">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing aria-hidden="true" className="h-5 w-5 text-primary" />
          Notifiche
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {device.supported && !device.enabled && (
          <Button className="w-full justify-start" disabled={device.busy} onClick={() => void device.enable()} variant="outline">
            <Smartphone aria-hidden="true" />
            {device.busy ? "Attivazione…" : "Attiva le push su questo dispositivo"}
          </Button>
        )}
        {GROUPS.filter(({ managerOnly }) => !managerOnly || isManager).map((group) => (
          <fieldset className="space-y-1" key={group.title}>
            <legend className="mb-1 text-xs font-black uppercase tracking-wide text-muted-foreground">{group.title}</legend>
            {group.items.map(({ type, label }) => (
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm" key={type}>
                {label}
                <Switch checked={!muted.has(type)} onCheckedChange={(checked) => void toggle(type, checked)} />
              </label>
            ))}
          </fieldset>
        ))}
        <p className="text-xs text-muted-foreground">
          Sempre attive: cambi di data, orario o campo, convocazioni, pagamenti e certificati.
        </p>
      </CardContent>
    </Card>
  )
}
