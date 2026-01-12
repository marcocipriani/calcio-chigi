"use client"

import { useEffect, useState, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Crown, Settings, LogOut, User, Ruler, CalendarIcon } from 'lucide-react'
import { Switch } from "@/components/ui/switch"
import { differenceInYears } from "date-fns"
import { AppCredits } from '@/components/AppCredits' 
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [myProfile, setMyProfile] = useState<any>(null)
  
  const [originalData, setOriginalData] = useState<any>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    data_nascita: '',
    ruolo: '',
    dipartimento: '',
    motto: '',
    note_mediche: '',
    taglia_divisa: '',
    is_captain: false,
    is_manager: false
  })

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  ), [])

  useEffect(() => {
    const loadData = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          router.replace('/login')
          return
        }
    
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
    
        if (profile) {
          setMyProfile(profile)
          loadFormData(profile)
        }
        setLoading(false)
      }

    loadData()
  }, [supabase, router])

  useEffect(() => {
    if (!originalData) return;
    
    const isDifferent = 
        formData.nome !== (originalData.nome || '') ||
        formData.cognome !== (originalData.cognome || '') ||
        formData.email !== (originalData.email || '') ||
        formData.data_nascita !== (originalData.data_nascita || '') ||
        formData.ruolo !== (originalData.ruolo || '') ||
        formData.dipartimento !== (originalData.dipartimento || '') ||
        formData.motto !== (originalData.motto || '') ||
        formData.taglia_divisa !== (originalData.taglia_divisa || '') ||
        (formData.note_mediche !== '' && formData.note_mediche !== (originalData.note_mediche === 'OK' ? '' : originalData.note_mediche)) ||
        (formData.note_mediche === '' && originalData.note_mediche !== 'OK' && originalData.note_mediche !== null && originalData.note_mediche !== '') ||
        formData.is_captain !== (originalData.is_captain || false) ||
        formData.is_manager !== (originalData.is_manager || false);

    setHasChanges(isDifferent);
  }, [formData, originalData])

  const loadFormData = (profile: any) => {
      const initialData = {
          nome: profile.nome || '',
          cognome: profile.cognome || '',
          email: profile.email || '',
          data_nascita: profile.data_nascita || '',
          ruolo: profile.ruolo || '',
          dipartimento: profile.dipartimento || '',
          motto: profile.motto || '',
          note_mediche: profile.note_mediche === 'OK' ? '' : profile.note_mediche || '',
          taglia_divisa: profile.taglia_divisa || '',
          is_captain: profile.is_captain || false,
          is_manager: profile.is_manager || false
      };

      setFormData(initialData)
      setOriginalData(profile)
      setHasChanges(false)
  }

  const resetChanges = () => {
      if (originalData) loadFormData(originalData);
      toast.info("Modifiche annullate");
  }

  const handleSave = async () => {
      setLoading(true)
      
      const statusMedico = formData.note_mediche.trim() === '' ? 'OK' : formData.note_mediche;
      const dataNascitaPayload = formData.data_nascita ? formData.data_nascita : null;

      const updates: any = {
            nome: formData.nome,
            cognome: formData.cognome,
            email: formData.email,
            data_nascita: dataNascitaPayload,
            ruolo: formData.ruolo,
            dipartimento: formData.dipartimento,
            motto: formData.motto,
            taglia_divisa: formData.taglia_divisa,
            note_mediche: statusMedico,
      }

      if (myProfile?.is_manager) {
          updates.is_captain = formData.is_captain
          updates.is_manager = formData.is_manager
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', myProfile.id)

      if (error) {
          toast.error("Errore salvataggio: " + error.message)
      } else {
          const updatedProfile = { ...originalData, ...updates, is_captain: formData.is_captain, is_manager: formData.is_manager };
          setOriginalData(updatedProfile);
          setHasChanges(false);
          toast.success("Profilo aggiornato con successo.");
      }
      setLoading(false)
  }

  const handleLogout = async () => {
      await supabase.auth.signOut();
      toast.info("Disconnessione effettuata");
      router.replace('/login');
  }

  const currentAge = formData.data_nascita ? differenceInYears(new Date(), new Date(formData.data_nascita)) : null;
  const isU35Preview = currentAge !== null && currentAge < 35;
  const isManager = myProfile?.is_manager;

  if (loading) return (
    <div className="min-h-screen bg-background pb-20">
        <div className="container max-w-md mx-auto p-4 space-y-6">
            <div className="flex flex-col items-center gap-4 py-6">
                <Skeleton className="h-28 w-28 rounded-full shadow-xl" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-[250px] w-full rounded-xl" />
                <Skeleton className="h-[100px] w-full rounded-xl" />
            </div>
        </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-20">
        <div className="container max-w-md mx-auto p-4 space-y-6">
            
            <div className="flex justify-between items-center pt-2">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Profilo</h1>
                {isManager && (
                    <Badge className="bg-purple-600 gap-1 px-3 py-1 text-white border-0 shadow-lg">
                        <User className="h-3 w-3" /> ADMIN
                    </Badge>
                )}
            </div>

            <div className="flex flex-col items-center gap-4 py-2">
                <div className="relative group">
                    <Avatar className="h-28 w-28 border-4 border-card shadow-2xl ring-2 ring-border/50">
                        <AvatarImage src={myProfile?.avatar_url} className="object-cover" />
                        <AvatarFallback className="text-3xl font-black bg-muted">
                            {formData.nome?.[0]}{formData.cognome?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    {formData.is_captain && (
                        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-950 p-1.5 rounded-full border-4 border-background shadow-sm z-10">
                            <Crown className="h-5 w-5 fill-current" />
                        </div>
                    )}
                    {isU35Preview && (
                        <div className="absolute -bottom-2 -left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full border-4 border-background shadow-sm z-10">
                            U35
                        </div>
                    )}
                </div>
            </div>

            <Card className="border-none shadow-sm bg-card border-border/50 border">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <User className="h-5 w-5 text-primary" /> Anagrafica
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>Cognome</Label>
                            <Input value={formData.cognome} onChange={(e) => setFormData({...formData, cognome: e.target.value})} className="font-bold" />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>Data di Nascita</Label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="date" className="pl-9" value={formData.data_nascita} onChange={(e) => setFormData({...formData, data_nascita: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Ruolo</Label>
                            <Select value={formData.ruolo} onValueChange={(val) => setFormData({...formData, ruolo: val})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PORTIERE">Portiere</SelectItem>
                                    <SelectItem value="DIFENSORE">Difensore</SelectItem>
                                    <SelectItem value="CENTROCAMPISTA">Centrocampista</SelectItem>
                                    <SelectItem value="ATTACCANTE">Attaccante</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Dipartimento</Label>
                            <Input value={formData.dipartimento} onChange={(e) => setFormData({...formData, dipartimento: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-4 border-t mt-2">
                        <div className="col-span-2 space-y-2">
                            <Label>Motto</Label>
                            <Input value={formData.motto} onChange={(e) => setFormData({...formData, motto: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>Taglia</Label>
                            <div className="relative">
                                <Ruler className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input value={formData.taglia_divisa} onChange={(e) => setFormData({...formData, taglia_divisa: e.target.value})} className="pl-8 text-center" />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className={`border-l-4 shadow-sm ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-l-green-500 bg-card'}`}>
                <CardHeader className="pb-2">
                    <CardTitle className={`text-base flex items-center gap-2 ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'text-red-600' : 'text-green-600'}`}>
                        <AlertTriangle className="h-4 w-4" />
                        {formData.note_mediche && formData.note_mediche !== 'OK' ? 'Infermeria' : 'Stato Fisico: OK'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea 
                        placeholder="Note mediche..." 
                        value={formData.note_mediche}
                        onChange={(e) => setFormData({...formData, note_mediche: e.target.value})}
                        className="bg-background resize-none"
                    />
                </CardContent>
            </Card>

            {isManager && (
                <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <Settings className="h-4 w-4" /> Permessi Avanzati
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                            <Label className="cursor-pointer font-medium" htmlFor="capt-check">Capitano</Label>
                            <Switch id="capt-check" checked={formData.is_captain} onCheckedChange={(checked) => setFormData({...formData, is_captain: checked})} />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                            <Label className="cursor-pointer font-medium" htmlFor="man-check">Gestore</Label>
                            <Switch id="man-check" checked={formData.is_manager} onCheckedChange={(checked) => setFormData({...formData, is_manager: checked})} />
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="pt-4 flex justify-center pb-2">
                <Button variant="destructive" size="lg" className="rounded-full px-10 shadow-lg gap-2" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" /> Disconnetti
                </Button>
            </div>

            <AppCredits uid={myProfile?.id} />
        </div>

        {hasChanges && (
            <div className="fixed bottom-24 left-0 right-0 z-50 flex justify-center px-4">
                <div className="bg-primary text-primary-foreground p-2 pl-4 pr-2 rounded-full shadow-xl flex items-center justify-between border-2 border-white/20 backdrop-blur-md w-full max-w-xs">
                    <span className="text-sm font-bold ml-1">Modifiche pendenti</span>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={resetChanges} className="h-8 w-8 p-0 rounded-full hover:bg-white/20 text-white">X</Button>
                        <Button size="sm" onClick={handleSave} disabled={loading} className="h-8 rounded-full bg-white text-primary hover:bg-white/90 font-bold px-4">Salva</Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  )
}