import type { SupabaseClient } from "@supabase/supabase-js"

import { recordEntry, type RecordAction } from "@/lib/match-api"

// Ogni tocco del segnapunti passa da qui: resta salvato sul telefono finché il
// server non lo conferma, così un campo senza rete non perde gli eventi.
// ponytail: localStorage, bastano poche decine di righe a partita.

const memory = new Map<string, RecordAction[]>()
const key = (eventId: string) => `match-queue:${eventId}`

export function readQueue(eventId: string): RecordAction[] {
  try {
    // Con lo storage disponibile fa fede lui; la memoria serve solo senza.
    const stored = window.localStorage.getItem(key(eventId))
    return stored ? (JSON.parse(stored) as RecordAction[]) : []
  } catch {
    return memory.get(eventId) ?? []
  }
}

function writeQueue(eventId: string, actions: RecordAction[]) {
  memory.set(eventId, actions)
  try {
    if (actions.length) window.localStorage.setItem(key(eventId), JSON.stringify(actions))
    else window.localStorage.removeItem(key(eventId))
  } catch {
    // Vedi sopra.
  }
}

export function enqueue(action: RecordAction) {
  writeQueue(action.eventId, [...readQueue(action.eventId), action])
}

export function dropQueued(eventId: string, actionId: string) {
  writeQueue(eventId, readQueue(eventId).filter(({ id }) => id !== actionId))
}

export const pendingCount = (eventId: string) => readQueue(eventId).length

let flushing: Promise<{ sent: RecordAction[]; rejected: RecordAction[] }> | null = null

/**
 * Invia in ordine. Senza rete (errore senza codice) si ferma e riprova dopo;
 * un rifiuto del server (controllo perso, dati non validi) toglie l'azione e
 * la restituisce, perché riprovarla non cambierebbe l'esito.
 */
export function flushQueue(client: SupabaseClient, eventId: string) {
  flushing ??= (async () => {
    const sent: RecordAction[] = []
    const rejected: RecordAction[] = []
    try {
      for (const action of readQueue(eventId)) {
        const error = await recordEntry(client, action)
        if (error && !error.code) break
        if (error) rejected.push(action)
        else sent.push(action)
        dropQueued(eventId, action.id)
      }
    } finally {
      flushing = null
    }
    return { sent, rejected }
  })()
  return flushing
}
