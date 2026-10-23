"use client"

import { useState } from "react"
import { ArrowLeftRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { CardIcon } from "./MatchIcons"
import { MatchPlayerAvatar } from "./MatchPlayerAvatar"
import { roleShort, sameRoleFirst, type MatchPlayer } from "./players"

type Step = "ACTIONS" | "ASSIST" | "SECOND_YELLOW" | "SUB"

/** Azioni sul giocatore toccato: goal (poi assist), cartellini, cambio. */
export function PlayerActionDialog({
  player,
  minute,
  yellows,
  fieldMates,
  bench,
  onClose,
  onGoal,
  onYellow,
  onRed,
  onSub,
}: {
  player: MatchPlayer | null
  minute: string
  yellows: number
  fieldMates: MatchPlayer[]
  bench: MatchPlayer[]
  onClose: () => void
  onGoal: (assistId: string | null) => void
  onYellow: (expel: boolean) => void
  onRed: () => void
  onSub: (inId: string) => void
}) {
  const [step, setStep] = useState<Step>("ACTIONS")

  function close() {
    setStep("ACTIONS")
    onClose()
  }
  function done(action: () => void) {
    action()
    close()
  }

  const big = "h-14 flex-1 text-base font-black"

  return (
    <Dialog open={Boolean(player)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto rounded-xl">
        {player && (
          <>
            <DialogHeader>
              <DialogTitle>
                {player.cognome} · {roleShort(player.role)} · {minute}
              </DialogTitle>
              <DialogDescription>
                {step === "ACTIONS" && "Cosa è successo?"}
                {step === "ASSIST" && "Chi ha fatto l’assist?"}
                {step === "SECOND_YELLOW" && "Secondo giallo: espulso?"}
                {step === "SUB" && "Chi entra al suo posto?"}
              </DialogDescription>
            </DialogHeader>

            {step === "ACTIONS" && (
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <Button className={big} onClick={() => setStep("ASSIST")}>
                    <span aria-hidden="true">⚽</span> Goal
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    className={big}
                    onClick={() => (yellows >= 1 ? setStep("SECOND_YELLOW") : done(() => onYellow(false)))}
                    variant="outline"
                  >
                    <CardIcon className="h-5 w-3.5" /> Giallo
                  </Button>
                  <Button className={big} onClick={() => done(onRed)} variant="outline">
                    <CardIcon className="h-5 w-3.5" red /> Rosso
                  </Button>
                </div>
                <Button className={big} disabled={bench.length === 0} onClick={() => setStep("SUB")} variant="outline">
                  <ArrowLeftRight aria-hidden="true" /> Cambio
                </Button>
              </div>
            )}

            {step === "ASSIST" && (
              <div className="grid gap-3">
                <Button className="h-12 font-black" onClick={() => done(() => onGoal(null))}>
                  Nessun assist
                </Button>
                <div className="flex flex-wrap justify-center gap-x-1 gap-y-2">
                  {fieldMates.map((mate) => (
                    <MatchPlayerAvatar key={mate.id} onClick={() => done(() => onGoal(mate.id))} player={mate} />
                  ))}
                </div>
              </div>
            )}

            {step === "SECOND_YELLOW" && (
              <div className="flex gap-2">
                <Button className={big} onClick={() => done(() => onYellow(true))} variant="destructive">
                  <CardIcon red /> Espulso
                </Button>
                <Button className={big} onClick={() => done(() => onYellow(false))} variant="outline">
                  Solo giallo
                </Button>
              </div>
            )}

            {step === "SUB" && (
              <div className="flex flex-wrap justify-center gap-x-1 gap-y-2">
                {[...bench].sort(sameRoleFirst(player.role)).map((substitute) => (
                  <MatchPlayerAvatar key={substitute.id} onClick={() => done(() => onSub(substitute.id))} player={substitute} />
                ))}
              </div>
            )}

            {step !== "ACTIONS" && (
              <Button onClick={() => setStep("ACTIONS")} variant="ghost">
                Indietro
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
