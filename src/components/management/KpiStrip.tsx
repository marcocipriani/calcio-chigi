import {
  BadgeEuro,
  CircleUserRound,
  FileCheck2,
  HeartPulse,
  UserRoundCheck,
  UsersRound,
} from "lucide-react"

import type { ManagementView } from "@/components/management/ManagementTable"
import { managementKpis, type ManagementPerson } from "@/lib/management"
import { cn } from "@/lib/utils"

export function KpiStrip({
  people,
  activeView,
  onViewChange,
}: {
  people: ManagementPerson[]
  activeView: ManagementView
  onViewChange: (view: ManagementView) => void
}) {
  const kpis = managementKpis(people)
  const items: {
    label: string
    value: number
    icon: typeof UsersRound
    view: ManagementView
    alert?: boolean
  }[] = [
    {
      label: "Persone",
      value: kpis.total,
      icon: UsersRound,
      view: "ROSTER",
    },
    {
      label: "Conferme",
      value: kpis.confirmationsPending,
      icon: UserRoundCheck,
      view: "ROSTER",
      alert: kpis.confirmationsPending > 0,
    },
    {
      label: "Tesseramenti",
      value: kpis.registrationsOpen,
      icon: FileCheck2,
      view: "REGISTRATIONS",
      alert: kpis.registrationsOpen > 0,
    },
    {
      label: "Quote",
      value: kpis.paymentsOpen,
      icon: BadgeEuro,
      view: "PAYMENTS",
      alert: kpis.paymentsOpen > 0,
    },
    {
      label: "Certificati",
      value: kpis.certificatesOpen,
      icon: HeartPulse,
      view: "CERTIFICATES",
      alert: kpis.certificatesOpen > 0,
    },
    {
      label: "Account",
      value: kpis.accountsOpen,
      icon: CircleUserRound,
      view: "ACCOUNTS",
      alert: kpis.accountsOpen > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {items.map(({ label, value, icon: Icon, view, alert }) => (
        <button
          aria-pressed={activeView === view}
          className={cn(
            "group flex min-h-16 items-center gap-3 rounded-lg border bg-card px-3 text-left shadow-xs transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
            activeView === view && "border-primary bg-primary/5",
          )}
          key={label}
          onClick={() => onViewChange(view)}
          type="button"
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
              activeView === view && "bg-primary/10 text-primary",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <strong className="text-lg leading-none tabular-nums">
                {value}
              </strong>
              {alert && (
                <span
                  aria-label="Richiede attenzione"
                  className="size-1.5 rounded-full bg-amber-500"
                />
              )}
            </span>
            <span className="mt-1 block truncate text-[11px] font-medium text-muted-foreground">
              {label}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
