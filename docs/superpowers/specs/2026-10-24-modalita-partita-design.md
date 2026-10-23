# Modalità partita

## Intento

Oggi risultato, goal, assist e cartellini si inseriscono a mano dopo la
partita, ricostruendo a memoria. La modalità partita li registra **mentre si
gioca**, dal telefono di un manager in panchina, con una schermata dedicata:
campo con gli avatar, panchina, timer. A fine gara risultato e statistiche sono
già salvati. Chi è a casa segue minuto e goal in tempo reale dalla pagina
evento.

**Successo:** dopo una partita nessuno deve reinserire risultato e statistiche;
chi è a casa vede un goal entro pochi secondi.

**Anti-obiettivi:**

- una schermata che distrae il manager dalla partita: troppi tocchi, troppe
  conferme;
- dati persi perché il telefono si è bloccato o la rete è caduta;
- statistiche sbagliate che finiscono nei numeri ufficiali senza che nessuno
  se ne accorga.

**Fuori perimetro:**

- infortuni, che si segnano dopo la partita come oggi;
- statistiche dei giocatori avversari;
- più segnapunti contemporanei;
- allenamenti;
- sostituire il risultato ufficiale di Enjore, che resta quello buono per la
  classifica;
- tempi supplementari e rigori (Coppa): la regola non è ancora decisa. Il
  fischio finale è disponibile solo dopo il secondo tempo.

## Chi la usa

**Solo i manager** (`is_manager`). Il pulsante è viola (`operative`), come
tutte le azioni da manager.

**Un solo segnapunti per partita.**

- Entrare in modalità partita significa prendere il controllo.
- Se c'è già un altro manager, prima di entrare compare: "Luca ha il controllo
  dal 12'. Vuoi prenderlo tu?".
- Se si conferma, Luca vede "Ora la partita la segue Marco" e la sua schermata
  diventa una diretta in sola lettura.
- Timer, risultato ed eventi non cambiano: chi subentra riparte da lì.
- Solo il segnapunti corrente può registrare eventi, e la regola è applicata
  sul server: un telefono che ha perso il controllo non può scrivere.

**Tutti gli altri**, cioè chiunque possa aprire la pagina evento, vedono la
diretta: minuto, risultato e cronaca. Vale anche per chi non ha fatto l'accesso,
come già per `events`: i nomi dei giocatori sono pubblici nella rosa e nelle
statistiche.

## Pagina evento durante la partita

```
┌──────────────────────────────────────┐
│ ←  Partita        [✎ Modifica] [⚑ MP]│  ← [⚑ MP] viola, solo manager
├──────────────────────────────────────┤
│            (logo avversario)         │
│              PSICOLOGOL              │
│   ● LIVE · 2° tempo · 52'            │
│        CHIGI  2 – 1  PSICOLOGOL      │
│   Segue la partita: Luca             │
├──────────────────────────────────────┤
│ Cronaca                              │
│ ⚽ 48'  Rossi  (assist Bianchi)  2-1 │
│ 🟨 40'  Verdi                        │
│ ⚽ 31'  Psicologol               1-1 │
├──────────────────────────────────────┤
│ Formazione ufficiale (come oggi)     │
└──────────────────────────────────────┘
```

**Blocco live** (al posto del risultato attuale, mentre la partita è in corso):

- l'indicatore `● LIVE` usa il rosso Chigi (`--secondary`);
- il tempo è scritto per esteso: "1° tempo" o "2° tempo";
- il minuto scorre ed è calcolato sul telefono di chi guarda, partendo
  dall'orario d'inizio del tempo salvato sul server. In recupero diventa
  `35+2'`;
- durante l'intervallo compare "Intervallo · riprende tra 08:12";
- sotto c'è il nome del segnapunti.

**Cronaca:** goal (nostri e avversari), assist, gialli e rossi, dal più
recente. I cambi non compaiono qui: si vedono solo in modalità partita.

**Prima e dopo la partita.** Prima del calcio d'inizio la pagina è quella di
oggi. Dopo il fischio finale sparisce "LIVE", resta il risultato e la cronaca
rimane come riepilogo della gara.

**Banner in home:** mentre si gioca, in cima al calendario compare
`● LIVE · CHIGI 2–1 PSICOLOGOL · 52'`, che porta alla pagina evento. La capsula
"prossima partita" sta in Squadra e a partita iniziata non c'è più, quindi non
basta.

**Pulsante `⚑ Modalità partita`:**

- compare ai manager il giorno della partita (nel fuso di Roma) e finché la
  partita non è chiusa;
- se un altro manager ha già il controllo diventa "Prendi il controllo";
- partite annullate: niente pulsante.

## Schermata modalità partita

Si apre all'indirizzo `/evento/[id]/partita` ed è solo per i manager. È a tutto
schermo, senza la barra di navigazione in basso, e tiene lo schermo acceso con
la Wake Lock API.

```
┌──────────────────────────────────────┐
│ ✕ Esci       CHIGI 2–1 PSICOLOGOL  ⋯ │
├──────────────────────────────────────┤
│   2° TEMPO        52:14              │
│   Recupero  [+1][+2][+3][+4][+5]     │
│   [ Time-out 60" ]  [ Fine tempo ]   │
├──────────────────────────────────────┤
│                 (ATT)  (ATT)         │
│                  Neri⚽  Rossi⚽     │
│        (CEN)  (CEN)  (CEN)  (CEN)    │
│               Verdi🟨                │
│        (DIF)  (DIF)  (DIF)  (DIF)    │
│                   (POR)              │
├──────────────────────────────────────┤
│ Panchina                Cambi 2/7    │
│ (Gialli)(Blu↩48')(Gallo)(Moro)       │
│ (Testa↪48')               U35 3/3 ✓  │
├──────────────────────────────────────┤
│ [ ⚽ Goal avversario ]               │
│ ↶ Annulla: Goal Rossi 48'            │
└──────────────────────────────────────┘
```

### Fasi

1. **Prima del via.**
   - I titolari sul campo e la panchina arrivano dalla formazione ufficiale
     pubblicata, con modulo e posizioni.
   - Senza formazione pubblicata, il manager tocca gli 11 titolari tra chi ha
     risposto "presente" alla partita.
   - Si può ancora scambiare un titolare con un panchinaro.
   - La durata del tempo parte da 35 minuti (regolamento ASI); per le
     amichevoli è modificabile prima del via.
   - Il pulsante grande è `[ Calcio d'inizio ]`.
2. **Primo tempo** (timer da 00:00).
3. **Intervallo:**
   - conto alla rovescia da 15:00, solo indicativo;
   - cambi illimitati;
   - pulsante `[ Inizio 2° tempo ]`.
4. **Secondo tempo:** il timer riparte da 35:00.
5. **Fischio finale**, dal menu `⋯`: apre il riepilogo descritto più sotto.

### Timer

- Il timer non si mette mai in pausa: è un orologio indicativo e l'arbitro fa
  fede.
- Superata la durata del tempo continua e mostra `35+2'`.
- I chip `+1 … +5` per il recupero annunciato compaiono dal 30' di ogni tempo.
  Il valore scelto appare accanto al timer ("+3") e nella pagina evento.
- **Time-out:** un tasto per tempo. Apre un conto alla rovescia da 60 secondi
  sopra la schermata, non ferma il timer e dopo l'uso resta disattivato fino
  al tempo successivo.
- **Correggi orario d'inizio**, dal menu `⋯`: sposta di ±1 minuto l'inizio del
  tempo corrente, per chi ha premuto "Calcio d'inizio" in ritardo.
- Il minuto registrato su ogni evento si calcola così: nel primo tempo
  `floor(secondi dall'inizio / 60) + 1`, con un tetto alla durata più il
  recupero (`35+N'`); nel secondo tempo si aggiungono 35. Si salva sia
  l'istante (`occurred_at`) sia il minuto mostrato.

### Tocco su un avatar in campo

```
┌──────────────────────────────┐
│ Rossi · ATT · 48'            │
│ [ ⚽ Goal ]  [ 🟨 ]  [ 🟥 ]   │
│ [ ↔ Cambio ]                 │
└──────────────────────────────┘
```

- **Goal:**
  - compare "Assist?", con gli avatar degli altri in campo e
    `[ Nessun assist ]` in evidenza;
  - un tocco chiude, senza conferme ulteriori;
  - il risultato si aggiorna subito.
- **Giallo:** registrato subito. Al secondo giallo dello stesso giocatore
  compare "Secondo giallo: espulso?" e la conferma registra il rosso.
- **Rosso:** il giocatore esce dal campo (avatar barrato in panchina) e non
  può più rientrare. La squadra resta in 10 e il suo posto resta vuoto.
- **Cambio:**
  - si sceglie chi entra tra i panchinari, con quelli dello stesso ruolo per
    primi;
  - chi entra prende la posizione di chi esce;
  - chi è uscito torna in panchina con `↩48'` e può rientrare (il regolamento
    ammette sostituzioni "multiple e ripetitive").

**Senza avatar**, dal menu `⋯` o dal pulsante in basso:

- `[ ⚽ Goal avversario ]`;
- "Autogol avversario" (goal nostro senza marcatore);
- "Goal non attribuito".

**Annulla:** la barra in basso mostra l'ultimo evento con `↶ Annulla`. Si
annulla solo l'ultimo evento non già annullato, a ritroso uno per volta.
L'evento annullato resta salvato come tale ma sparisce da cronaca e risultato.

### Panchina

Sta in una riga orizzontale sotto il campo. Se gli avatar non stanno in una
riga vanno a capo: niente scroll interno, come da `DESIGN.md`. Sono ordinati
per ruolo: POR, DIF, CEN, ATT.

**Badge sull'avatar** (in campo e in panchina):

- `↪48'` entrato;
- `↩48'` uscito;
- goal segnati;
- giallo o rosso;
- `U35`;
- "diffidato" (fase MP3).

**Contatori in alto a destra:**

- **Cambi del tempo:**
  - nel primo tempo `x/3`;
  - nell'intervallo "liberi";
  - nel secondo tempo `x/7`.

  Superato il limite l'app avvisa ("Limite di cambi raggiunto") ma registra
  comunque: decide l'arbitro.
- **U35 in campo `x/3`**, con la stessa regola di `u35Quota` in
  `src/lib/formations.ts` (portiere escluso). Se un cambio supera la quota
  compare un avviso, senza blocco.
- **Amichevoli:** niente limiti di cambi né quota U35, come per la
  pubblicazione della formazione.

### Fischio finale

Si apre un riepilogo modificabile:

- risultato;
- per ogni giocatore: goal, assist, gialli, rossi e minuti giocati;
- autogol avversari e goal non attribuiti;
- l'elenco di chi è sceso in campo, che viene segnato presente. Non è
  un'opzione: `match_player_stats` accetta solo giocatori con check-in
  `PRESENT` (trigger `validate_present_match_player`).

`[ Salva ]` esegue in un'unica transazione:

- **Partita:** su `events` scrive `gol_nostri`, `gol_avversario`, `gol_casa`
  e `gol_ospite` (secondo chi gioca in casa) e `giocata = true`.
  `data_fine_ora` non si tocca: cambiarla farebbe partire a tutta la rosa la
  push "Evento aggiornato" (trigger `notify_event_update`).
- **Statistiche:** su `match_player_stats` scrive, per evento e giocatore,
  `goals`, `assists`, `yellow_cards`, `red_cards` e la nuova colonna
  `minutes_played`. Le righe dell'evento vengono sostituite.
- **Goal senza marcatore:** su `match_unattributed_stats` scrive
  `opponent_own_goals` e `unattributed_goals`.
- **Check-in:** `event_checkins` registra presente chi è sceso in campo, con
  `set_event_checkin`, prima di scrivere le statistiche.
- **Sessione:** passa a `FINISHED`.

Dopo il salvataggio il manager può sempre correggere dalla pagina evento, come
oggi: l'inserimento manuale resta, e serve anche quando la modalità partita non
è stata usata. Il sync Enjore notturno può riscrivere `gol_casa` e `gol_ospite`
con il risultato ufficiale: va bene così.

**Amichevoli:** le statistiche si salvano ma non entrano in quelle stagionali,
perché `public_player_statistics_by_phase` conta solo le `PARTITA`, come oggi.

**Chigio d'Oro:** `private.chigio_tick` salta gli eventi con una sessione non
ancora `FINISHED`. Il sondaggio quindi aspetta il fischio finale anche quando
la partita supera l'orario previsto (`data_ora` + 2 ore).

**Minuti giocati:**

- i titolari partono dal minuto 0;
- chi entra parte dal minuto del cambio;
- l'intervallo non conta;
- la fine di ogni tempo usa l'istante di "Fine tempo", recupero incluso;
- l'espulsione chiude il conteggio.

## Rete e telefono

- **Coda locale.** Ogni tocco viene salvato in `localStorage` (bastano poche
  decine di righe per partita) con un id generato sul telefono (idempotenza) e
  con il suo istante, poi inviato appena possibile.
  In alto compare "3 eventi da inviare" finché la coda non è vuota.
- **Timer offline.** Il timer funziona anche offline, perché parte
  dall'istante salvato.
- **Passaggio di controllo.** Gli eventi di un segnapunti avvenuti prima del
  passaggio vengono accettati anche se arrivano dopo. Quelli successivi vengono
  rifiutati, e il telefono mostra l'elenco di quelli scartati.
- **Telefono chiuso o riavviato.** Riaprendo la pagina si riparte dallo stato
  sul server, con la coda locale ancora da inviare.
- **Vibrazione.** Breve vibrazione di conferma a ogni evento registrato, dove
  il telefono la supporta.

## Dati

**`match_sessions`** (una riga per evento):

- `event_id` (pk);
- `status`: `NOT_STARTED`, `FIRST_HALF`, `HALFTIME`, `SECOND_HALF`, `FINISHED`;
- `period_minutes` (default 35);
- `period_started_at`;
- `added_minutes` (recupero annunciato del tempo corrente);
- `timeouts_used` per tempo;
- `lineup` (jsonb: titolari, posizioni, panchina al calcio d'inizio);
- `score_ours`, `score_theirs`, ricalcolati dalle RPC a ogni evento o
  annullamento: il banner e la pagina evento li leggono senza contare la
  cronaca;
- `operator_profile_id`;
- `operator_since`;
- `finished_at`.

**Eventi in coda:** non c'è un registro dei passaggi di controllo. Un manager
che non ha il controllo può scrivere solo eventi con
`occurred_at <= operator_since`, cioè avvenuti prima del passaggio.

**`match_timeline`** (un evento per riga):

- `id` generato dal client;
- `event_id`;
- `kind`: `PERIOD_START`, `PERIOD_END`, `GOAL`, `OWN_GOAL_FOR`,
  `UNATTRIBUTED_GOAL`, `GOAL_AGAINST`, `YELLOW`, `RED`, `SUB`, `TIMEOUT`;
- `period`, `minute_label`, `occurred_at`;
- `profile_id` (chi segna, chi è ammonito o espulso, chi esce);
- `assist_profile_id`;
- `sub_in_profile_id`;
- `created_by`, `voided_at`.

**Scrittura:** solo tramite RPC `security definer` che verificano manager e
segnapunti corrente:

- `match_take_control`;
- `match_start` (con titolari e durata);
- `match_end_period`;
- `match_set_added_time`;
- `match_record` (idempotente sull'id);
- `match_void_last`;
- `match_finish` (con il riepilogo).

**Lettura:** `match_sessions` e `match_timeline` sono leggibili da `anon` e
`authenticated`, come `events`. Le viste `public_match_sessions` e
`public_match_timeline` aggiungono i cognomi.

**Realtime:** le due tabelle entrano nella publication `supabase_realtime`. I
client ascoltano `postgres_changes` filtrati per `event_id` e rileggono le
viste.

**Test:** pgTAP per permessi, passaggio di controllo, idempotenza, rifiuto
degli eventi tardivi e scritture di `match_finish`.

## Fasi di rilascio

| Fase | Contenuto |
|------|-----------|
| MP1 | Schermata con campo e panchina; timer, recupero, intervallo, time-out; goal, assist, gialli e rossi; annulla; passaggio di controllo; blocco live e cronaca nella pagina evento; fischio finale con salvataggio. |
| MP2 | Cambi con contatori e quota U35; minuti giocati; banner live in home. |
| MP3 | Coda offline completa; push sui goal (nuovo tipo opzionale in `notification_preferences`); badge diffidati e squalificati (rosso → gara successiva, terzo giallo stagionale → squalifica); cronaca da copiare per WhatsApp. |

In MP1, senza coda offline, un evento che non parte resta in evidenza con
"Riprova".

## Vincoli

- Regole di `DESIGN.md`:
  - viola solo per le azioni dei manager;
  - target touch di almeno 44px, che qui diventano pulsanti più grandi perché
    si usano in piedi e in fretta;
  - niente testo sotto i 10px;
  - colori di stato solo con il loro significato (giallo e rosso dei cartellini
    sono stati).
- Riusare il disegno del campo e le posizioni di `FormationBuilder` e
  `official_formation_players.position_key`.
- Il regolamento di riferimento è `src/lib/regolamento.ts`: 2×35', intervallo
  di 15', time-out da 60" per tempo, 3/illimitati/7 cambi.

## Lasciato a chi costruisce

- Disegno esatto degli avatar sul campo per ciascun modulo.
- Animazioni e transizioni.
- Struttura dei componenti React e dello store locale.
- Come mostrare i tre stati del contatore cambi.
- Nomi esatti di RPC e colonne, purché rispettino il modello sopra.

## Scelte fatte senza conferma esplicita

Da rivedere in lettura:

- La cronaca della pagina evento mostra goal e cartellini, non i cambi.
- Il pulsante compare dal giorno della partita.
- Senza formazione pubblicata, i titolari si scelgono tra chi ha risposto
  "presente".
- Il timer non va mai in pausa e il time-out non lo ferma.
- I chip del recupero compaiono dal 30'.
- Si annulla a ritroso un evento per volta.
- Il fischio finale lo preme il segnapunti.
- Le righe di `match_player_stats` dell'evento vengono sostituite.
- Amichevoli senza limiti di cambi né quota U35; le loro statistiche non
  entrano in quelle stagionali.
- Diretta visibile anche a chi non ha fatto l'accesso.
- `data_fine_ora` uguale alla fine del secondo tempo; il Chigio aspetta il
  fischio finale.
- Eventi in coda accettati solo se avvenuti prima del passaggio di controllo,
  senza registro dei passaggi.
- Banner live in home al posto della capsula; push sui goal attiva di default,
  con un interruttore nella campanella.
- Diffidato con gialli stagionali `% 3 == 2`; squalificato se nell'ultima
  partita di campionato giocata ha preso un rosso o è arrivato a un multiplo
  di 3 gialli.
