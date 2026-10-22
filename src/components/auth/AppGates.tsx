"use client"

import { useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Archive,
  Bell,
  Check,
  ChevronDown,
  Search,
  Shirt,
  Smartphone,
  UserRound,
  UserRoundCheck,
  WalletCards,
} from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { detectPushPlatform, enablePushNotifications, supportsWebPush } from "@/lib/push"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { cn } from "@/lib/utils"

type ClaimableProfile = {
  id: string
  nome: string
  cognome: string
}

const ASSOCIATION_POSTPONED_KEY = "association-prompt-postponed"

function AccountAssociationPrompt({ client }: { client: SupabaseClient }) {
  const { user, associationStatus, refresh } = useAppSession()
  const [profiles, setProfiles] = useState<ClaimableProfile[]>([])
  const [selected, setSelected] = useState<ClaimableProfile | null>(null)
  const [query, setQuery] = useState("")
  const [step, setStep] = useState<"PICK" | "CONFIRM" | "EMAIL_MATCH">("PICK")
  const [emailMatch, setEmailMatch] = useState<ClaimableProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "Non ora" vale per la sessione: la parte pubblica resta usabile.
  const [postponed, setPostponed] = useState(false)

  useEffect(() => {
    try {
      setPostponed(sessionStorage.getItem(ASSOCIATION_POSTPONED_KEY) === "1")
    } catch {
      // Senza storage il rinvio vale finché la pagina resta aperta.
    }
  }, [])

  const open = Boolean(
    user && associationStatus === "NONE" && !submitted && !postponed,
  )

  function postpone() {
    setPostponed(true)
    try {
      sessionStorage.setItem(ASSOCIATION_POSTPONED_KEY, "1")
    } catch {
      // Vedi sopra.
    }
  }

  async function logout() {
    await client.auth.signOut()
    window.location.assign("/login")
  }

  useEffect(() => {
    if (!open) return

    let active = true
    // Email dell'account già sul profilo: basta confermare, niente approvazione.
    void client.rpc("my_email_profile_match").then(({ data }) => {
      const match = (data as ClaimableProfile[] | null)?.[0]
      if (!active || !match) return
      setEmailMatch(match)
      setStep("EMAIL_MATCH")
    })
    void client
      .from("claimable_profile_directory")
      .select("id, nome, cognome")
      .order("cognome", { ascending: true })
      .then(({ data, error: profilesError }) => {
        if (!active) return
        if (profilesError) {
          setError("Impossibile caricare la rosa. Riprova tra poco.")
          return
        }
        setProfiles((data ?? []) as ClaimableProfile[])
      })

    return () => {
      active = false
    }
  }, [client, open])

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("it")
    if (!normalizedQuery) return profiles
    return profiles.filter(({ nome, cognome }) =>
      `${nome} ${cognome}`.toLocaleLowerCase("it").includes(normalizedQuery),
    )
  }, [profiles, query])

  async function claimEmailMatch() {
    if (!emailMatch) return
    setBusy(true)
    setError(null)
    const { error: claimError } = await client.rpc("claim_profile_by_email", {
      p_profile_id: emailMatch.id,
    })
    setBusy(false)
    if (claimError) {
      setError("Collegamento non riuscito. Scegli il tuo nome dall’elenco.")
      setStep("PICK")
      return
    }
    setSubmitted(true)
    toast.success(`Benvenuto, ${emailMatch.nome}!`)
    await refresh()
  }

  async function submit() {
    if (!selected) return
    setBusy(true)
    setError(null)

    const { error: requestError } = await client.rpc(
      "request_profile_association",
      { p_profile_id: selected.id },
    )

    setBusy(false)
    if (requestError) {
      setError("Richiesta non inviata. Il profilo potrebbe non essere più disponibile.")
      return
    }

    setSubmitted(true)
    toast.success("Richiesta inviata", {
      description: "Un manager deve approvare l’associazione.",
    })
    await refresh()
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="flex max-h-[min(680px,calc(100dvh-2rem))] flex-col gap-3 overflow-hidden p-4 sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 text-left">
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRoundCheck aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Chi sei nella rosa?</DialogTitle>
          <DialogDescription>
            L’account resterà sulla parte pubblica finché un manager non approva
            la richiesta.
          </DialogDescription>
        </DialogHeader>

        {step === "EMAIL_MATCH" && emailMatch ? (
          <>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              La tua email corrisponde a{" "}
              <strong>
                {emailMatch.nome} {emailMatch.cognome}
              </strong>
              . Sei tu? L’account verrà collegato subito.
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setStep("PICK")}
              >
                Non sono io
              </Button>
              <Button disabled={busy} onClick={claimEmailMatch}>
                {busy ? "Collegamento…" : "Sì, sono io"}
              </Button>
            </DialogFooter>
          </>
        ) : step === "PICK" ? (
          <>
            <label className="relative block shrink-0">
              <span className="sr-only">Cerca nome o cognome</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca nome o cognome"
                className="h-10 pl-9"
                type="search"
              />
            </label>

            <div
              aria-label="Profili disponibili"
              className="min-h-0 flex-auto overflow-y-auto rounded-md border"
            >
              {filteredProfiles.map((profile) => {
                const active = selected?.id === profile.id
                const name = `${profile.nome} ${profile.cognome}`
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between border-b px-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active && "bg-primary/8 font-medium text-primary",
                    )}
                    key={profile.id}
                    onClick={() => setSelected(profile)}
                    type="button"
                  >
                    {name}
                    {active && <Check aria-hidden="true" className="size-4" />}
                  </button>
                )
              })}
              {filteredProfiles.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nessun profilo disponibile.
                </p>
              )}
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              Non trovi il tuo nome? Chiedi a un manager di aggiungerti alla
              rosa.
            </p>

            {error && (
              <p className="shrink-0 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="shrink-0 flex-row flex-wrap items-center sm:justify-between">
              <div className="flex gap-1">
                <Button onClick={() => void logout()} size="sm" variant="ghost">
                  Esci
                </Button>
                <Button onClick={postpone} size="sm" variant="ghost">
                  Non ora
                </Button>
              </div>
              <Button
                className="ml-auto"
                disabled={!selected}
                onClick={() => setStep("CONFIRM")}
              >
                Continua
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              Stai associando il tuo account a{" "}
              <strong>
                {selected?.nome} {selected?.cognome}
              </strong>
              . La richiesta sarà visibile ai manager.
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setStep("PICK")}
              >
                Indietro
              </Button>
              <Button disabled={busy} onClick={submit}>
                {busy ? "Invio…" : "Conferma richiesta"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ARCHIVED_NOTICE_SEEN_KEY = "archived-notice-seen"

function ArchivedMemberNotice({ client }: { client: SupabaseClient }) {
  const { associationStatus, membership } = useAppSession()
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    try {
      setSeen(sessionStorage.getItem(ARCHIVED_NOTICE_SEEN_KEY) === "1")
    } catch {
      // Senza storage l'avviso torna a ogni caricamento.
    }
  }, [])

  if (associationStatus !== "ACTIVE" || membership?.status !== "NO" || seen) {
    return null
  }

  function continuePublic() {
    setSeen(true)
    try {
      sessionStorage.setItem(ARCHIVED_NOTICE_SEEN_KEY, "1")
    } catch {
      // Vedi sopra.
    }
  }

  async function logout() {
    setBusy(true)
    await client.auth.signOut()
    window.location.assign("/login")
  }

  return (
    <Dialog open onOpenChange={(open) => !open && continuePublic()}>
      <DialogContent className="gap-4 p-4 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="text-left">
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Archive aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Posto in rosa archiviato</DialogTitle>
          <DialogDescription>
            Un manager ha archiviato il tuo posto in rosa: le funzioni di
            squadra non sono disponibili, ma puoi consultare calendario,
            torneo e statistiche. Scrivi a un manager se pensi sia un errore.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={busy} onClick={logout} variant="outline">
            Esci
          </Button>
          <Button disabled={busy} onClick={continuePublic}>
            Continua sulla parte pubblica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type InstallPromptEvent = Event & { prompt: () => Promise<void> }

/**
 * Benvenuto al primo accesso dopo il collegamento: cosa manca al profilo,
 * installazione della PWA e notifiche. Compare una volta per account.
 */
function WelcomePrompt({
  client,
  onOpenChange,
}: {
  client: SupabaseClient
  onOpenChange: (open: boolean) => void
}) {
  const { user, profile, isAssociated } = useAppSession()
  const [open, setOpen] = useState(false)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [platform, setPlatform] = useState<ReturnType<typeof detectPushPlatform>>("web")
  const [pushOn, setPushOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const key = `welcome-done:${user?.id}`

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", capture)
    return () => window.removeEventListener("beforeinstallprompt", capture)
  }, [])

  const missingProfile = [
    !profile?.avatar_url && "foto",
    !profile?.data_nascita && "data di nascita",
  ].filter(Boolean) as string[]

  useEffect(() => {
    if (!isAssociated || !user) return
    try {
      if (window.localStorage.getItem(key)) return onOpenChange(false)
    } catch {
      // Senza storage il benvenuto compare a ogni visita finché non si chiude.
    }
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    const needsPush = supportsWebPush() && Notification.permission === "default"
    setStandalone(isStandalone)
    setPlatform(detectPushPlatform({ userAgent: navigator.userAgent, standalone: isStandalone }))
    setPushOn(!needsPush)
    // Niente da proporre: non disturbare.
    if (missingProfile.length === 0 && isStandalone && !needsPush) {
      return onOpenChange(false)
    }
    setOpen(true)
    // missingProfile deriva da profile: basta l'identità dell'utente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssociated, user?.id])

  function close() {
    try {
      window.localStorage.setItem(key, "1")
    } catch {
      // Vedi sopra.
    }
    setOpen(false)
    onOpenChange(false)
  }

  async function install() {
    await installEvent?.prompt()
    setInstallEvent(null)
  }

  async function enablePush() {
    if (!user) return
    setBusy(true)
    try {
      await enablePushNotifications(client, user.id)
      setPushOn(true)
      toast.success("Notifiche push attivate")
    } catch {
      toast.error("Notifiche non attivate. Puoi riprovare dalla campanella.")
    } finally {
      setBusy(false)
    }
  }

  const step = "flex items-start gap-3 rounded-lg border p-3 text-sm"
  const icon = "mt-0.5 size-5 shrink-0 text-primary"

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="gap-3 p-4 sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>Benvenuto{profile?.nome ? `, ${profile.nome}` : ""}!</DialogTitle>
          <DialogDescription>
            Tre passi per avere tutto pronto per la stagione.
          </DialogDescription>
        </DialogHeader>

        {missingProfile.length > 0 && (
          <div className={step}>
            <UserRound aria-hidden="true" className={icon} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Completa il profilo</p>
              <p className="text-muted-foreground">Mancano: {missingProfile.join(", ")}.</p>
            </div>
            <Button asChild onClick={close} size="sm" variant="outline">
              <Link href="/profilo">Apri</Link>
            </Button>
          </div>
        )}

        {!standalone && (
          <div className={step}>
            <Smartphone aria-hidden="true" className={icon} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Installa l’app</p>
              <p className="text-muted-foreground">
                {platform === "ios-browser"
                  ? "In Safari tocca Condividi, poi “Aggiungi alla schermata Home”."
                  : installEvent
                    ? "Si apre come un’app, senza barra del browser."
                    : "Dal menu del browser scegli “Installa app” o “Aggiungi a schermata Home”."}
              </p>
            </div>
            {installEvent && (
              <Button onClick={() => void install()} size="sm" variant="outline">
                Installa
              </Button>
            )}
          </div>
        )}

        {!pushOn && platform !== "ios-browser" && (
          <div className={step}>
            <Bell aria-hidden="true" className={icon} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Attiva le notifiche</p>
              <p className="text-muted-foreground">Convocazioni, quote e cambi di programma.</p>
            </div>
            <Button disabled={busy} onClick={() => void enablePush()} size="sm" variant="outline">
              Attiva
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={close}>Fatto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OpenPaymentsPrompt({ suppressed }: { suppressed: boolean }) {
  const { isAssociated, openPayments, targetSeason } = useAppSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (suppressed || !isAssociated || openPayments.count === 0) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `open-payments:${targetSeason?.id ?? "current"}:${today}`
    try {
      if (window.localStorage.getItem(key)) return
    } catch {
      // Senza storage il promemoria compare a ogni visita.
    }
    setOpen(true)
  }, [suppressed, isAssociated, openPayments.count, targetSeason?.id])

  function dismiss() {
    const today = new Date().toISOString().slice(0, 10)
    const key = `open-payments:${targetSeason?.id ?? "current"}:${today}`
    try {
      window.localStorage.setItem(key, "seen")
    } catch {
      // Vedi sopra.
    }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss()
        else setOpen(true)
      }}
    >
      <DialogContent className="gap-4 p-4 sm:max-w-sm">
        <DialogHeader className="text-left">
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
            <WalletCards aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>
            {openPayments.count === 1
              ? "Hai una quota aperta"
              : `Hai ${openPayments.count} quote aperte`}
          </DialogTitle>
          <DialogDescription>
            Totale da regolarizzare:{" "}
            <strong className="text-foreground">
              € {openPayments.amount.toFixed(2)}
            </strong>
            . Puoi dichiarare contanti o bonifico dalla tua scheda.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Più tardi
          </Button>
          <Button asChild onClick={dismiss}>
            <Link href="/profilo">Vedi quote</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Promemoria per chi è in rosa, visibile finché il manager non rende
 * definitivi i numeri di maglia. Si comprime in un bottone con la maglia
 * (scelta ricordata per stagione) ma non sparisce mai prima della conferma.
 */
function JerseyPreferencePrompt({ client }: { client: SupabaseClient }) {
  const { isAssociated, membership, targetSeason } = useAppSession()
  const pathname = usePathname()
  const [chosen, setChosen] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const membershipId =
    isAssociated &&
    membership?.category === "PLAYER" &&
    membership.status === "YES"
      ? membership.id
      : null
  const seasonId = targetSeason?.id
  const onJerseyPage = pathname === "/maglie"
  const collapsedKey = `jersey-prompt-collapsed:${seasonId}`

  // Si ricarica anche uscendo da /maglie, dove le preferenze cambiano.
  useEffect(() => {
    setChosen(null)
    if (!membershipId || !seasonId || onJerseyPage) return

    let active = true
    void Promise.all([
      client
        .from("jersey_preferences")
        .select("membership_id")
        .eq("membership_id", membershipId)
        .maybeSingle(),
      client
        .from("jersey_assignment_drafts")
        .select("confirmed_at")
        .eq("season_id", seasonId)
        .maybeSingle(),
    ]).then(([preferences, draft]) => {
      if (!active || preferences.error || draft.error) return
      if (draft.data?.confirmed_at) return
      let stored: string | null = null
      try {
        stored = window.localStorage.getItem(
          `jersey-prompt-collapsed:${seasonId}`,
        )
      } catch {
        // Senza storage si parte aperti se manca la scelta.
      }
      // Sui telefoni parte compresso: il riquadro aperto copre il contenuto sopra la barra in basso.
      const phone = window.matchMedia?.("(max-width: 767px)").matches ?? false
      setCollapsed(stored ? stored === "1" : Boolean(preferences.data) || phone)
      setChosen(Boolean(preferences.data))
    })

    return () => {
      active = false
    }
  }, [client, membershipId, onJerseyPage, seasonId])

  function toggle(next: boolean) {
    setCollapsed(next)
    try {
      window.localStorage.setItem(collapsedKey, next ? "1" : "0")
    } catch {
      // Preferenza solo di sessione.
    }
  }

  if (chosen === null) return null

  const position =
    "fixed right-3 z-40 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-20"

  if (collapsed) {
    return (
      <button
        aria-label={
          chosen
            ? "Numero di maglia: scelta aperta"
            : "Numero di maglia: da scegliere"
        }
        className={cn(
          position,
          "grid size-12 place-items-center rounded-full border bg-background text-primary shadow-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => toggle(false)}
        type="button"
      >
        <Shirt aria-hidden="true" className="size-6" />
        {!chosen && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-3 rounded-full border-2 border-background bg-amber-500"
          />
        )}
      </button>
    )
  }

  return (
    <section
      aria-labelledby="jersey-prompt-title"
      className={cn(
        position,
        "w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border bg-background p-3 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Shirt aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold" id="jersey-prompt-title">
            {chosen
              ? "Scelta dei numeri di maglia aperta"
              : "Scegli il tuo numero di maglia"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {chosen
              ? "Puoi modificare le preferenze finché il manager non assegna i numeri."
              : "Indica i numeri che preferisci, oppure che non hai preferenze."}
          </p>
        </div>
        <Button
          aria-label="Comprimi"
          className="-mr-1 -mt-1 size-9 shrink-0"
          onClick={() => toggle(true)}
          size="icon"
          variant="ghost"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
      <Button asChild className="mt-2.5 w-full" size="sm">
        <Link href="/maglie">{chosen ? "Modifica" : "Scegli"}</Link>
      </Button>
    </section>
  )
}

export function AppGates({
  client = supabaseBrowser,
}: {
  client?: SupabaseClient
  seasonSlug?: string
}) {
  // Un dialog alla volta: le quote aspettano che il benvenuto sia chiuso o
  // non serva (lo segnala WelcomePrompt).
  const [welcomeOpen, setWelcomeOpen] = useState(true)

  return (
    <>
      <AccountAssociationPrompt client={client} />
      <ArchivedMemberNotice client={client} />
      <WelcomePrompt client={client} onOpenChange={setWelcomeOpen} />
      <OpenPaymentsPrompt suppressed={welcomeOpen} />
      <JerseyPreferencePrompt client={client} />
    </>
  )
}
