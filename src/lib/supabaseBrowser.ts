import { createBrowserClient } from '@supabase/ssr'

// Singleton client browser (cookie-based auth via @supabase/ssr).
// @supabase/ssr restituisce già la stessa istanza internamente: un singolo export evita
// di ripetere le env var in ogni pagina. Per accesso server-side usare createServerClient.
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_KEY!
)
