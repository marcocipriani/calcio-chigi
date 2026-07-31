"use client"

import { FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SEASON_OPTIONS,
  type PhaseFilter,
} from "@/lib/season-statistics"

type PhaseOption = {
  value: PhaseFilter
  label: string
}

function tournamentLabel(label: string) {
  return label.replace(/20(\d{2})\/20(\d{2})/, "20$1/$2")
}

export function TournamentSelector({
  seasonId,
  onSeasonChange,
  phase,
  onPhaseChange,
  phaseOptions,
}: {
  seasonId: string
  onSeasonChange: (seasonId: string) => void
  phase: PhaseFilter
  onPhaseChange: (phase: PhaseFilter) => void
  phaseOptions: readonly PhaseOption[]
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 sm:w-[280px]">
        <Label
          className="text-[10px] font-bold uppercase tracking-wider"
          htmlFor="tournament-selector"
        >
          Torneo
        </Label>
        <Select onValueChange={onSeasonChange} value={seasonId}>
          <SelectTrigger
            aria-label="Torneo"
            className="mt-1 w-full min-w-0"
            id="tournament-selector"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEASON_OPTIONS.map((season) => (
              <SelectItem key={season.slug} value={season.slug}>
                {tournamentLabel(season.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 sm:w-[220px]">
        <Label
          className="text-[10px] font-bold uppercase tracking-wider"
          htmlFor="phase-selector"
        >
          Fase
        </Label>
        <Select
          onValueChange={(value) => onPhaseChange(value as PhaseFilter)}
          value={phase}
        >
          <SelectTrigger
            aria-label="Fase"
            className="mt-1 w-full min-w-0"
            id="phase-selector"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {phaseOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function CommunicationsAction(): React.JSX.Element {
  return (
    <Button
      aria-label="Comunicati"
      className="h-11 w-11 rounded-full sm:h-9 sm:w-auto sm:rounded-md sm:px-3"
      size="icon"
      title="Comunicati"
      variant="outline"
    >
      <FileText aria-hidden="true" className="h-5 w-5" />
      <span className="hidden sm:inline">Comunicati</span>
    </Button>
  )
}
