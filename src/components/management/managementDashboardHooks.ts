"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import type { PassportPhotoState } from "@/components/management/PassportPhotoPreview"
import type { ManagementPerson } from "@/lib/management"
import {
  fetchManagementAttendance,
  fetchManagementColumnPreferences,
  fetchManagementDisplayPreferences,
  saveManagementColumnPreferences,
  saveManagementDisplayPreferences,
} from "@/lib/management-api"
import type { AttendanceSummary } from "@/lib/management-attendance"
import {
  normalizeColumnPreferences,
  normalizeDisplayPreferences,
  type ColumnPreferences,
  type DisplayPreferences,
} from "@/lib/management-columns"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

// Dati di contorno della dashboard di gestione, ognuno con le sue richieste
// in volo: preferenze del manager, presenze della stagione, fototessere.

/**
 * Colonne e vista del manager. Le modifiche valgono subito e si salvano in
 * coda, nell'ordine: due salvataggi ravvicinati non si scavalcano.
 */
export function useManagementPreferences(profileId: string | undefined) {
  const [display, setDisplay] = useState<DisplayPreferences>(() =>
    normalizeDisplayPreferences(null),
  )
  const [columnPreferences, setColumnPreferences] = useState(() =>
    normalizeColumnPreferences(null),
  )
  const [columnPreferencesReady, setColumnPreferencesReady] = useState(false)
  const preferencesLoadGeneration = useRef(0)
  const columnPreferencesRef = useRef(columnPreferences)
  const displayPreferencesRef = useRef(display)
  const preferenceSaveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!profileId) return
    const generation = ++preferencesLoadGeneration.current
    setColumnPreferencesReady(false)

    void (async () => {
      try {
        const [storedColumns, storedDisplay] = await Promise.all([
          fetchManagementColumnPreferences(supabaseBrowser, profileId),
          fetchManagementDisplayPreferences(supabaseBrowser, profileId),
        ])
        const next = normalizeColumnPreferences(storedColumns)
        const display = normalizeDisplayPreferences(storedDisplay)
        if (generation !== preferencesLoadGeneration.current) return
        columnPreferencesRef.current = next
        setColumnPreferences(next)
        displayPreferencesRef.current = display
        setDisplay(display)
      } catch {
        if (generation !== preferencesLoadGeneration.current) return
        const fallback = normalizeColumnPreferences(null)
        columnPreferencesRef.current = fallback
        setColumnPreferences(fallback)
      } finally {
        if (generation === preferencesLoadGeneration.current) {
          setColumnPreferencesReady(true)
        }
      }
    })()

    return () => {
      if (generation === preferencesLoadGeneration.current) {
        preferencesLoadGeneration.current += 1
      }
    }
  }, [profileId])

  function updateColumnPreferences(
    change: (current: ColumnPreferences) => ColumnPreferences,
  ) {
    const next = change(columnPreferencesRef.current)
    columnPreferencesRef.current = next
    setColumnPreferences(next)
    if (!profileId) return
    preferenceSaveQueue.current = preferenceSaveQueue.current.then(
      async () => {
        try {
          await saveManagementColumnPreferences(
            supabaseBrowser,
            profileId,
            next,
          )
        } catch {
          toast.error("Preferenze colonne non salvate")
        }
      },
    )
  }

  function updateDisplay(
    change: (current: DisplayPreferences) => DisplayPreferences,
  ) {
    const next = change(displayPreferencesRef.current)
    displayPreferencesRef.current = next
    setDisplay(next)
    if (!profileId) return
    preferenceSaveQueue.current = preferenceSaveQueue.current.then(
      async () => {
        try {
          await saveManagementDisplayPreferences(
            supabaseBrowser,
            profileId,
            next,
          )
        } catch {
          // Solo comodità: la vista resta usabile anche senza salvataggio.
        }
      },
    )
  }

  return {
    display,
    updateDisplay,
    columnPreferences,
    columnPreferencesReady,
    updateColumnPreferences,
  }
}

type AttendanceLoadState =
  | { status: "loading"; signature: string; requestId: number }
  | {
      status: "loaded"
      signature: string
      requestId: number
      summaries: Map<string, AttendanceSummary>
    }
  | {
      status: "error"
      signature: string
      requestId: number
      message?: string
    }

function attendanceRosterSignature(people: ManagementPerson[]) {
  return people
    .filter(({ category }) => category === "PLAYER")
    // Anche gli infortuni cambiano le presenze: entrano nella firma.
    .map(
      ({ profileId, joinedOn, injuries }) =>
        `${profileId}:${joinedOn ?? ""}:${(injuries ?? [])
          .map(({ startedOn, endedOn }) => `${startedOn}>${endedOn ?? ""}`)
          .join(",")}`,
    )
    .sort()
    .join("|")
}

/**
 * Presenze della stagione, caricate sempre (non solo nella vista "Presenze"):
 * la scheda persona le mostra da qualunque vista si apra. In cache per
 * stagione, finché rosa e infortuni non cambiano.
 */
export function useSeasonAttendance(
  seasonSlug: string,
  people: ManagementPerson[],
  ready: boolean,
) {
  const [attendanceBySeason, setAttendanceBySeason] = useState<
    Record<string, AttendanceLoadState>
  >({})
  const attendanceRequestId = useRef(0)

  const rosterSignature = useMemo(
    () => attendanceRosterSignature(people),
    [people],
  )
  const cachedAttendanceState = attendanceBySeason[seasonSlug]
  const state =
    cachedAttendanceState?.signature === rosterSignature
      ? cachedAttendanceState
      : undefined

  useEffect(() => {
    // Caricate sempre (non solo nella vista "Presenze"): la scheda persona
    // le mostra da qualunque vista si apra.
    if (
      !ready ||
      cachedAttendanceState?.signature === rosterSignature
    ) {
      return
    }

    const requestId = ++attendanceRequestId.current
    setAttendanceBySeason((current) => ({
      ...current,
      [seasonSlug]: {
        status: "loading",
        signature: rosterSignature,
        requestId,
      },
    }))

    void fetchManagementAttendance(supabaseBrowser, seasonSlug, people)
      .then((summaries) => {
        setAttendanceBySeason((current) => {
          if (current[seasonSlug]?.requestId !== requestId) return current
          return {
            ...current,
            [seasonSlug]: {
              status: "loaded",
              signature: rosterSignature,
              requestId,
              summaries,
            },
          }
        })
      })
      .catch((error) => {
        setAttendanceBySeason((current) => {
          if (current[seasonSlug]?.requestId !== requestId) return current
          return {
            ...current,
            [seasonSlug]: {
              status: "error",
              signature: rosterSignature,
              requestId,
              message: error instanceof Error ? error.message : undefined,
            },
          }
        })
      })
  }, [
    cachedAttendanceState,
    ready,
    people,
    rosterSignature,
    seasonSlug,
  ])

  function retry() {
    setAttendanceBySeason((current) => {
      const next = { ...current }
      delete next[seasonSlug]
      return next
    })
  }

  return { state, retry }
}

/** URL firmati delle fototessere, solo quando la colonna è visibile. */
export function usePassportPhotoStates(
  people: ManagementPerson[],
  enabled: boolean,
) {
  const [passportPhotoStates, setPassportPhotoStates] = useState<
    Map<string, PassportPhotoState>
  >(new Map())
  const passportPhotoRequestId = useRef(0)

  useEffect(() => {
    const requestId = ++passportPhotoRequestId.current
    if (!enabled) {
      setPassportPhotoStates(new Map())
      return
    }

    const paths = [
      ...new Set(
        people.flatMap(({ passportPhotoPath }) =>
          passportPhotoPath ? [passportPhotoPath] : [],
        ),
      ),
    ]
    setPassportPhotoStates(
      new Map<string, PassportPhotoState>(
        paths.map((path) => [path, { status: "loading" }]),
      ),
    )

    void (async () => {
      const { data, error } = paths.length
        ? await supabaseBrowser.storage
            .from("passport-photos")
            .createSignedUrls(paths, 300)
        : { data: [], error: null }
      if (requestId !== passportPhotoRequestId.current) return
      if (error) {
        toast.error("Anteprime fototessera non disponibili")
        setPassportPhotoStates(
          new Map<string, PassportPhotoState>(
            paths.map((path) => [path, { status: "unavailable" }]),
          ),
        )
        return
      }
      const resultsByPath = new Map(
        (data ?? []).flatMap((item) =>
          item.path ? [[item.path, item] as const] : [],
        ),
      )
      setPassportPhotoStates(
        new Map(
          paths.map((path) => {
            const result = resultsByPath.get(path)
            const state: PassportPhotoState =
              result?.signedUrl && !result.error
                ? { status: "ready", signedUrl: result.signedUrl }
                : { status: "unavailable" }
            return [path, state]
          }),
        ),
      )
    })()
  }, [enabled, people])

  return passportPhotoStates
}
