"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registrato con successo:", registration.scope)
        })
        .catch((error) => {
          console.error("Errore registrazione Service Worker:", error)
        })
    }
  }, [])

  return null
}