"use client"

import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { moveColumn } from "@/lib/management-columns"

export type AvailableManagementColumn = {
  id: string
  label: string
  required?: boolean
}

export function ColumnCustomizer({
  columns,
  availableColumns,
  onChange,
  onReset,
}: {
  columns: string[]
  availableColumns: AvailableManagementColumn[]
  onChange: (columns: string[]) => void
  onReset: () => void
}) {
  const availableById = new Map(
    availableColumns.map((column) => [column.id, column]),
  )

  function toggle(column: AvailableManagementColumn) {
    if (column.required) return
    onChange(
      columns.includes(column.id)
        ? columns.filter((id) => id !== column.id)
        : [...columns, column.id],
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3 aria-hidden="true" />
          Colonne
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Colonne visibili</strong>
          <Button
            aria-label="Ripristina colonne"
            onClick={onReset}
            size="icon-sm"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-1">
          {columns.map((id, index) => {
            const column = availableById.get(id)
            if (!column) return null
            return (
              <div
                className="flex min-h-9 items-center gap-2 rounded-md px-1 hover:bg-muted"
                key={id}
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input
                    aria-label={column.label}
                    checked
                    className="size-4 accent-primary"
                    disabled={column.required}
                    onChange={() => toggle(column)}
                    type="checkbox"
                  />
                  <span className="truncate">{column.label}</span>
                </label>
                <Button
                  aria-label={`Sposta ${column.label} in alto`}
                  disabled={index === 0}
                  onClick={() => onChange(moveColumn(columns, id, -1))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  aria-label={`Sposta ${column.label} in basso`}
                  disabled={index === columns.length - 1}
                  onClick={() => onChange(moveColumn(columns, id, 1))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
              </div>
            )
          })}
          {availableColumns
            .filter((column) => !columns.includes(column.id))
            .map((column) => (
              <label
                className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm hover:bg-muted"
                key={column.id}
              >
                <input
                  aria-label={column.label}
                  checked={false}
                  className="size-4 accent-primary"
                  onChange={() => toggle(column)}
                  type="checkbox"
                />
                <span className="truncate">{column.label}</span>
              </label>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
