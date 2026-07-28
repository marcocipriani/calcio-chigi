"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type TournamentOption = {
  id: string
  label: string
}

export const TOURNAMENTS: readonly TournamentOption[] = [
  {
    id: "asi-over35-2025-2026",
    label: "Campionato ASI Over35 2025/2026",
  },
] as const

export function TournamentSelector({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <Label
        className="text-[10px] font-bold uppercase tracking-wider"
        htmlFor="tournament-selector"
      >
        Torneo
      </Label>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-label="Torneo"
          className="mt-1 w-full sm:w-[320px]"
          id="tournament-selector"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TOURNAMENTS.map((tournament) => (
            <SelectItem key={tournament.id} value={tournament.id}>
              {tournament.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
