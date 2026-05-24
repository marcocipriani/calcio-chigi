"use client"

import { useState, useMemo, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Mail } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const router = useRouter()

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  ), [])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/')
      }
    }
    checkUser()
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const origin = process.env.NEXT_PUBLIC_SITE_URL 
      ? process.env.NEXT_PUBLIC_SITE_URL 
      : window.location.origin;

    const redirectTo = `${origin}/auth/callback`

    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true, 
      }
    })

    if (error) {
      toast.error("Errore: " + error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    const origin = process.env.NEXT_PUBLIC_SITE_URL 
      ? process.env.NEXT_PUBLIC_SITE_URL 
      : window.location.origin;
      
    const redirectTo = `${origin}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
        toast.error("Errore Google: " + error.message)
        setGoogleLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-slate-100 dark:bg-slate-950 p-4 overflow-hidden">
      <Card className="w-full max-w-sm shadow-xl border-t-4 border-t-primary animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="flex flex-col items-center gap-4 pb-2">

          <div className="relative h-24 w-24 rounded-full bg-white shadow-md flex items-center justify-center p-1 border-2 border-slate-100">
             <Avatar className="h-full w-full">
                <AvatarImage 
                    src="https://cdn.enjore.com/source/img/team/badge/q/1068461sZGTQo021pdfMG4.png" 
                    className="object-contain"
                    alt="Logo Circolo Chigi"
                />
                <AvatarFallback>CC</AvatarFallback>
             </Avatar>
          </div>

          <div className="text-center space-y-1">
            <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                Circolo Chigi
            </CardTitle>
            <CardDescription>
                Accedi per gestire presenze e voti
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div className="text-center space-y-4 py-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <Mail className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="font-bold text-lg text-green-700">Link inviato!</h3>
                    <p className="text-sm text-muted-foreground mt-1">Controlla la tua casella di posta (anche nello spam).</p>
                </div>
                <Button variant="outline" onClick={() => setSent(false)} className="w-full mt-2">
                    Torna indietro
                </Button>
            </div>
          ) : (
            <div className="space-y-4">
                
                {/* PULSANTE GOOGLE */}
                <Button 
                    variant="outline" 
                    className="w-full h-11 font-bold flex gap-2 items-center justify-center" 
                    onClick={handleGoogleLogin}
                    disabled={loading || googleLoading}
                >
                    {googleLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                            <path d="M12.0003 20.45c-4.6667 0-8.45-3.7833-8.45-8.45 0-4.6667 3.7833-8.45 8.45-8.45 2.2833 0 4.35 0.8333 5.95 2.2167l-3.2167 3.2166c-0.7166-0.6833-1.6333-1.0833-2.7333-1.0833-2.3167 0-4.2 1.8833-4.2 4.2s1.8833 4.2 4.2 4.2c2.1 0 3.8667-1.4 4.1334-3.35h-4.1334v-3.6667h8.4167c0.0833 0.6 0.1333 1.2167 0.1333 1.8667 0 4.95-3.3 8.45-8.55 8.45z" fill="currentColor" />
                        </svg>
                    )}
                    Accedi con Google
                </Button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-slate-100 dark:bg-slate-950 px-2 text-muted-foreground">
                            Oppure via Email
                        </span>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Input 
                            type="email" 
                            placeholder="nome@esempio.com" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            autoComplete="email"
                            required
                            className="h-11 text-center font-medium bg-slate-50 dark:bg-slate-900 border-slate-200 focus-visible:ring-primary"
                        />
                    </div>
                    
                    <Button className="w-full h-11 font-bold text-base shadow-lg shadow-primary/20" type="submit" disabled={loading || googleLoading}>
                        {loading ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Invio...</>
                        ) : (
                            'Invia link di accesso'
                        )}
                    </Button>
                </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}