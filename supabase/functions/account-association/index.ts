import { createClient } from "npm:@supabase/supabase-js@2.110.8"

type ActionBody = {
  requestId?: string
  action?: "APPROVE" | "REJECT"
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type",
    },
  })
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLocaleLowerCase())
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({}, 200)
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete" }, 500)
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "Unauthorized" }, 401)

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token)
  if (userError || !user) return json({ error: "Unauthorized" }, 401)

  const { data: reviewer } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_manager", true)
    .maybeSingle()
  if (!reviewer) return json({ error: "Manager role required" }, 403)

  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }
  if (
    !body.requestId ||
    (body.action !== "APPROVE" && body.action !== "REJECT")
  ) {
    return json({ error: "requestId and action are required" }, 400)
  }

  const { data: association, error: associationError } = await service
    .from("account_association_requests")
    .select("id, user_id, profile_id, status")
    .eq("id", body.requestId)
    .eq("status", "PENDING")
    .maybeSingle()
  if (associationError || !association) {
    return json({ error: "Pending request not found" }, 404)
  }

  if (body.action === "APPROVE") {
    const { error } = await service.rpc("approve_account_association", {
      p_request_id: association.id,
      p_reviewer_profile_id: reviewer.id,
    })
    if (error) return json({ error: error.message }, 409)

    await service.rpc("create_notification", {
      p_type: "ACCOUNT_ASSOCIATION_APPROVED",
      p_title: "Account approvato",
      p_body: "Ora puoi accedere alle funzioni riservate della squadra.",
      p_deep_link: "/profilo",
      p_target_user_ids: [association.user_id],
      p_critical: true,
      p_idempotency_key: `association-approved:${association.id}`,
      p_actor_profile_id: reviewer.id,
    })
    return json({ status: "APPROVED" })
  }

  const { data: targetUser, error: targetUserError } =
    await service.auth.admin.getUserById(association.user_id)
  const email = targetUser.user?.email
  if (targetUserError || !email) {
    return json({ error: "Associated Auth user not found" }, 404)
  }

  const { error: hashError } = await service
    .from("rejected_account_hashes")
    .upsert({
      email_hash: await sha256(email),
      rejected_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
  if (hashError) return json({ error: hashError.message }, 500)

  const { error: deleteError } = await service.auth.admin.deleteUser(
    association.user_id,
  )
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ status: "REJECTED_AND_DELETED" })
})
