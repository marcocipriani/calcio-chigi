import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  )
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: "Accesso richiesto" }, { status: 401, headers })
  const { data, error } = await supabase.rpc("get_app_context")
  if (error) return Response.json({ error: "Verifica accesso non disponibile" }, { status: 503, headers })
  if (data?.associationStatus !== "ACTIVE" || data?.membership?.status === "NO") {
    return Response.json({ error: "Riservato alla squadra" }, { status: 403, headers })
  }
  const { data: test, error: resultsError } = await supabase
    .from("crono_chigio_tests")
    .select("results")
    .eq("tested_on", "2026-11-12")
    .single()
  if (resultsError || !test) return Response.json({ error: "Risultati non disponibili" }, { status: 503, headers })
  return Response.json(test.results, { headers })
}
