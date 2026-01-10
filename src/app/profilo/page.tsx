"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Loader2, AlertTriangle, Crown, Settings, LogOut, RotateCcw, User, Users, Ruler, X, CalendarIcon, Shirt, CreditCard, Search, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { differenceInYears, format } from "date-fns"
import { it } from 'date-fns/locale'
import { AppCredits } from '@/components/AppCredits'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [myProfile, setMyProfile] = useState<any>(null)
  
  const [allPlayers, setAllPlayers] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("me")

  const [searchTerm, setSearchTerm] = useState("")
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false)
  const [newPlayer, setNewPlayer] = useState({ nome: '', cognome: '', email: '', ruolo: 'DIFENSORE' })

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

  useEffect(() => {
    loadData()
  }, [])

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


  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (profile) {
      setMyProfile(profile)
      if (!editingId) loadFormData(profile)
      
      if (profile.is_manager) {
          fetchTeamList()
      }
    }
    setLoading(false)
  }

  async function fetchTeamList() {
      const { data: players } = await supabase.from('profiles').select('*').order('cognome')
      setAllPlayers(players || [])
  }

  const loadFormData = (profile: any) => {
      setEditingId(profile.id)
      
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
  }

  const resetToMe = () => {
      if (myProfile) {
          loadFormData(myProfile);
          setActiveTab("me");
      }
  }

  const handleSave = async () => {
      if (!editingId) return;
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

      const { error } = await supabase.from('profiles').update(updates).eq('id', editingId)

      if (error) alert("Errore salvataggio: " + error.message)
      else {
          const updatedProfile = { ...originalData, ...updates, is_captain: formData.is_captain, is_manager: formData.is_manager };
          setOriginalData(updatedProfile);
          setHasChanges(false);
          
          if (myProfile?.is_manager) {
             fetchTeamList();
          }
      }
      setLoading(false)
  }

  const handleAddPlayer = async () => {
      if(!newPlayer.nome || !newPlayer.cognome || !newPlayer.email) return alert("Compila i campi obbligatori");
      
      const { error } = await supabase.from('profiles').insert([{
          nome: newPlayer.nome,
          cognome: newPlayer.cognome,
          email: newPlayer.email,
          ruolo: newPlayer.ruolo,
          note_mediche: 'OK'
      }]);

      if(error) {
          alert("Errore creazione: " + error.message);
      } else {
          setIsAddPlayerOpen(false);
          setNewPlayer({ nome: '', cognome: '', email: '', ruolo: 'DIFENSORE' });
          fetchTeamList();
      }
  }

  const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push('/login');
  }

  const currentAge = formData.data_nascita ? differenceInYears(new Date(), new Date(formData.data_nascita)) : null;
  const isU35Preview = currentAge !== null && currentAge < 35;
  const isMe = editingId === myProfile?.id;
  const isManager = myProfile?.is_manager;

  const filteredPlayers = allPlayers.filter(p => 
      p.cognome?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="min-h-screen bg-background pb-20">
        
        <div className="container max-w-md mx-auto p-4 space-y-6">
            
            <div className="flex justify-between items-center pt-2">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Profilo</h1>
                {isManager && (
                    <Badge className="bg-purple-600 hover:bg-purple-700 gap-1 px-3 py-1 text-white border-0 shadow-lg shadow-purple-500/30">
                        <Settings className="h-3 w-3" /> ADMIN
                    </Badge>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {isManager && (
                    <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-muted/50 p-1 rounded-xl">
                        <TabsTrigger value="me" className="rounded-lg font-bold flex items-center gap-2">
                            <User className="h-4 w-4" /> I Miei Dati
                        </TabsTrigger>
                        <TabsTrigger 
                            value="team" 
                            className="rounded-lg font-bold flex items-center gap-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/50 dark:data-[state=active]:text-purple-300 transition-colors"
                        >
                            <Users className="h-4 w-4" /> Gestione Rosa
                        </TabsTrigger>
                    </TabsList>
                )}

                <TabsContent value="me" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    
                    {!isMe && (
                        <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100 p-3 rounded-xl flex items-center justify-between shadow-sm">
                            <div className="text-xs font-bold flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Modifica: <span className="uppercase">{formData.cognome}</span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-purple-200/50" onClick={resetToMe}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Torna a Me
                            </Button>
                        </div>
                    )}

                    <div className="flex flex-col items-center gap-4 py-2">
                        <div className="relative group cursor-pointer">
                            <Avatar className="h-28 w-28 border-4 border-card shadow-2xl ring-2 ring-border/50">
                                <AvatarImage src={isMe ? myProfile?.avatar_url : allPlayers.find(p => p.id === editingId)?.avatar_url} className="object-cover" />
                                <AvatarFallback className="text-3xl font-black text-muted-foreground bg-muted">
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
                                    <Label>Email (Contatto)</Label>
                                    <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="Email visibile alla squadra" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data di Nascita</Label>
                                    <div className="relative">
                                        <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            type="date" 
                                            className="pl-9"
                                            value={formData.data_nascita} 
                                            onChange={(e) => setFormData({...formData, data_nascita: e.target.value})} 
                                        />
                                    </div>
                                    {currentAge !== null && (
                                        <p className="text-[10px] text-right text-muted-foreground mt-1 font-medium">
                                            {currentAge} anni • {isU35Preview ? <span className="text-blue-500 font-bold">Under 35</span> : 'Over 35'}
                                        </p>
                                    )}
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
                                    <Input value={formData.motto} onChange={(e) => setFormData({...formData, motto: e.target.value})} placeholder="Il tuo motto..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Taglia</Label>
                                    <div className="relative">
                                        <Ruler className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input value={formData.taglia_divisa} onChange={(e) => setFormData({...formData, taglia_divisa: e.target.value})} className="pl-8 font-bold text-center" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`border-l-4 shadow-sm ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-l-green-500 bg-card border border-border/50'}`}>
                        <CardHeader className="pb-2">
                            <CardTitle className={`text-base flex items-center gap-2 ${formData.note_mediche && formData.note_mediche !== 'OK' ? 'text-red-600' : 'text-green-600'}`}>
                                <AlertTriangle className="h-4 w-4" />
                                {formData.note_mediche && formData.note_mediche !== 'OK' ? 'Infermeria' : 'Stato Fisico: OK'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea 
                                placeholder="Scrivi qui se sei infortunato..." 
                                value={formData.note_mediche}
                                onChange={(e) => setFormData({...formData, note_mediche: e.target.value})}
                                className="bg-background resize-none focus-visible:ring-offset-0"
                            />
                        </CardContent>
                    </Card>

                    {isManager && (
                        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900 shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2 text-sm uppercase tracking-wider">
                                    <Settings className="h-4 w-4" /> Permessi Avanzati
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border shadow-sm">
                                    <Label className="cursor-pointer font-medium" htmlFor="capt-check">Capitano (Fascia ©)</Label>
                                    <Switch 
                                        id="capt-check"
                                        checked={formData.is_captain}
                                        onCheckedChange={(checked) => setFormData({...formData, is_captain: checked})}
                                    />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border shadow-sm">
                                    <Label className="cursor-pointer font-medium" htmlFor="man-check">Gestore (Admin)</Label>
                                    <Switch 
                                        id="man-check"
                                        checked={formData.is_manager}
                                        onCheckedChange={(checked) => setFormData({...formData, is_manager: checked})}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="pt-4 flex justify-center pb-2">
                        <Button 
                            variant="destructive" 
                            size="lg"
                            className="rounded-full px-10 shadow-lg font-bold gap-2 hover:bg-red-700"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-4 w-4" /> Disconnetti
                        </Button>
                    </div>

                    <AppCredits />

                </TabsContent>

                <TabsContent value="team" className="space-y-4">
                    
                    <div className="flex gap-2 sticky top-0 bg-background z-10 py-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Cerca giocatore..." 
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-1 px-3">
                                    <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Nuovo</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-sm rounded-xl">
                                <DialogHeader>
                                    <DialogTitle>Aggiungi Giocatore</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Nome *</Label>
                                            <Input value={newPlayer.nome} onChange={(e) => setNewPlayer({...newPlayer, nome: e.target.value})} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cognome *</Label>
                                            <Input value={newPlayer.cognome} onChange={(e) => setNewPlayer({...newPlayer, cognome: e.target.value})} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email (Per login) *</Label>
                                        <Input type="email" value={newPlayer.email} onChange={(e) => setNewPlayer({...newPlayer, email: e.target.value})} placeholder="email@esempio.com" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Ruolo</Label>
                                        <Select value={newPlayer.ruolo} onValueChange={(val) => setNewPlayer({...newPlayer, ruolo: val})}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PORTIERE">Portiere</SelectItem>
                                                <SelectItem value="DIFENSORE">Difensore</SelectItem>
                                                <SelectItem value="CENTROCAMPISTA">Centrocampista</SelectItem>
                                                <SelectItem value="ATTACCANTE">Attaccante</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleAddPlayer} className="w-full bg-purple-600">Crea Profilo</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                    
                    <div className="space-y-3 pb-4">
                        {filteredPlayers.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">Nessun giocatore trovato.</p>
                        )}
                        {filteredPlayers.map(p => {
                            const age = p.data_nascita ? differenceInYears(new Date(), new Date(p.data_nascita)) : null;
                            const isU35 = age !== null && age < 35;
                            const formattedDob = p.data_nascita ? format(new Date(p.data_nascita), 'dd/MM/yy', {locale: it}) : 'N.D.';

                            return (
                                <div 
                                    key={p.id} 
                                    onClick={() => {
                                        loadFormData(p);
                                        setActiveTab("me");
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-card border rounded-xl cursor-pointer hover:border-purple-500 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-3 flex-1">
                                        <Avatar className="h-12 w-12 border bg-muted shrink-0">
                                            <AvatarImage src={p.avatar_url} />
                                            <AvatarFallback>{p.nome?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="font-black text-sm text-foreground truncate">{p.cognome} {p.nome}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className="text-[9px] font-bold h-4 px-1">{p.ruolo?.substring(0,3)}</Badge>
                                                {isU35 && <Badge className="text-[9px] font-bold h-4 px-1 bg-blue-100 text-blue-700 border-0">U35</Badge>}
                                                {p.is_captain && <Crown className="h-3 w-3 text-yellow-500 fill-current" />}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded-lg sm:bg-transparent sm:p-0 sm:w-auto sm:text-right">
                                        <div className="flex flex-col sm:items-end">
                                            <span className="flex items-center gap-1 font-bold"><CalendarIcon className="h-3 w-3" /> Nascita</span>
                                            <span>{formattedDob} ({age || '?'} anni)</span>
                                        </div>
                                        <div className="flex flex-col sm:items-end">
                                            <span className="flex items-center gap-1 font-bold"><Shirt className="h-3 w-3" /> Taglia</span>
                                            <span>{p.taglia_divisa || '-'}</span>
                                        </div>
                                        <div className="flex flex-col sm:items-end">
                                            <span className="flex items-center gap-1 font-bold"><CreditCard className="h-3 w-3" /> Tessera</span>
                                            <span className="font-mono">{p.tessera_asi || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-4 flex justify-center">
                        <Button 
                            variant="destructive" 
                            size="lg"
                            className="rounded-full px-10 shadow-lg font-bold gap-2 hover:bg-red-700"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-4 w-4" /> Disconnetti
                        </Button>
                    </div>

                    <AppCredits />
                </TabsContent>
            </Tabs>
        </div>

        {hasChanges && (
            <div className="fixed bottom-24 left-0 right-0 z-50 flex justify-center px-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className={`
                    p-2 pl-4 pr-2 rounded-full shadow-2xl flex items-center justify-between border-2 border-white/20 backdrop-blur-md w-full max-w-xs
                    ${isManager ? 'bg-purple-600 text-white shadow-purple-500/40' : 'bg-primary text-primary-foreground shadow-blue-500/40'}
                `}>
                    <span className="text-sm font-bold ml-1">Modifiche pendenti</span>
                    <div className="flex items-center gap-2">
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={resetChanges}
                            className="h-8 w-8 p-0 rounded-full hover:bg-white/20 text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button 
                            size="sm" 
                            onClick={handleSave} 
                            disabled={loading}
                            className={`h-8 rounded-full bg-white hover:bg-white/90 font-bold px-4 ${isManager ? 'text-purple-600' : 'text-primary'}`}
                        >
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salva'}
                        </Button>
                    </div>
                </div>
            </div>
        )}

    </div>
  )
}