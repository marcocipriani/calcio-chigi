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
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
      <div className="min-w-0">
        <h1 className="text-balance break-words text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-pretty text-sm font-medium text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div
          aria-label="Azioni pagina"
          role="group"
          className="order-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end lg:order-3 lg:col-start-3"
        >
          {actions}
        </div>
      )}

      {context && (
        <div className="order-3 col-span-2 min-w-0 lg:order-2 lg:col-span-1 lg:col-start-2">
          {context}
        </div>
      )}

      {filters && (
        <div
          aria-label="Filtri pagina"
          role="group"
          className="order-4 col-span-2 min-w-0 lg:col-span-3"
        >
          {filters}
        </div>
      )}
    </header>
  )
}
