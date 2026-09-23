"use client"

import { useState, type FormEvent } from "react"
import { ArrowDown, ArrowUp, Ban, Loader2, Plus, Save, X } from "lucide-react"

import { playerShortName } from "@/components/jersey/JerseyBoard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { JerseyBoardRow } from "@/lib/jersey-api"
import {
  isValidJerseyNumber,
  JERSEY_LEVEL_LABEL,
  MAX_AVOIDED_NUMBERS,
  MAX_JERSEY_CHOICES,
  validateJerseyPreferences,
  type JerseyChoice,
  type JerseyLevel,
} from "@/lib/jersey-numbers"
import { cn } from "@/lib/utils"

type DraftChoice = { value: string; level: JerseyLevel }

function toDraft(choices: JerseyChoice[]): DraftChoice[] {
  return choices.map(({ number, level }) => ({ value: String(number), level }))
}

function toChoices(draft: DraftChoice[]): JerseyChoice[] {
  return draft.map(({ value, level }) => ({ number: Number(value), level }))
}

export function JerseyPreferencesForm({
  initialChoices,
  initialNoPreference,
  initialAvoidNumbers,
  suggestedFromPreviousSeason,
  others,
  onSave,
}: {
  initialChoices: JerseyChoice[]
  initialNoPreference: boolean
  initialAvoidNumbers: number[]
  suggestedFromPreviousSeason: boolean
  others: JerseyBoardRow[]
  onSave: (
    choices: JerseyChoice[],
    avoidNumbers: number[],
    noPreference: boolean,
  ) => Promise<void>
}) {
  const [choices, setChoices] = useState(() => toDraft(initialChoices))
  const [noPreference, setNoPreference] = useState(initialNoPreference)
  const [avoidNumbers, setAvoidNumbers] = useState(initialAvoidNumbers)
  const [avoidInput, setAvoidInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function updateChoice(index: number, patch: Partial<DraftChoice>) {
    setChoices((current) =>
      current.map((choice, position) =>
        position === index ? { ...choice, ...patch } : choice,
      ),
    )
  }

  function moveChoice(index: number, offset: -1 | 1) {
    setChoices((current) => {
      const next = [...current]
      const [choice] = next.splice(index, 1)
      next.splice(index + offset, 0, choice)
      return next
    })
  }

  function addAvoidNumber() {
    const number = Number(avoidInput)
    if (!avoidInput || !isValidJerseyNumber(number)) {
      setError("I numeri vanno da 1 a 99")
      return
    }
    if (avoidNumbers.length >= MAX_AVOIDED_NUMBERS) {
      setError(`Puoi escludere al massimo ${MAX_AVOIDED_NUMBERS} numeri`)
      return
    }
    setError(null)
    setAvoidNumbers((current) =>
      current.includes(number)
        ? current
        : [...current, number].sort((left, right) => left - right),
    )
    setAvoidInput("")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextChoices = toChoices(choices)
    const validation = validateJerseyPreferences(
      nextChoices,
      avoidNumbers,
      noPreference,
    )
    setError(validation)
    if (validation) return

    setSaving(true)
    try {
      await onSave(nextChoices, avoidNumbers, noPreference)
    } finally {
      setSaving(false)
    }
  }

  function othersWanting(value: string) {
    const number = Number(value)
    if (!isValidJerseyNumber(number)) return []
    return others.flatMap((row) => {
      const choice = row.choices.find((candidate) => candidate.number === number)
      return choice ? [{ row, level: choice.level }] : []
    })
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50 dark:has-[:checked]:border-violet-800 dark:has-[:checked]:bg-violet-950/40">
        <input
          checked={noPreference}
          className="mt-0.5 size-4 shrink-0 accent-violet-600"
          onChange={(event) => {
            setNoPreference(event.target.checked)
            setError(null)
          }}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold">Non ho preferenze</span>
          <span className="block text-xs text-muted-foreground">
            Ti verrà proposto il numero libero più basso che nessuno ha scelto,
            evitando quelli che escludi qui sotto.
          </span>
        </span>
      </label>

      <fieldset className="space-y-2" hidden={noPreference}>
        <legend className="text-sm font-bold">
          I tuoi numeri, in ordine di preferenza
        </legend>
        <p className="text-xs text-muted-foreground">
          Fino a {MAX_JERSEY_CHOICES} numeri da 1 a 99, almeno uno preferito.
          {suggestedFromPreviousSeason &&
            " Abbiamo proposto il numero della scorsa stagione: nessuna priorità, puoi cambiarlo."}
        </p>

        <ol className="space-y-2">
          {choices.map((choice, index) => {
            const inputId = `jersey-choice-${index}`
            const contenders = othersWanting(choice.value)
            return (
              <li className="rounded-lg border p-2" key={index}>
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    className="w-7 shrink-0 text-xs font-black text-muted-foreground"
                    htmlFor={inputId}
                  >
                    {index + 1}ª
                  </Label>
                  <Input
                    aria-label={`Numero ${index + 1}ª scelta`}
                    className="h-11 w-20 text-center text-lg font-black tabular-nums"
                    id={inputId}
                    inputMode="numeric"
                    max={99}
                    min={1}
                    onChange={(event) =>
                      updateChoice(index, {
                        value: event.target.value.replace(/\D/g, "").slice(0, 2),
                      })
                    }
                    placeholder="—"
                    value={choice.value}
                  />
                  <div
                    aria-label={`Livello ${index + 1}ª scelta`}
                    className="grid grid-cols-2 rounded-md border p-0.5"
                    role="radiogroup"
                  >
                    {(["PREFERRED", "ACCEPTABLE"] as const).map((level) => (
                      <button
                        aria-checked={choice.level === level}
                        className={cn(
                          "min-h-10 rounded-sm px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          choice.level === level
                            ? "bg-violet-600 text-white"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                        key={level}
                        onClick={() => updateChoice(index, { level })}
                        role="radio"
                        type="button"
                      >
                        {JERSEY_LEVEL_LABEL[level]}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center">
                    <Button
                      aria-label="Sposta su"
                      className="size-10"
                      disabled={index === 0}
                      onClick={() => moveChoice(index, -1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label="Sposta giù"
                      className="size-10"
                      disabled={index === choices.length - 1}
                      onClick={() => moveChoice(index, 1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label="Rimuovi numero"
                      className="size-10"
                      onClick={() =>
                        setChoices((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {contenders.length > 0 && (
                  <p className="mt-1.5 pl-9 text-xs text-muted-foreground">
                    Lo vogliono anche:{" "}
                    {contenders
                      .map(
                        ({ row, level }) =>
                          `${playerShortName(row)} (${JERSEY_LEVEL_LABEL[level].toLowerCase()})`,
                      )
                      .join(", ")}
                  </p>
                )}
              </li>
            )
          })}
        </ol>

        {choices.length < MAX_JERSEY_CHOICES && (
          <Button
            className="w-full gap-2"
            onClick={() =>
              setChoices((current) => [
                ...current,
                {
                  value: "",
                  level: current.some(({ level }) => level === "PREFERRED")
                    ? "ACCEPTABLE"
                    : "PREFERRED",
                },
              ])
            }
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Aggiungi numero
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-bold">
          <Ban aria-hidden="true" className="size-4 text-muted-foreground" />
          Numeri che non vorresti
        </legend>
        <p className="text-xs text-muted-foreground">
          Facoltativo, visibili solo a te e ai manager.
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Numero da evitare"
            className="h-10 w-24 text-center tabular-nums"
            inputMode="numeric"
            onChange={(event) =>
              setAvoidInput(event.target.value.replace(/\D/g, "").slice(0, 2))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addAvoidNumber()
              }
            }}
            placeholder="es. 13"
            value={avoidInput}
          />
          <Button onClick={addAvoidNumber} type="button" variant="outline">
            Escludi
          </Button>
        </div>
        {avoidNumbers.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {avoidNumbers.map((number) => (
              <li key={number}>
                <button
                  aria-label={`Togli ${number} dai numeri da evitare`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    setAvoidNumbers((current) =>
                      current.filter((candidate) => candidate !== number),
                    )
                  }
                  type="button"
                >
                  {number}
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button className="w-full gap-2" disabled={saving} type="submit">
        {saving ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Save aria-hidden="true" />
        )}
        Salva preferenze
      </Button>
    </form>
  )
}
