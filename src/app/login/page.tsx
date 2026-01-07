"use client"

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      alert(error.message)
    } else {
      alert('Controlla la tua email per il link di accesso!')
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Accedi alla squadra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input 
            placeholder="La tua email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
          />
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? 'Invio in corso...' : 'Inviami Link di Accesso'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}