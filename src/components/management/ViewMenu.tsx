"use client"

import { useState, type FormEvent } from "react"
import {
  LayoutGrid,
  Plus,
  RotateCcw,
  Rows3,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { ManagementLayout } from "@/lib/management-columns"
import { cn } from "@/lib/utils"

const layouts = [
  { id: "TABLE", label: "Vista elenco", icon: Rows3 },
  { id: "CARDS", label: "Vista schede", icon: LayoutGrid },
] satisfies Array<{ id: ManagementLayout; label: string; icon: typeof Rows3 }>

/**
 * Impostazioni della vista attiva: disposizione, salvataggio come nuova vista
 * e, a seconda del tipo, rinomina/elimina (personalizzate) o ripristina
 * (predefinite, che non si possono eliminare).
 */
export function ViewMenu({
  viewLabel,
  custom,
  layout,
  disabled = false,
  onLayoutChange,
  onCreate,
  onRename,
  onDelete,
  onReset,
}: {
  viewLabel: string
  custom: boolean
  layout: ManagementLayout
  disabled?: boolean
  onLayoutChange: (layout: ManagementLayout) => void
  onCreate: (label: string) => void
  onRename: (label: string) => void
  onDelete: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [rename, setRename] = useState(viewLabel)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setRename(viewLabel)
      setNewLabel("")
      setConfirmDelete(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    onCreate(label)
    setOpen(false)
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = rename.trim()
    if (!label || label === viewLabel) return
    onRename(label)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Impostazioni vista"
          className="shrink-0 px-2"
          disabled={disabled}
          size="sm"
          variant="outline"
        >
          <SlidersHorizontal aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">Vista</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1.5">
          <strong className="block text-sm">{viewLabel}</strong>
          <div
            aria-label="Disposizione risultati"
            className="grid grid-cols-2 gap-1 rounded-md border p-0.5"
            role="group"
          >
            {layouts.map((item) => (
              <button
                aria-label={item.label}
                aria-pressed={layout === item.id}
                className={cn(
                  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  layout === item.id
                    ? "bg-operative text-operative-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
                key={item.id}
                onClick={() => onLayoutChange(item.id)}
                type="button"
              >
                <item.icon aria-hidden="true" className="size-4" />
                {item.id === "TABLE" ? "Elenco" : "Schede"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sul telefono i risultati sono sempre a schede.
          </p>
        </div>

        {custom ? (
          <div className="space-y-2 border-t pt-3">
            <form className="space-y-1.5" onSubmit={submitRename}>
              <Label htmlFor="view-rename">Nome della vista</Label>
              <div className="flex gap-1.5">
                <Input
                  className="h-8"
                  id="view-rename"
                  maxLength={40}
                  onChange={(event) => setRename(event.target.value)}
                  value={rename}
                />
                <Button
                  disabled={!rename.trim() || rename.trim() === viewLabel}
                  size="sm"
                  type="submit"
                  variant="outline"
                >
                  Rinomina
                </Button>
              </div>
            </form>
            <Button
              className={cn(
                "w-full",
                confirmDelete &&
                  "bg-destructive text-white hover:bg-destructive/90",
              )}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                onDelete()
                setOpen(false)
              }}
              size="sm"
              variant={confirmDelete ? "default" : "outline"}
            >
              <Trash2 aria-hidden="true" />
              {confirmDelete ? "Conferma eliminazione" : "Elimina vista"}
            </Button>
          </div>
        ) : (
          <div className="border-t pt-3">
            <Button
              className="w-full"
              onClick={() => {
                onReset()
                setOpen(false)
              }}
              size="sm"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" />
              Ripristina predefinita
            </Button>
          </div>
        )}

        <form className="space-y-1.5 border-t pt-3" onSubmit={create}>
          <Label htmlFor="view-new">Salva come nuova vista</Label>
          <p className="text-[11px] text-muted-foreground">
            Parte da colonne, filtri, ordine e disposizione attuali.
          </p>
          <div className="flex gap-1.5">
            <Input
              className="h-8"
              id="view-new"
              maxLength={40}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Es. Da contattare"
              value={newLabel}
            />
            <Button
              className="bg-operative text-operative-foreground hover:bg-operative/90"
              disabled={!newLabel.trim()}
              size="sm"
              type="submit"
            >
              <Plus aria-hidden="true" />
              Crea
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
