import type { ReactNode } from "react"

type PageTitleBarProps = {
  title: string
  subtitle?: ReactNode
  context?: ReactNode
  actions?: ReactNode
  filters?: ReactNode
}

export function PageTitleBar({
  title,
  subtitle,
  context,
  actions,
  filters,
}: PageTitleBarProps): React.JSX.Element {
  return (
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <h1 className="truncate text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && (
          <p className="truncate text-sm font-medium text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div
          aria-label="Azioni pagina"
          className="order-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:order-3 sm:col-start-3 sm:justify-end"
        >
          {actions}
        </div>
      )}

      {context && (
        <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1 sm:col-start-2">
          {context}
        </div>
      )}

      {filters && (
        <div
          aria-label="Filtri pagina"
          className="order-4 col-span-2 min-w-0 sm:col-span-3"
        >
          {filters}
        </div>
      )}
    </header>
  )
}
