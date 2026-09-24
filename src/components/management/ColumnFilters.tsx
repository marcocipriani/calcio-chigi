"use client"

import { ArrowUpDown, FilterX, ListFilter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { ManagementColumnMeta } from "@/components/management/ManagementTable"
import type {
  ManagementColumnFilters,
  TableSort,
} from "@/lib/management-columns"

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Filtri di colonna della vista corrente: un solo posto, valido sia per
 * l’elenco sia per le schede.
 */
export function ColumnFilters({
  columns,
  values,
  onChange,
  onReset,
  disabled = false,
}: {
  columns: ManagementColumnMeta[]
  values: ManagementColumnFilters
  onChange: (columnId: string, value: string) => void
  onReset: () => void
  disabled?: boolean
}) {
  const activeCount = columns.filter(({ id }) => values[id]).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={
            activeCount ? `Filtri (${activeCount} attivi)` : "Filtri"
          }
          className="shrink-0 px-2"
          disabled={disabled || columns.length === 0}
          size="sm"
          variant={activeCount ? "default" : "outline"}
        >
          <ListFilter aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">Filtri</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-[10px] tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm">Filtri della vista</strong>
          <Button
            disabled={!activeCount}
            onClick={onReset}
            size="sm"
            variant="ghost"
          >
            <FilterX aria-hidden="true" />
            Azzera
          </Button>
        </div>

        <div className="space-y-2">
          {columns.map((column) => {
            const controlId = `management-filter-${column.id}`
            return (
              <div className="space-y-1" key={column.id}>
                <Label className="text-xs" htmlFor={controlId}>
                  {column.label}
                </Label>
                {column.filterOptions ? (
                  <select
                    aria-label={`Filtra ${column.label}`}
                    className={selectClass}
                    id={controlId}
                    onChange={(event) =>
                      onChange(column.id, event.target.value)
                    }
                    value={values[column.id] ?? ""}
                  >
                    {column.filterOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    aria-label={`Filtra ${column.label}`}
                    className="h-9"
                    id={controlId}
                    onChange={(event) =>
                      onChange(column.id, event.target.value)
                    }
                    placeholder="Filtra…"
                    value={values[column.id] ?? ""}
                  />
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Ordinamento esplicito per la vista a schede, dove non ci sono intestazioni. */
export function SortControl({
  columns,
  sort,
  onChange,
  className,
}: {
  columns: ManagementColumnMeta[]
  sort: TableSort
  onChange: (sort: TableSort) => void
  className?: string
}) {
  const value = sort ? `${sort.columnId}:${sort.direction}` : ""

  // Select nativo trasparente sopra l'icona: compatto, ma resta il picker di
  // sistema (accessibile e comodo su telefono).
  return (
    <label
      className={cn(
        "relative grid size-8 place-items-center rounded-md border focus-within:ring-2 focus-within:ring-ring",
        sort && "border-operative text-operative",
        className,
      )}
    >
      <ArrowUpDown aria-hidden="true" className="size-4" />
      <select
        aria-label="Ordina risultati"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(event) => {
          const [columnId, direction] = event.target.value.split(":")
          onChange(
            columnId
              ? { columnId, direction: direction === "desc" ? "desc" : "asc" }
              : null,
          )
        }}
        value={value}
      >
        <option value="">Ordine predefinito</option>
        {columns.flatMap((column) => [
          <option key={`${column.id}:asc`} value={`${column.id}:asc`}>
            {column.label} ↑
          </option>,
          <option key={`${column.id}:desc`} value={`${column.id}:desc`}>
            {column.label} ↓
          </option>,
        ])}
      </select>
    </label>
  )
}
