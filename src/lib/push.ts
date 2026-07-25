import type { SupabaseClient } from "@supabase/supabase-js"

export type PushPlatform = "ios-pwa" | "ios-browser" | "android" | "web"

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function detectPushPlatform({
  userAgent,
  standalone,
}: {
  userAgent: string
  standalone: boolean
}): PushPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return standalone ? "ios-pwa" : "ios-browser"
  }
  if (/Android/i.test(userAgent)) return "android"
  return "web"
}

export function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export async function enablePushNotifications(
  client: SupabaseClient,
  userId: string,
) {
  if (!supportsWebPush()) {
    throw new Error("PUSH_UNSUPPORTED")
  }

  const platform = detectPushPlatform({
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      ),
  })

  if (platform === "ios-browser") {
    throw new Error("IOS_INSTALL_REQUIRED")
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission

  if (permission !== "granted") {
    throw new Error("PUSH_PERMISSION_DENIED")
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) throw new Error("VAPID_KEY_MISSING")

  const registration = await navigator.serviceWorker.register("/sw.js")
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }))

  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("PUSH_SUBSCRIPTION_INVALID")
  }

  const { error } = await client.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth_secret: serialized.keys.auth,
      platform,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  )

  if (error) throw error
  return subscription
}
