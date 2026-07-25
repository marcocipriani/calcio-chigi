"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarDays, Trophy, Users } from 'lucide-react'

export function BottomNav() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Calendario', icon: CalendarDays },
    { href: '/squadra', label: 'Squadra', icon: Users },
    { href: '/torneo', label: 'Torneo', icon: Trophy },
    { href: '/statistiche', label: 'Statistiche', icon: BarChart3 },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe z-40 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {links.map(({ href, label, icon: Icon }) => {
          // Logica attiva: Home esatta oppure sottopagina (es. /torneo/classifica)
          const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          
          return (
            <Link 
              aria-current={isActive ? "page" : undefined}
              key={href} 
              href={href} 
              className="group flex h-full w-full touch-manipulation flex-col items-center justify-center gap-1 transition-transform duration-200 active:scale-95"
            >
              <div className={`
                relative p-1.5 rounded-xl transition-[color,background-color,transform] duration-300
                ${isActive 
                    ? 'text-primary bg-primary/10 dark:bg-primary/20 translate-y-0' 
                    : 'text-slate-600 group-hover:text-slate-800 dark:text-slate-300 dark:group-hover:text-white'
                }
              `}>
                <Icon 
                    aria-hidden="true"
                    className={`h-6 w-6 ${isActive ? 'fill-current' : ''}`} 
                    strokeWidth={isActive ? 2.5 : 2} 
                />
              </div>
              <span className={`
                text-[10px] font-bold transition-[color,opacity,transform] duration-300
                ${isActive 
                    ? 'text-primary scale-100 opacity-100' 
                    : 'text-slate-600 scale-90 dark:text-slate-300'
                }
              `}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
