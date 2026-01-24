"use client"

import { useState, useMemo, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Mail } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
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
      alert("Errore: " + error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
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
                Inserisci la tua mail per accedere
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
                
                <Button className="w-full h-11 font-bold text-base shadow-lg shadow-primary/20" type="submit" disabled={loading}>
                    {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Attendere...</>
                    ) : (
                        'Invia il link di accesso'
                    )}
                </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}