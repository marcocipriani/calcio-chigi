import { useEffect, useRef } from "react"

// Dopo lo sleep del telefono il realtime si riconnette ma non rimanda le
// modifiche perse: al ritorno in primo piano (o online) si ricarica.
export function useOnResume(callback: () => void) {
  const latest = useRef(callback)

  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") latest.current()
    }
    document.addEventListener("visibilitychange", run)
    window.addEventListener("online", run)
    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("online", run)
    }
  }, [])
}
