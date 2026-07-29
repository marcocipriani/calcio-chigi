const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"])

export function requireLocalSupabaseUrl(value: string | undefined) {
  let hostname: string
  try {
    const parsed = new URL(value ?? "")
    hostname =
      parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
        ? parsed.hostname.slice(1, -1)
        : parsed.hostname
  } catch {
    throw new Error("E2E Supabase URL must use a loopback hostname")
  }

  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    throw new Error("E2E Supabase URL must use a loopback hostname")
  }
  return value!
}
