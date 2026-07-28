"use client"

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
  onOpenPlayground,
  onOpenOfficial,
}: {
  isManager: boolean
  match: NextMatchSummary | null
  onOpenPlayground: () => void
  onOpenOfficial: () => void
}): React.JSX.Element {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
        Squadra
      </h1>

      <div className="order-2 flex items-center gap-1.5 sm:order-3 sm:col-start-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Crea la tua formazione"
              className="size-9 px-0 sm:h-8 sm:w-auto sm:px-3"
              onClick={onOpenPlayground}
              size="sm"
              variant="outline"
            >
              <ClipboardList aria-hidden="true" />
              <span className="hidden sm:inline">Crea la tua formazione</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">
            Crea la tua formazione
          </TooltipContent>
        </Tooltip>

        {isManager && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  aria-label="Pubblica formazione"
                  className="size-9 bg-violet-600 px-0 text-white hover:bg-violet-700 sm:h-8 sm:w-auto sm:px-3"
                  disabled={match === null}
                  onClick={onOpenOfficial}
                  size="sm"
                >
                  <Radio aria-hidden="true" />
                  <span className="hidden sm:inline">Pubblica formazione</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              {match === null
                ? "Nessuna prossima partita"
                : "Pubblica formazione"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {match && (
        <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1 sm:col-start-2 sm:justify-self-end">
          <NextMatchCapsule match={match} />
        </div>
      )}
    </header>
  )
}
