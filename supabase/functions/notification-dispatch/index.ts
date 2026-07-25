import { createClient } from "npm:@supabase/supabase-js@2.110.8"
import webPush from "npm:web-push@3.6.7"

type OutboxItem = {
  outbox_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_secret: string
  title: string
  body: string
  deep_link: string | null
  notification_type: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const dispatchSecret = Deno.env.get("NOTIFICATION_DISPATCH_SECRET")
  if (
    !dispatchSecret ||
    request.headers.get("x-dispatch-secret") !== dispatchSecret
  ) {
    return json({ error: "Unauthorized" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")
  const vapidSubject =
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@calcio-chigi.it"

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey
  ) {
    return json({ error: "Notification secrets are incomplete" }, 500)
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc("claim_notification_outbox", {
    p_limit: 25,
  })
  if (error) return json({ error: error.message }, 500)

  const items = (data ?? []) as OutboxItem[]
  let delivered = 0
  let failed = 0
  let expired = 0

  for (const item of items) {
    try {
      await webPush.sendNotification(
        {
          endpoint: item.endpoint,
          keys: {
            p256dh: item.p256dh,
            auth: item.auth_secret,
          },
        },
        JSON.stringify({
          title: item.title,
          body: item.body,
          url: item.deep_link ?? "/",
          tag: item.notification_type,
        }),
        { TTL: 86_400, urgency: "normal" },
      )

      await supabase.rpc("complete_notification_delivery", {
        p_outbox_id: item.outbox_id,
        p_success: true,
        p_error: null,
      })
      delivered += 1
    } catch (cause) {
      const error = cause as {
        statusCode?: number
        message?: string
        body?: string
      }
      const permanent = error.statusCode === 404 || error.statusCode === 410

      await supabase.rpc("complete_notification_delivery", {
        p_outbox_id: item.outbox_id,
        p_success: permanent,
        p_error: permanent
          ? null
          : error.message ?? error.body ?? "Push delivery failed",
      })

      if (permanent) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("id", item.subscription_id)
        expired += 1
      } else {
        failed += 1
      }
    }
  }

  return json({
    claimed: items.length,
    delivered,
    failed,
    expired,
  })
})
