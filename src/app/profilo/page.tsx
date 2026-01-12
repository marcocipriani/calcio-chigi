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
import { AlertTriangle, Crown, Settings, LogOut, User, Ruler, CalendarIcon, LayoutTemplate, List, CalendarDays, Shirt, Briefcase, CreditCard, ShieldCheck, Quote, Mail } from 'lucide-react'
import { Switch } from "@/components/ui/switch"
import { differenceInYears, format } from "date-fns"
import { it } from 'date-fns/locale'
import { AppCredits } from '@/components/AppCredits' 
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

import { BOMBER_TAGS } from "@/lib/constants"

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
    numero_maglia: '',
    tessera_asi: '',
    tags: [] as string[],
    note_mediche: '',
    taglia_divisa: '',
    default_view: 'ACTIVITY',
    is_staff: false,
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
        formData.numero_maglia !== (originalData.numero_maglia || '') ||
        formData.tessera_asi !== (originalData.tessera_asi || '') ||
        formData.taglia_divisa !== (originalData.taglia_divisa || '') ||
        formData.default_view !== (originalData.default_view || 'ACTIVITY') ||
        JSON.stringify(formData.tags.sort()) !== JSON.stringify((originalData.tags || []).sort()) ||
        (formData.note_mediche !== '' && formData.note_mediche !== (originalData.note_mediche === 'OK' ? '' : originalData.note_mediche)) ||
        (formData.note_mediche === '' && originalData.note_mediche !== 'OK' && originalData.note_mediche !== null && originalData.note_mediche !== '') ||
        formData.is_staff !== (originalData.is_staff || false) ||
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
          numero_maglia: profile.numero_maglia || '',
          tessera_asi: profile.tessera_asi || '',
          tags: profile.tags || [],
          note_mediche: profile.note_mediche === 'OK' ? '' : profile.note_mediche || '',
          taglia_divisa: profile.taglia_divisa || '',
          default_view: profile.default_view || 'ACTIVITY',
          is_staff: profile.is_staff || false,
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

  const handleToggleTag = (tag: string) => {
      const currentTags = formData.tags || [];
      if (currentTags.includes(tag)) {
          setFormData({...formData, tags: currentTags.filter(t => t !== tag)});
      } else {
          setFormData({...formData, tags: [...currentTags, tag]});
      }
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
            numero_maglia: formData.numero_maglia,
            tessera_asi: formData.tessera_asi,
            taglia_divisa: formData.taglia_divisa,
            tags: formData.tags,
            note_mediche: statusMedico,
            default_view: formData.default_view
      }

      if (myProfile?.is_manager) {
          updates.is_staff = formData.is_staff
          updates.is_manager = formData.is_manager
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', myProfile.id)

      if (error) {
          toast.error("Errore salvataggio: " + error.message)
      } else {
          const updatedProfile = { ...originalData, ...updates, is_staff: formData.is_staff, is_manager: formData.is_manager };
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
                        <User className="h-3 w-3" /> GESTORE
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
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Nome</Label>
                            <Input value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Cognome</Label>
                            <Input value={formData.cognome} onChange={(e) => setFormData({...formData, cognome: e.target.value})} className="font-bold text-lg" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Ruolo</Label>
                            <Select value={formData.ruolo} onValueChange={(val) => setFormData({...formData, ruolo: val})}>
                                <SelectTrigger className="font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PORTIERE">Portiere</SelectItem>
                                    <SelectItem value="DIFENSORE">Difensore</SelectItem>
                                    <SelectItem value="CENTROCAMPISTA">Centrocampista</SelectItem>
                                    <SelectItem value="ATTACCANTE">Attaccante</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Dipartimento</Label>
                            <div className="relative">
                                <Briefcase className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-9" value={formData.dipartimento} onChange={(e) => setFormData({...formData, dipartimento: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="pl-9" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="flex justify-between items-baseline">
                                <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Data di Nascita</Label>
                                {currentAge !== null && <span className="text-[10px] font-bold text-blue-600">{currentAge} anni</span>}
                            </div>
                            <div className="relative">
                                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="date" className="pl-9" value={formData.data_nascita} onChange={(e) => setFormData({...formData, data_nascita: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Tessera ASI</Label>
                            <div className="relative">
                                <CreditCard className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-9" value={formData.tessera_asi} onChange={(e) => setFormData({...formData, tessera_asi: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Maglia</Label>
                            <div className="relative">
                                <Shirt className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-9 text-lg font-black" type="number" value={formData.numero_maglia} onChange={(e) => setFormData({...formData, numero_maglia: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Taglia</Label>
                            <div className="relative">
                                <Ruler className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-9 text-center font-bold" value={formData.taglia_divisa} onChange={(e) => setFormData({...formData, taglia_divisa: e.target.value})} />
                            </div>
                        </div>
                    </div>

                </CardContent>
            </Card>

            <Card className={`border-l-4 shadow-sm ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-l-green-500 bg-card'}`}>
                <CardHeader className="pb-2">
                    <CardTitle className={`text-base flex items-center gap-2 ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'text-red-600' : 'text-green-600'}`}>
                        <AlertTriangle className="h-4 w-4" />
                        {formData.note_mediche && formData.note_mediche !== 'OK' ? 'Infermeria' : 'Stato fisico: OK'}
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

            <Card className="border-none shadow-sm bg-card border-border/50 border">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Quote className="h-5 w-5 text-primary" /> Caratteristiche
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Scegli i tag che più ti rappresentano in campo e fuori.</p>
                    <div className="flex flex-wrap gap-2">
                        {BOMBER_TAGS.map((tag) => {
                            const isActive = formData.tags.includes(tag);
                            return (
                                <Badge 
                                    key={tag} 
                                    variant={isActive ? "default" : "outline"}
                                    className={`cursor-pointer transition-all ${isActive ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-100'}`}
                                    onClick={() => handleToggleTag(tag)}
                                >
                                    {tag}
                                </Badge>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-card border-border/50 border">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Settings className="h-5 w-5 text-primary" /> Preferenze app
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Label className="mb-2 block text-xs uppercase text-muted-foreground font-bold tracking-wider">Vista calendario predefinita</Label>
                    <div className="grid grid-cols-2 gap-2 bg-muted/30 p-1.5 rounded-xl border">
                        <Button 
                            type="button"
                            variant={formData.default_view === 'ACTIVITY' ? 'default' : 'ghost'} 
                            className={`h-9 rounded-lg gap-2 ${formData.default_view === 'ACTIVITY' ? 'shadow-md' : 'text-muted-foreground hover:bg-muted'}`}
                            onClick={() => setFormData({...formData, default_view: 'ACTIVITY'})}
                        >
                            <List className="h-4 w-4" /> Lista
                        </Button>
                        <Button 
                            type="button"
                            variant={formData.default_view === 'CALENDAR' ? 'default' : 'ghost'} 
                            className={`h-9 rounded-lg gap-2 ${formData.default_view === 'CALENDAR' ? 'shadow-md' : 'text-muted-foreground hover:bg-muted'}`}
                            onClick={() => setFormData({...formData, default_view: 'CALENDAR'})}
                        >
                            <CalendarDays className="h-4 w-4" /> Calendario
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {isManager && (
                <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <ShieldCheck className="h-4 w-4" /> Area Tecnica (Admin)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                            <Label className="cursor-pointer font-medium" htmlFor="staff-check">Staff</Label>
                            <Switch id="staff-check" checked={formData.is_staff} onCheckedChange={(checked) => setFormData({...formData, is_staff: checked})} />
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