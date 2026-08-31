"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { SupabaseClient, User } from "@supabase/supabase-js"

import { supabaseBrowser } from "@/lib/supabaseBrowser"

export type AssociationStatus = "NONE" | "REQUESTED" | "ACTIVE"

export type AppProfile = {
  id: string
  nome: string
  cognome: string
  avatar_url?: string | null
  data_nascita?: string | null
  is_manager?: boolean
}

export type AppMembership = {
  id: string
  status: "YES" | "NO"
  [key: string]: unknown
}

type AppContextPayload = {
  profile?: AppProfile | null
  associationStatus?: AssociationStatus
  membership?: AppMembership | null
  targetSeason?: {
    id: string
    slug: string
    name: string
    starts_on: string
    ends_on: string
  } | null
  unreadNotifications?: number
  openPayments?: {
    count: number
    amount: number
  } | null
}

type AppSessionValue = {
  user: User | null
  profile: AppProfile | null
  membership: AppMembership | null
  targetSeason: AppContextPayload["targetSeason"]
  associationStatus: AssociationStatus
  unreadNotifications: number
  openPayments: {
    count: number
    amount: number
  }
  isManager: boolean
  isAssociated: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const anonymousSession: Omit<AppSessionValue, "refresh"> = {
  user: null,
  profile: null,
  membership: null,
  targetSeason: null,
  associationStatus: "NONE",
  unreadNotifications: 0,
  openPayments: { count: 0, amount: 0 },
  isManager: false,
  isAssociated: false,
  loading: true,
}

const AppSessionContext = createContext<AppSessionValue | null>(null)

export function AppSessionProvider({
  children,
  client = supabaseBrowser,
}: {
  children: ReactNode
  client?: SupabaseClient
}) {
  const [state, setState] = useState(anonymousSession)

  const hydrate = useCallback(
    async (user: User | null) => {
      if (!user) {
        setState({ ...anonymousSession, loading: false })
        return
      }

      const { data, error } = await client.rpc("get_app_context")
      const context = (data ?? {}) as AppContextPayload

      if (error) {
        setState({
          ...anonymousSession,
          user,
          loading: false,
        })
        return
      }

      const profile = context.profile ?? null
      const associationStatus = context.associationStatus ?? "NONE"

      setState({
        user,
        profile,
        membership: context.membership ?? null,
        targetSeason: context.targetSeason ?? null,
        associationStatus,
        unreadNotifications: Number(context.unreadNotifications ?? 0),
        openPayments: {
          count: Number(context.openPayments?.count ?? 0),
          amount: Number(context.openPayments?.amount ?? 0),
        },
        isManager: Boolean(profile?.is_manager),
        isAssociated: associationStatus === "ACTIVE",
        loading: false,
      })
    },
    [client],
  )

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await client.auth.getUser()
    await hydrate(user)
  }, [client, hydrate])

  useEffect(() => {
    let active = true

    void client.auth.getUser().then(({ data }) => {
      if (active) void hydrate(data.user)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) void hydrate(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client, hydrate])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
    }),
    [refresh, state],
  )

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  )
}

export function useAppSession() {
  const context = useContext(AppSessionContext)

  if (!context) {
    throw new Error("useAppSession must be used inside AppSessionProvider")
  }

  return context
}

export function ProtectedFeature({
  children,
  fallback = null,
  managerOnly = false,
}: {
  children: ReactNode
  fallback?: ReactNode
  managerOnly?: boolean
}) {
  const { isAssociated, isManager, loading } = useAppSession()

  if (loading) return null
  if (!isAssociated || (managerOnly && !isManager)) return fallback

  return children
}
