"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react"

import {
  columnsById,
  PersonIdentity,
  type ManagementColumn,
  type ManagementTableActions,
} from "@/components/management/managementColumns"
import type { PassportPhotoState } from "@/components/management/PassportPhotoPreview"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ManagementPerson } from "@/lib/management"
import {
  clampColumnWidth,
  DEFAULT_COLUMNS,
  type ManagementLayout,
  type ManagementView,
  type TableSort,
} from "@/lib/management-columns"
import { cn } from "@/lib/utils"

const RESIZE_KEY_STEP = 16

/**
 * Bordo destro trascinabile dell'intestazione. Frecce ←/→ per tastiera,
 * doppio clic per tornare alla larghezza automatica.
 */
function ColumnResizeHandle({
  label,
  width,
  onPreview,
  onCommit,
}: {
  label: string
  width: number | undefined
  onPreview: (width: number) => void
  onCommit: (width: number | null) => void
}) {
  const handleRef = useRef<HTMLSpanElement>(null)

  function headerWidth() {
    return (
      width ??
      handleRef.current?.parentElement?.getBoundingClientRect().width ??
      120
    )
  }

  return (
    <span
      aria-label={`Ridimensiona colonna ${label}`}
      aria-orientation="vertical"
      aria-valuenow={width ? Math.round(width) : undefined}
      className="absolute inset-y-1 right-0 w-2 cursor-col-resize touch-none rounded-sm after:absolute after:inset-y-1 after:right-0.5 after:w-px after:bg-border hover:bg-operative/20 focus-visible:bg-operative/30 focus-visible:outline-none"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onCommit(null)
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const step = event.key === "ArrowLeft" ? -RESIZE_KEY_STEP : RESIZE_KEY_STEP
        onCommit(clampColumnWidth(headerWidth() + step))
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startWidth = headerWidth()
        let latest = startWidth
        const target = event.currentTarget
        target.setPointerCapture(event.pointerId)
        const move = (moveEvent: PointerEvent) => {
          latest = clampColumnWidth(startWidth + moveEvent.clientX - startX)
          onPreview(latest)
        }
        const up = () => {
          target.removeEventListener("pointermove", move)
          target.removeEventListener("pointerup", up)
          target.removeEventListener("pointercancel", up)
          if (latest !== startWidth) onCommit(latest)
        }
        target.addEventListener("pointermove", move)
        target.addEventListener("pointerup", up)
        target.addEventListener("pointercancel", up)
      }}
      ref={handleRef}
      role="separator"
      tabIndex={0}
    />
  )
}

function SortIcon({
  sort,
  columnId,
}: {
  sort: TableSort
  columnId: string
}) {
  if (sort?.columnId !== columnId) {
    return <ChevronsUpDown aria-hidden="true" className="size-3 opacity-50" />
  }
  return sort.direction === "asc" ? (
    <ChevronUp aria-hidden="true" className="size-3" />
  ) : (
    <ChevronDown aria-hidden="true" className="size-3" />
  )
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      aria-label="Seleziona tutte le righe visibili"
      checked={checked}
      className="size-4 accent-operative"
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  )
}

export function ManagementTable({
  people,
  view = "PEOPLE",
  columns = DEFAULT_COLUMNS[view],
  layout = "TABLE",
  selected,
  sort = null,
  widths = {},
  onResizeColumn,
  onSortChange,
  onSelect,
  onSelectAllVisible,
  onOpen,
  onAccountAction,
  onVerifyPayment,
  onReviewCertificate,
  passportPhotoStates = new Map(),
}: {
  people: ManagementPerson[]
  view?: ManagementView
  columns?: string[]
  layout?: ManagementLayout
  selected: Set<string>
  sort?: TableSort
  /** Larghezze in px per colonna; assenti = automatiche. */
  widths?: Record<string, number>
  /** width null = torna automatica. */
  onResizeColumn?: (columnId: string, width: number | null) => void
  onSortChange?: (columnId: string) => void
  onSelect: (membershipId: string) => void
  onSelectAllVisible?: (checked: boolean) => void
  onOpen: (person: ManagementPerson) => void
  onAccountAction: ManagementTableActions["onAccountAction"]
  onVerifyPayment: ManagementTableActions["onVerifyPayment"]
  onReviewCertificate: ManagementTableActions["onReviewCertificate"]
  passportPhotoStates?: Map<string, PassportPhotoState>
}) {
  const visibleColumns = useMemo(
    () =>
      columns
        .map((id) => columnsById.get(id))
        .filter((column): column is ManagementColumn => Boolean(column)),
    [columns],
  )
  const actions = useMemo(
    () => ({ onAccountAction, onReviewCertificate, onVerifyPayment }),
    [onAccountAction, onReviewCertificate, onVerifyPayment],
  )
  // Nella card il ruolo è già sotto il nome: niente riga "Ruolo" duplicata.
  const cardFieldColumns = visibleColumns.filter(
    (column) =>
      column.id !== "person" && column.id !== "role" && !column.action,
  )
  const cardActionColumns = visibleColumns.filter((column) => column.action)
  // Durante il trascinamento la larghezza vive qui; si salva al rilascio.
  const [liveWidth, setLiveWidth] = useState<{
    columnId: string
    width: number
  } | null>(null)
  const widthOf = (columnId: string) =>
    liveWidth?.columnId === columnId ? liveWidth.width : widths[columnId]
  const widthStyle = (columnId: string) => {
    const width = widthOf(columnId)
    return width ? { width, minWidth: width, maxWidth: width } : undefined
  }
  const allVisibleSelected =
    people.length > 0 && people.every(({ id }) => selected.has(id))
  const someVisibleSelected = people.some(({ id }) => selected.has(id))

  return (
    <>
      {layout === "TABLE" && (
        <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
          <Table>
            <TableHeader className="bg-muted/90">
              <TableRow className="h-11">
                <TableHead className="w-10">
                  <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    onChange={(checked) => onSelectAllVisible?.(checked)}
                  />
                </TableHead>
                {visibleColumns.map((column) => (
                  <TableHead
                    aria-sort={
                      sort?.columnId === column.id
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "relative whitespace-nowrap",
                      column.id === "person" && !widthOf(column.id) && "min-w-56",
                    )}
                    key={column.id}
                    style={widthStyle(column.id)}
                  >
                    <button
                      className="inline-flex min-h-8 max-w-full items-center gap-1 overflow-hidden rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSortChange?.(column.id)}
                      type="button"
                    >
                      <span className="truncate">{column.label}</span>
                      <SortIcon columnId={column.id} sort={sort} />
                    </button>
                    {onResizeColumn && (
                      <ColumnResizeHandle
                        label={column.label}
                        onCommit={(width) => {
                          setLiveWidth(null)
                          onResizeColumn(column.id, width)
                        }}
                        onPreview={(width) =>
                          setLiveWidth({ columnId: column.id, width })
                        }
                        width={widthOf(column.id)}
                      />
                    )}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow
                  className="h-11 cursor-pointer transition-colors"
                  data-state={selected.has(person.id) ? "selected" : undefined}
                  key={person.id}
                  onClick={() => onOpen(person)}
                >
                  <TableCell>
                    <input
                      aria-label={`Seleziona ${person.nome} ${person.cognome}`}
                      checked={selected.has(person.id)}
                      className="size-4 accent-operative"
                      onChange={() => onSelect(person.id)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell
                      className={widthOf(column.id) ? "overflow-hidden" : undefined}
                      key={column.id}
                      style={widthStyle(column.id)}
                    >
                      {column.render(person, actions, passportPhotoStates)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(person)
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div
        className={cn(
          "grid gap-2",
          layout === "TABLE"
            ? "md:hidden"
            : "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {people.map((person) => {
          const availableActions = cardActionColumns.filter((column) =>
            column.actionable?.(person),
          )
          return (
            <article
              className={cn(
                "flex min-h-20 cursor-pointer gap-3 rounded-lg border bg-card p-3 shadow-xs",
                selected.has(person.id) && "border-operative bg-operative/5",
              )}
              key={person.id}
              onClick={() => onOpen(person)}
            >
              <label
                className="-m-2.5 grid size-11 shrink-0 cursor-pointer place-items-center"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  aria-label={`Seleziona ${person.nome} ${person.cognome}`}
                  checked={selected.has(person.id)}
                  className="size-5 accent-operative"
                  onChange={() => onSelect(person.id)}
                  type="checkbox"
                />
              </label>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  aria-label={`Apri scheda di ${person.nome} ${person.cognome}`}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  // Il click risale all'article, che apre la scheda.
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <PersonIdentity accessibleJersey={false} person={person} />
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </button>
                {cardFieldColumns.length > 0 && (
                  <dl className="grid gap-1">
                    {cardFieldColumns.map((column) => (
                      <div
                        className={cn(
                          "min-w-0 gap-2 text-xs",
                          column.wide
                            ? "grid"
                            : "flex items-center justify-between",
                        )}
                        key={column.id}
                      >
                        <dt className="shrink-0 text-muted-foreground">
                          {column.label}:
                        </dt>
                        <dd
                          className={cn(
                            "min-w-0 py-0.5",
                            column.wide
                              ? "overflow-x-auto overscroll-x-contain"
                              : "break-words text-right",
                          )}
                        >
                          {column.render(person, actions, passportPhotoStates)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {availableActions.length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
                    {availableActions.map((column) => (
                      <div key={column.id}>
                        {column.render(person, actions, passportPhotoStates)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {people.length === 0 && (
        <p className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          Nessuna persona corrisponde ai filtri.
        </p>
      )}
    </>
  )
}

export type { ManagementView } from "@/lib/management-columns"
