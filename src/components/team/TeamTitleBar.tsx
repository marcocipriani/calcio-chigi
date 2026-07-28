"use client"

import { useId } from "react"
import { ClipboardList, Radio } from "lucide-react"

import {
  NextMatchCapsule,
  type NextMatchSummary,
} from "@/components/formations/NextMatchCapsule"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function TeamTitleBar({
  isManager,
  match,
  matchError,
  matchLoading,
  onOpenPlayground,
  onOpenOfficial,
}: {
  isManager: boolean
  match: NextMatchSummary | null
  matchError: Error | null
  matchLoading: boolean
  onOpenPlayground: () => void
  onOpenOfficial: () => void
}): React.JSX.Element {
  const unavailableDescriptionId = useId()
  const matchUnavailable = match === null
  const unavailableDescription = matchLoading
    ? "Caricamento prossima partita"
    : matchError
      ? "Impossibile caricare la prossima partita"
      : "Nessuna prossima partita"

  return (
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Stagione in corso
        </p>
        <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
          Squadra
        </h1>
      </div>

      <div className="order-2 flex min-w-0 items-center gap-1.5 sm:order-3 sm:col-start-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Crea la tua formazione"
              className="size-11 px-0 sm:h-8 sm:w-auto sm:px-3"
              onClick={onOpenPlayground}
              size="sm"
              variant="outline"
            >
              <ClipboardList aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">
                Crea la tua formazione
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">
            Crea la tua formazione
          </TooltipContent>
        </Tooltip>

        {isManager && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-describedby={
                  matchUnavailable ? unavailableDescriptionId : undefined
                }
                aria-label={
                  matchUnavailable
                    ? `Pubblica formazione: ${unavailableDescription}`
                    : undefined
                }
                className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role={matchUnavailable ? "group" : undefined}
                tabIndex={matchUnavailable ? 0 : undefined}
              >
                <Button
                  aria-describedby={
                    matchUnavailable ? unavailableDescriptionId : undefined
                  }
                  aria-label="Pubblica formazione"
                  className="size-11 bg-violet-600 px-0 text-white hover:bg-violet-700 sm:h-8 sm:w-auto sm:px-3"
                  disabled={matchUnavailable}
                  onClick={onOpenOfficial}
                  size="sm"
                >
                  <Radio aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">
                    Pubblica formazione
                  </span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              className={matchUnavailable ? undefined : "sm:hidden"}
            >
              {matchUnavailable
                ? unavailableDescription
                : "Pubblica formazione"}
            </TooltipContent>
            {matchUnavailable && (
              <span className="sr-only" id={unavailableDescriptionId}>
                {unavailableDescription}
              </span>
            )}
          </Tooltip>
        )}
      </div>

      {match && (
        <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1 sm:col-start-2 sm:justify-self-end">
          <NextMatchCapsule match={match} />
        </div>
      )}
      {matchLoading && match === null && (
        <p className="sr-only" role="status">
          Caricamento prossima partita
        </p>
      )}
      {!matchLoading && matchError && match === null && (
        <p
          className="order-3 col-span-2 text-xs font-medium text-amber-700 sm:order-2 sm:col-span-1 sm:col-start-2 sm:justify-self-end dark:text-amber-400"
          role="alert"
        >
          Impossibile caricare la prossima partita
        </p>
      )}
    </header>
  )
}
