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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe shadow-sm backdrop-blur-md md:inset-x-auto md:right-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:rounded-full md:border md:p-1 md:pb-1 md:shadow-md">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around md:h-14 md:max-w-none">
        {links.map(({ href, label, icon: Icon }) => {
          // Logica attiva: Home esatta oppure sottopagina (es. /torneo/classifica)
          const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          
          return (
            <Link 
              aria-current={isActive ? "page" : undefined}
              key={href} 
              href={href} 
              className={cn(
                "group flex h-full w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-1 text-muted-foreground transition-[color,background-color,transform] duration-200 active:scale-95 md:w-24",
                isActive
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                  : "hover:bg-accent hover:text-accent-foreground",
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
                  className="size-5.5"
                  strokeWidth={isActive ? 2.35 : 2}
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
