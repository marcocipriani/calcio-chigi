"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { Sun, Moon, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createBrowserClient } from '@supabase/ssr'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function SiteHeader() {
  const { setTheme, theme } = useTheme()
  const [profile, setProfile] = useState<any>(null)
  const [hasSession, setHasSession] = useState(false) 
  const [mounted, setMounted] = useState(false)

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  ), [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        setHasSession(true)
        
        const { data } = await supabase
          .from('profiles')
          .select('nome, cognome, avatar_url')
          .eq('user_id', user.id)
          .single()
        
        if (data) {
          setProfile(data)
        }
      }
    }
    loadData()
  }, [supabase])

  const profileLink = (profile || hasSession) ? "/profilo" : "/login"

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-16 shadow-sm">
      <div className="container mx-auto h-full px-4 flex items-center justify-between max-w-md">
        
        <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform">
            <div className="h-10 w-10 relative">
                <img 
                    src="/icon.png" 
                    alt="Logo Circolo Chigi" 
                    className="object-contain h-full w-full" 
                />
            </div>
            <div className="leading-tight">
                <h1 className="font-black text-slate-900 dark:text-slate-100 text-sm tracking-tight">CIRCOLO CHIGI</h1>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block -mt-0.5">Campionato ASI Over35_ARTI&MESTIERI_2025/2026</span>
            </div>
        </Link>

        <div className="flex items-center gap-2">
            
            {/* Theme Toggle */}
            {mounted && (
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full h-9 w-9"
                >
                    <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            )}
            
            {/* Profile / Login */}
            <Link href={profileLink}>
                {profile ? (
                    <Avatar className="h-9 w-9 border-2 border-white dark:border-slate-800 cursor-pointer transition-transform hover:scale-105">
                        <AvatarImage src={profile.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-blue-600 text-white font-bold text-xs">
                            {profile.nome?.[0] || "U"}
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <Button variant="ghost" size="icon" className={`rounded-full ${hasSession ? 'text-green-600 bg-green-50' : 'text-blue-600 hover:bg-blue-50'}`}>
                        <UserCircle className="h-7 w-7" />
                    </Button>
                )}
            </Link>
        </div>
      </div>
    </header>
  )
}