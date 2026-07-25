"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import Link from "next/link"
import { Check, Search, UserRoundCheck, WalletCards } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
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
import { shouldPromptForSeasonConfirmation } from "@/lib/season"
import { cn } from "@/lib/utils"

type ClaimableProfile = {
  id: string
  nome: string
  cognome: string
}

function AccountAssociationPrompt({ client }: { client: SupabaseClient }) {
  const { user, associationStatus, refresh } = useAppSession()
  const [profiles, setProfiles] = useState<ClaimableProfile[]>([])
  const [selected, setSelected] = useState<ClaimableProfile | null>(null)
  const [query, setQuery] = useState("")
  const [step, setStep] = useState<"PICK" | "CONFIRM">("PICK")
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = Boolean(
    user && associationStatus === "NONE" && !submitted,
  )

  useEffect(() => {
    if (!open) return

    let active = true
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
        className="max-h-[min(680px,calc(100dvh-2rem))] gap-3 overflow-hidden p-4 sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="text-left">
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRoundCheck aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Chi sei nella rosa?</DialogTitle>
          <DialogDescription>
            L’account resterà sulla parte pubblica finché un manager non approva
            la richiesta.
          </DialogDescription>
        </DialogHeader>

        {step === "PICK" ? (
          <>
            <label className="relative block">
              <span className="sr-only">Cerca nome o cognome</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca nome o cognome"
                className="h-10 pl-9"
              />
            </label>

            <div
              aria-label="Profili disponibili"
              className="min-h-36 flex-1 overflow-y-auto rounded-md border"
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

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                className="w-full sm:w-auto"
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

function SeasonConfirmationPrompt({
  client,
  seasonSlug,
  onFinished,
}: {
  client: SupabaseClient
  seasonSlug: string
  onFinished: () => void
}) {
  const { isAssociated, membership, refresh } = useAppSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const prompted = useRef(false)

  useEffect(() => {
    if (
      !isAssociated ||
      !membership ||
      !shouldPromptForSeasonConfirmation(
        membership.status,
        membership.last_confirmation_requested_at,
      )
    ) {
      return
    }

    setOpen(true)
    if (prompted.current) return
    prompted.current = true
    void client.rpc("mark_season_confirmation_prompted", {
      p_season_slug: seasonSlug,
    })
  }, [client, isAssociated, membership, seasonSlug])

  async function respond(response: "YES" | "MAYBE" | "NO") {
    setBusy(true)
    const { error } = await client.rpc("respond_to_season_confirmation", {
      p_season_slug: seasonSlug,
      p_response: response,
    })
    setBusy(false)

    if (error) {
      toast.error("Conferma non salvata", {
        description: "Riprova tra poco.",
      })
      return
    }

    setOpen(false)
    onFinished()
    toast.success("Disponibilità aggiornata")
    await refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) onFinished()
      }}
    >
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Ci sei per la stagione 2026–2027?</DialogTitle>
          <DialogDescription>
            Puoi cambiare risposta in seguito. “No” ti esclude dalla rosa e
            dalle formazioni della stagione.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <Button disabled={busy} onClick={() => respond("YES")}>
            Sì
          </Button>
          <Button
            disabled={busy}
            onClick={() => respond("MAYBE")}
            variant="secondary"
          >
            Forse
          </Button>
          <Button
            disabled={busy}
            onClick={() => respond("NO")}
            variant="outline"
          >
            No
          </Button>
        </div>
        <button
          className="mx-auto min-h-11 px-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            onFinished()
          }}
          type="button"
        >
          Decido più tardi
        </button>
      </DialogContent>
    </Dialog>
  )
}

function OpenPaymentsPrompt({ enabled }: { enabled: boolean }) {
  const { isAssociated, openPayments, targetSeason } = useAppSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled || !isAssociated || openPayments.count === 0) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `open-payments:${targetSeason?.id ?? "current"}:${today}`
    if (window.localStorage.getItem(key)) return
    setOpen(true)
  }, [enabled, isAssociated, openPayments.count, targetSeason?.id])

  function dismiss() {
    const today = new Date().toISOString().slice(0, 10)
    const key = `open-payments:${targetSeason?.id ?? "current"}:${today}`
    window.localStorage.setItem(key, "seen")
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

export function AppGates({
  client = supabaseBrowser,
  seasonSlug,
}: {
  client?: SupabaseClient
  seasonSlug?: string
}) {
  const { targetSeason, isAssociated, membership } = useAppSession()
  const needsSeasonConfirmation = Boolean(
    isAssociated &&
      membership &&
      shouldPromptForSeasonConfirmation(
        membership.status,
        membership.last_confirmation_requested_at,
      ),
  )
  const [seasonPromptFinished, setSeasonPromptFinished] = useState(false)

  useEffect(() => {
    if (!isAssociated) {
      setSeasonPromptFinished(false)
    } else if (!needsSeasonConfirmation) {
      setSeasonPromptFinished(true)
    }
  }, [isAssociated, needsSeasonConfirmation])

  return (
    <>
      <AccountAssociationPrompt client={client} />
      <SeasonConfirmationPrompt
        client={client}
        seasonSlug={seasonSlug ?? targetSeason?.slug ?? "2026-2027"}
        onFinished={() => setSeasonPromptFinished(true)}
      />
      <OpenPaymentsPrompt
        enabled={!needsSeasonConfirmation || seasonPromptFinished}
      />
    </>
  )
}
