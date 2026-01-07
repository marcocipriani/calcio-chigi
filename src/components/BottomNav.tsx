"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Users, Trophy } from 'lucide-react'

export function BottomNav() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Calendario', icon: CalendarDays },
    { href: '/squadra', label: 'Rosa', icon: Users },
    { href: '/torneo', label: 'Torneo', icon: Trophy },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe z-40 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {links.map(({ href, label, icon: Icon }) => {
          // Logica attiva: Home esatta oppure sottopagina (es. /torneo/classifica)
          const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          
          return (
            <Link 
              key={href} 
              href={href} 
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-95 group`}
            >
              <div className={`
                relative p-1.5 rounded-xl transition-all duration-300
                ${isActive 
                    ? 'text-primary bg-primary/10 dark:bg-primary/20 translate-y-0' 
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }
              `}>
                <Icon 
                    className={`h-6 w-6 ${isActive ? 'fill-current' : ''}`} 
                    strokeWidth={isActive ? 2.5 : 2} 
                />
              </div>
              <span className={`
                text-[10px] font-bold transition-all duration-300
                ${isActive 
                    ? 'text-primary scale-100 opacity-100' 
                    : 'text-slate-400 scale-90 opacity-80'
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