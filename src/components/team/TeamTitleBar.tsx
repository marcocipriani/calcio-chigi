"use client"

import { useId } from "react"
import { ClipboardList, Radio } from "lucide-react"

import {
  NextMatchCapsule,
  type NextMatchSummary,
} from "@/components/formations/NextMatchCapsule"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
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

  const actions = (
    <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Crea la tua formazione"
              className="size-11 rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
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
                  className="size-11 rounded-full bg-violet-600 px-0 text-white hover:bg-violet-700 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
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
    </>
  )

  const context = match ? (
    <NextMatchCapsule match={match} />
  ) : matchLoading ? (
    <p className="sr-only" role="status">
      Caricamento prossima partita
    </p>
  ) : matchError ? (
    <p
      className="text-xs font-medium text-amber-700 dark:text-amber-400"
      role="alert"
    >
      Impossibile caricare la prossima partita
    </p>
  ) : null

  return (
    <PageTitleBar
      actions={actions}
      context={context}
      subtitle="Stagione in corso"
      title="Squadra"
    />
  )
}
