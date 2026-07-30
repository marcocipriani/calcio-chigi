"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarRange,
  ChartNoAxesCombined,
  Shirt,
  Trophy,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Calendario', icon: CalendarRange },
    { href: '/squadra', label: 'Squadra', icon: Shirt },
    { href: '/torneo', label: 'Torneo', icon: Trophy },
    { href: '/statistiche', label: 'Statistiche', icon: ChartNoAxesCombined },
  ]

  return (
    <nav className="bottom-nav-safe fixed inset-x-2 z-40 rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur-md md:inset-x-auto md:right-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-around md:max-w-none">
        {links.map(({ href, label, icon: Icon }) => {
          // Logica attiva: Home esatta oppure sottopagina (es. /torneo/classifica)
          const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          
          return (
            <Link 
              aria-current={isActive ? "page" : undefined}
              key={href} 
              href={href} 
              className={cn(
                "group flex h-full min-w-0 w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-1 text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-200 active:scale-95 md:w-24",
                isActive
                  ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700"
                  : "hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/50 dark:hover:text-violet-200",
              )}
            >
              <span
                className={cn(
                  "relative rounded-lg p-1 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5",
                  isActive && "motion-safe:-translate-y-0.5 motion-safe:scale-105",
                )}
              >
                <Icon 
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={2}
                />
              </span>
              <span className="text-[10px] font-bold leading-none">
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
