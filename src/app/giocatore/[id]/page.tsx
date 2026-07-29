"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import {
  ArrowLeft,
  CalendarCheck,
  Contact,
  CreditCard,
  FileBadge,
  ShieldCheck,
} from "lucide-react"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { PageContainer } from "@/components/layout/PageContainer"
import { AttendanceRing } from "@/components/stats/AttendanceRing"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchSafePlayerProfile } from "@/lib/api"
import { romeDateKey } from "@/lib/season"
import type { SafePlayerProfile } from "@/lib/season-statistics"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type Membership = {
  id: string
  status: string
  registration_status: string
  registration_completed_on: string | null
  asi_card_number: string | null
}

type Payment = {
  id: string
  description: string
  amount_due: number
  due_on: string | null
  status: string
}

type Certificate = {
  id: string
  expires_on: string | null
  laboratory: string | null
  status: string
}

type OperationalContacts = {
  phone: string | null
  operational_email: string | null
}

type EventRow = {
  id: string
  tipo: "ALLENAMENTO" | "PARTITA"
  data_ora: string | null
  avversario: string | null
}

type PrivateData = {
  membership: Membership | null
  payments: Payment[]
  certificates: Certificate[]
  contacts: OperationalContacts | null
  events: EventRow[]
  presentIds: Set<string>
}

const emptyPrivateData: PrivateData = {
  membership: null,
  payments: [],
  certificates: [],
  contacts: null,
  events: [],
  presentIds: new Set(),
}

function displayDate(value: string | null) {
  if (!value) return "—"
  return format(new Date(`${value.slice(0, 10)}T12:00:00`), "d MMM yyyy", {
    locale: it,
  })
}

export default function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ season?: string | string[] }>
}) {
  const { id } = use(params)
  const selectedSeason = use(searchParams).season
  const selectedSeasonSlug =
    typeof selectedSeason === "string" ? selectedSeason : undefined
  const { replace } = useRouter()
  const {
    isAssociated,
    isManager,
    loading: sessionLoading,
    profile: viewerProfile,
    targetSeason,
    user,
  } = useAppSession()
  const [player, setPlayer] = useState<SafePlayerProfile | null>(null)
  const [privateData, setPrivateData] =
    useState<PrivateData>(emptyPrivateData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isSelf = viewerProfile?.id === id
  const canViewPrivate = isSelf || isManager
  const targetSeasonId = targetSeason?.id
  const targetSeasonSlug = targetSeason?.slug
  const targetSeasonStartsOn = targetSeason?.starts_on
  const targetSeasonEndsOn = targetSeason?.ends_on
  const userId = user?.id

  useEffect(() => {
    if (sessionLoading) return
    if (!userId) {
      replace("/login")
      return
    }
    if (!isAssociated) {
      replace("/squadra")
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    setPrivateData(emptyPrivateData)

    void (async () => {
      try {
        const today = romeDateKey(new Date())
        let seasonId: string | null = null

        if (
          targetSeasonId &&
          targetSeasonSlug &&
          targetSeasonStartsOn &&
          targetSeasonEndsOn &&
          (selectedSeasonSlug
            ? targetSeasonSlug === selectedSeasonSlug
            : today >= targetSeasonStartsOn && today <= targetSeasonEndsOn)
        ) {
          seasonId = targetSeasonId
        } else {
          let seasonQuery = supabaseBrowser
            .from("seasons")
            .select("id, slug")

          seasonQuery = selectedSeasonSlug
            ? seasonQuery.eq("slug", selectedSeasonSlug)
            : seasonQuery.lte("starts_on", today).gte("ends_on", today)

          const { data: season, error: seasonError } =
            await seasonQuery.maybeSingle()
          if (seasonError) throw seasonError
          seasonId = season?.id ?? null
        }

        if (!seasonId) {
          if (active) {
            setPlayer(null)
            setLoading(false)
          }
          return
        }

        const safePlayer = await fetchSafePlayerProfile(
          supabaseBrowser,
          id,
          seasonId,
        )
        if (!active) return
        setPlayer(safePlayer)

        if (!safePlayer || !canViewPrivate) {
          setLoading(false)
          return
        }

        const { data: membershipRow, error: membershipError } =
          await supabaseBrowser
            .from("season_memberships")
            .select(
              "id, status, registration_status, registration_completed_on, asi_card_number",
            )
            .eq("profile_id", id)
            .eq("season_id", seasonId)
            .maybeSingle()
        if (membershipError) throw membershipError
        const membership = (membershipRow as Membership | null) ?? null

        let payments: Payment[] = []
        let certificates: Certificate[] = []
        if (membership) {
          const [paymentsResult, certificatesResult] = await Promise.all([
            supabaseBrowser
              .from("payments")
              .select("id, description, amount_due, due_on, status")
              .eq("membership_id", membership.id)
              .order("due_on", { ascending: true }),
            supabaseBrowser
              .from("medical_certificates")
              .select("id, expires_on, laboratory, status")
              .eq("membership_id", membership.id)
              .order("expires_on", { ascending: false }),
          ])
          if (paymentsResult.error) throw paymentsResult.error
          if (certificatesResult.error) throw certificatesResult.error
          payments = (paymentsResult.data ?? []) as Payment[]
          certificates = (certificatesResult.data ?? []) as Certificate[]
        }

        let contacts: OperationalContacts | null = null
        if (isManager) {
          const { data, error: contactsError } = await supabaseBrowser
            .from("profile_private_details")
            .select("phone, operational_email")
            .eq("profile_id", id)
            .maybeSingle()
          if (contactsError) throw contactsError
          contacts = (data as OperationalContacts | null) ?? null
        }

        let events: EventRow[] = []
        let presentIds = new Set<string>()
        if (isSelf) {
          const now = new Date().toISOString()
          const { data: eventRows, error: eventsError } = await supabaseBrowser
            .from("events")
            .select("id, tipo, data_ora, avversario")
            .eq("season_id", seasonId)
            .lte("data_ora", now)
            .order("data_ora", { ascending: false })
          if (eventsError) throw eventsError
          events = (eventRows ?? []) as EventRow[]

          const eventIds = events.map(({ id: eventId }) => eventId)
          if (eventIds.length) {
            const { data: checkins, error: checkinsError } =
              await supabaseBrowser
                .from("event_checkins")
                .select("event_id")
                .eq("profile_id", id)
                .eq("status", "PRESENT")
                .in("event_id", eventIds)
            if (checkinsError) throw checkinsError
            presentIds = new Set(
              (checkins ?? []).map(({ event_id }) => event_id),
            )
          }
        }

        if (active) {
          setPrivateData({
            membership,
            payments,
            certificates,
            contacts,
            events,
            presentIds,
          })
          setLoading(false)
        }
      } catch {
        if (active) {
          setError("Impossibile caricare il profilo.")
          setLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [
    canViewPrivate,
    id,
    isAssociated,
    isManager,
    isSelf,
    replace,
    selectedSeasonSlug,
    sessionLoading,
    targetSeasonEndsOn,
    targetSeasonId,
    targetSeasonSlug,
    targetSeasonStartsOn,
    userId,
  ])

  const training = useMemo(
    () =>
      privateData.events.filter(({ tipo }) => tipo === "ALLENAMENTO"),
    [privateData.events],
  )
  const trainingPresent = training.filter(({ id: eventId }) =>
    privateData.presentIds.has(eventId),
  ).length
  const attendancePercentage = training.length
    ? (trainingPresent / training.length) * 100
    : 0

  if (sessionLoading || loading || !user || !isAssociated) {
    return (
      <PageContainer contentClassName="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer contentClassName="mx-auto max-w-2xl">
        <p className="py-10 text-center" role="alert">
          {error}
        </p>
      </PageContainer>
    )
  }

  if (!player) {
    return (
      <PageContainer contentClassName="mx-auto max-w-2xl">
        <p className="py-10 text-center">Giocatore non trovato.</p>
      </PageContainer>
    )
  }

  const metrics = [
    ["Goal", player.goals],
    ["Assist", player.assists ?? "—"],
    ["MVP", player.mvp],
    ["Ammonizioni", player.yellow_cards],
    ["Espulsioni", player.red_cards],
  ] as const
  const latestCertificate = privateData.certificates[0] ?? null

  return (
    <PageContainer contentClassName="mx-auto max-w-2xl pb-24">
      <main className="space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link href="/squadra">
            <ArrowLeft aria-hidden="true" />
            Squadra
          </Link>
        </Button>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-4 p-4">
            <Avatar className="size-20 border-2 border-background ring-1 ring-border">
              <AvatarImage
                alt={`${player.nome} ${player.cognome}`}
                className="object-cover"
                src={player.avatar_url ?? undefined}
              />
              <AvatarFallback className="text-lg font-black">
                {player.nome[0]}
                {player.cognome[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-tight">
                {player.nome} {player.cognome}
              </h1>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">
                  {player.role ?? "Ruolo da definire"}
                </Badge>
                <Badge variant="secondary">
                  #{player.jersey_number ?? "—"}
                </Badge>
              </div>
            </div>
            {isSelf && (
              <AttendanceRing
                avatarUrl={player.avatar_url}
                name={`${player.nome} ${player.cognome}`}
                percentage={attendancePercentage}
                size={72}
              />
            )}
          </div>
          <dl className="grid grid-cols-2 border-t bg-muted/25 sm:grid-cols-5">
            {metrics.map(([label, value]) => (
              <div
                aria-label={`${label}: ${value}`}
                className="border-r px-2 py-3 text-center last:border-r-0"
                key={label}
              >
                <dd className="text-xl font-black tabular-nums">{value}</dd>
                <dt className="text-[10px] font-bold uppercase text-muted-foreground">
                  {label}
                </dt>
              </div>
            ))}
          </dl>
        </section>

        {privateData.membership && (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold">Tesseramento</h2>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Tessera ASI</dt>
                <dd className="font-semibold">
                  {privateData.membership.asi_card_number ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Rosa</dt>
                <dd className="font-semibold">
                  {privateData.membership.status}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tesseramento</dt>
                <dd className="font-semibold">
                  {privateData.membership.registration_status}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Completato il</dt>
                <dd className="font-semibold">
                  {displayDate(
                    privateData.membership.registration_completed_on,
                  )}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {canViewPrivate && (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <CreditCard aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold">Pagamenti</h2>
            </div>
            <div className="mt-3 space-y-2">
              {privateData.payments.map((payment) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm"
                  key={payment.id}
                >
                  <span>
                    <strong className="block">{payment.description}</strong>
                    <span className="text-xs text-muted-foreground">
                      Scadenza {displayDate(payment.due_on)}
                    </span>
                  </span>
                  <Badge variant="outline">
                    € {Number(payment.amount_due).toFixed(2)} · {payment.status}
                  </Badge>
                </div>
              ))}
              {!privateData.payments.length && (
                <p className="text-sm text-muted-foreground">
                  Nessun pagamento per questa stagione.
                </p>
              )}
            </div>
          </section>
        )}

        {canViewPrivate && (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <FileBadge aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold">Certificato medico</h2>
            </div>
            {latestCertificate ? (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Stato</dt>
                  <dd className="font-semibold">{latestCertificate.status}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Scadenza</dt>
                  <dd className="font-semibold">
                    {displayDate(latestCertificate.expires_on)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Struttura</dt>
                  <dd className="font-semibold">
                    {latestCertificate.laboratory ?? "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nessun certificato per questa stagione.
              </p>
            )}
          </section>
        )}

        {isManager && privateData.contacts && (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Contact aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold">Contatti operativi</h2>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Telefono</dt>
                <dd className="font-semibold">
                  {privateData.contacts.phone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-semibold">
                  {privateData.contacts.operational_email ?? "—"}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {isSelf && (
          <section
            aria-labelledby="player-attendance-title"
            className="overflow-hidden rounded-xl border bg-card"
          >
            <div className="flex items-center gap-2 border-b p-3">
              <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-bold" id="player-attendance-title">
                Presenze
              </h2>
              <Badge className="ml-auto" variant="outline">
                {trainingPresent}/{training.length} allenamenti
              </Badge>
            </div>
            <div className="divide-y">
              {privateData.events.slice(0, 30).map((event) => (
                <div
                  className="flex min-h-12 items-center justify-between gap-3 px-3 py-2"
                  key={event.id}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs">
                      {event.tipo === "PARTITA"
                        ? event.avversario ?? "Partita"
                        : "Allenamento"}
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      {event.data_ora
                        ? format(new Date(event.data_ora), "d MMM yyyy", {
                            locale: it,
                          })
                        : "Data non definita"}
                    </span>
                  </span>
                  <Badge
                    variant={
                      privateData.presentIds.has(event.id)
                        ? "default"
                        : "outline"
                    }
                  >
                    {privateData.presentIds.has(event.id)
                      ? "Presente"
                      : "Assente"}
                  </Badge>
                </div>
              ))}
              {!privateData.events.length && (
                <p className="p-5 text-center text-sm text-muted-foreground">
                  Nessun evento concluso in questa stagione.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </PageContainer>
  )
}
