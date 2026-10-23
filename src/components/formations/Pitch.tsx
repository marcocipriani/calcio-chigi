import type { ReactNode } from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"

/** Campo verde 3:4 con le linee: lo usano builder formazione e modalità partita. */
export function Pitch({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-full max-w-[450px] mx-auto aspect-[3/4] bg-gradient-to-b from-green-600 via-green-600 to-green-700 rounded-lg overflow-hidden shadow-2xl border-[3px] border-white/20 ring-1 ring-black/10", className)}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, #000 39px, #000 40px)' }}></div>
      <div className="absolute inset-4 border-2 border-white/60 rounded-sm pointer-events-none"></div>
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/60 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/60 rounded-full bg-green-600/0 pointer-events-none"></div>
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-t-0 border-white/60 bg-white/5 pointer-events-none"></div>
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 h-[15%] border-2 border-b-0 border-white/60 bg-white/5 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
        <Image src="/brand/logos/logo-circolo-chigi-mark.webp?v=2" alt="Logo Circolo Chigi" width={128} height={128} className="h-32 w-32 object-contain" />
      </div>
      {children}
    </div>
  )
}
