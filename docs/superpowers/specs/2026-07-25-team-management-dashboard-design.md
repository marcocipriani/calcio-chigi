# Calcio Circolo Chigi — gestione squadra 2026–2027

Data: 2026-07-25
Stato: design approvato, in attesa di revisione della spec

## Obiettivo

Estendere l’app con gestione stagionale della squadra, candidati, tesseramenti,
quote, certificati agonistici, account, notifiche, statistiche individuali e
formazioni ufficiali.

La dashboard è progettata prima per desktop, resta consultabile e utilizzabile
su mobile, mantiene lo stile attuale dell’app e ne aumenta densità, gerarchia e
polish senza introdurre una UI pesante.

## Principi

- Il database diventa unica fonte dati dopo l’import iniziale da Excel.
- Dati globali della persona e dati stagionali restano separati.
- `is_manager` è un permesso; giocatore/staff è una categoria stagionale.
- Il contenuto pubblico espone solo informazioni sportive non sensibili.
- Operazioni delicate sono protette da RLS, funzioni server e conferme.
- Componenti e dipendenze esistenti hanno precedenza su nuove astrazioni.
- Motion solo con CSS, breve e disattivabile con `prefers-reduced-motion`.

## Stagioni

### Stagioni iniziali

- `2025-2026`: dati correnti e archivio iniziale.
- `2026-2027`: stagione in preparazione.
- La stagione attiva cambia automaticamente il 2026-08-01.

La stagione attiva è derivata dalle date di inizio/fine. Non esiste un comando
manuale di attivazione.

### Calendario

Gli eventi appartengono esplicitamente a una stagione. Il calendario resta
unico e mostra intestazioni o badge stagione.

- Mobile: mantiene la UI e il toggle attuali.
- Desktop: elimina il toggle `Attività/Calendario` e mostra sempre:
  - calendario mensile a sinistra;
  - prossimo evento, giorno selezionato e successivi cinque eventi a destra;
  - filtri `Tutti`, `Partite`, `Allenamenti`.

Non aggiunge KPI mensili: appartengono alla pagina Statistiche.

## Modello dati

### `seasons`

- `id`
- `slug` univoco, per esempio `2026-2027`
- `name`
- `starts_on`
- `ends_on`
- timestamps

### `profiles`

Dati globali della persona:

- nome e cognome;
- data di nascita;
- avatar pubblico;
- data ingresso squadra, inizialmente vuota per i profili esistenti;
- `user_id` protetto, nullo finché non viene approvata l’associazione account;
- `is_manager` protetto;
- timestamps.

### `profile_private_details`

Dati leggibili solo dal proprietario e dai manager:

- telefono;
- email operativa;
- codice fiscale;
- nazionalità;
- città di nascita;
- città di residenza;
- indirizzo;
- CAP.

### `season_memberships`

Una riga per persona e stagione:

- `profile_id`, `season_id`, vincolo univoco;
- categoria `PLAYER` o `STAFF`;
- ruolo calcistico;
- funzione staff;
- numero maglia;
- taglia divisa;
- tessera ASI;
- dipartimento;
- flag `is_external`;
- flag `is_aggregated`;
- flag `training_only`;
- note operative;
- data prossimo contatto;
- manager referente;
- stato adesione:
  - `INTERESTED`;
  - `PENDING`;
  - `YES`;
  - `MAYBE`;
  - `NO`;
- data ultima richiesta di conferma;
- stato tesseramento:
  - `TODO`;
  - `SUBMITTED`;
  - `ACTIVE`;
- data completamento tesseramento;
- manager che ha completato il tesseramento;
- timestamps e ultimo autore.

`training_only` compare nella scheda e permette presenza agli allenamenti, ma
esclude la persona dalle formazioni partita.

### Fotografie

- Avatar pubblico: sempre modificabile dalla persona e dal manager.
- Fototessera ufficiale: file separato e privato.
- La persona può sostituire la fototessera finché il tesseramento non è
  `ACTIVE`.
- Dopo l’attivazione solo un manager può sostituirla o riaprire il
  tesseramento.

La fototessera vive in bucket privato con metadati associati alla membership
stagionale.

### `medical_certificates`

- membership stagionale;
- percorso PDF privato;
- dichiarazione obbligatoria di certificato agonistico;
- data visita;
- data scadenza;
- laboratorio/struttura;
- stato:
  - `MISSING`;
  - `PENDING_REVIEW`;
  - `VALID`;
  - `REJECTED`;
  - `EXPIRED`;
- motivo rifiuto;
- verificatore e data verifica;
- timestamps.

La persona carica documento e dati. Il manager verifica. Stato `EXPIRED` è
derivato dalla scadenza; il dato storico resta conservato.

### `payments`

Ogni riga rappresenta un obbligo di pagamento:

- membership stagionale;
- descrizione;
- importo richiesto;
- scadenza;
- stato:
  - `DUE`;
  - `PENDING_REVIEW`;
  - `PAID`;
- metodo `CASH` o `BANK_TRANSFER`;
- data dichiarazione;
- data verifica;
- verificatore;
- note;
- timestamps e ultimo autore.

Il manager crea pagamenti singoli o massivi per persone selezionate. Importo e
scadenza restano modificabili per persona. Non serve una tabella batch nella
prima versione.

### RSVP e check-in

L’attuale `attendance` resta la risposta preventiva RSVP.

Una nuova tabella `event_checkins` salva la presenza ufficiale:

- evento;
- profilo;
- stato `PRESENT` o `ABSENT`;
- manager;
- timestamps.

Un check-in `PRESENT` porta automaticamente RSVP a `PRESENTE` se mancante o
diverso. Un check-in `ABSENT` non modifica RSVP. Tutte le statistiche presenza
usano esclusivamente i check-in.

### Statistiche partita

`match_player_stats` contiene una riga per evento e giocatore:

- goal;
- assist;
- timestamps e manager.

Solo giocatori con check-in `PRESENT` sono selezionabili. Si salvano conteggi,
non cronologia minuto per minuto.

Ogni partita può avere un solo Player of the match, presente all’evento. Gli
autogol avversari o goal non attribuiti sono registrati separatamente per
riconciliare il risultato.

### Formazioni ufficiali

Ogni utente autenticato può creare ed esportare una formazione personale con
la UI attuale. La formazione personale non viene salvata nel database.

`official_formations` contiene una sola formazione ufficiale per partita.
`official_formation_players` contiene giocatore, posizione, titolare/panchina e
ordine. Insieme salvano:

- evento;
- modulo;
- colore maglia;
- titolari e posizioni;
- panchina e ordine;
- capitano;
- vicecapitano;
- snapshot dei dati necessari;
- pubblicatore;
- data pubblicazione e aggiornamento;
- stato pubblicato/ritirato.

Il manager può pubblicare, aggiornare o ritirare. Ogni azione invia una nuova
notifica. La formazione è visibile solo agli autenticati:

- dentro il dettaglio partita;
- dal pulsante `Formazione next match` nella pagina Squadra.

Azioni disponibili al manager:

- scarica immagine;
- copia messaggio WhatsApp;
- aggiorna e pubblica;
- ritira.

Il messaggio WhatsApp riusa ed estende `genMsgWhatsApp` e contiene:

- avversario, data, luogo, ritrovo e calcio d’inizio;
- divisa;
- titolari;
- panchina;
- indicatori Under e portiere dentro i due gruppi;
- saluto automatico oggi/domani.

I convocati arrivano dalla formazione ufficiale, non dagli RSVP.

## Adesione 2026–2027

Il prompt è attivo subito, anche prima del 2026-08-01, per giocatori e staff con
account.

Risposte:

- `Sì`;
- `Forse`;
- `Decido più avanti`;
- `No`.

`Decido più avanti` mantiene lo stato `PENDING` e ripropone il prompt al massimo
una volta al giorno. Il manager può registrare o correggere qualsiasi risposta.

## Interessati e persone senza account

Il manager può creare giocatori o staff interessati senza account. Il loro
stato iniziale è `INTERESTED`.

- Non compaiono nella Squadra o nella formazione.
- Possono avere contatti, dipartimento, `EXT`, `AGG`, note e prossimo contatto.
- Il manager invia esplicitamente l’invito.
- Una conversione successiva collega il profilo a un account.

Persone `YES` o `MAYBE` possono comparire in Squadra anche senza account.

## Pagina Squadra

### Pubblico

Mostra solo:

- avatar;
- nome e cognome;
- ruolo;
- numero maglia.

Non mostra campo, formazione, profilo cliccabile o dati privati.

### Autenticato

- Campo e formazione personale.
- Solo giocatori della stagione attiva con stato `YES` o `MAYBE`.
- Esclusi `INTERESTED`, `PENDING`, `NO` e staff.
- I `training_only` confermati compaiono con badge dedicato, ma non sono
  trascinabili o selezionabili per una formazione partita.
- Staff mostrato in sezione separata in coda.
- Staff mai trascinabile o selezionabile nel campo.
- Card staff espandibile.
- Avatar giocatori circolari.
- Avatar staff quadrati con angoli arrotondati e badge funzione.
- Banner/pulsante formazione ufficiale per la prossima partita.

## Statistiche

### Pubbliche

- goal;
- assist;
- Player of the match.

### Autenticate

- presenze partite;
- presenze allenamenti;
- percentuali;
- storico check-in;
- dettaglio personale nel profilo di ogni giocatore.

Tutti i giocatori autenticati possono vedere statistiche e storico presenze
degli altri giocatori.

La visualizzazione presenze usa avatar con anello circolare percentuale,
ordinabile e compatta, non un grafico a barre.

## Visibilità e accesso

### Senza login

- Calendario ed eventi.
- Squadra semplificata.
- Torneo.
- Statistiche pubbliche.

Le parti protette mostrano CTA di login, non errori o schermate vuote.

### Con login e profilo approvato

- RSVP;
- check-in e statistiche presenze;
- profili completi secondo permessi;
- formazione personale e ufficiale;
- notifiche;
- dati privati propri.

### Manager

`is_manager` è assegnabile a giocatori o staff. Consente:

- dashboard Gestione;
- gestione completa di tutte le persone;
- verifica pagamenti e certificati;
- gestione tesseramenti;
- gestione account;
- check-in e statistiche;
- pubblicazione formazione;
- notifiche manuali.

Il manager può sempre modificare tutti i campi. Operazioni delicate richiedono
conferma:

- codice fiscale;
- associazione account;
- tesseramento;
- dati economici;
- rifiuto e cancellazione account.

Tessera ASI, ruolo e numero maglia sono modificabili solo dai manager.

## Onboarding e associazione account

La registrazione è aperta a chiunque.

1. Un account non associato resta nell’area pubblica.
2. Il prompt mostra nome e cognome dei profili senza account.
3. L’utente sceglie chi è e conferma due volte.
4. Si crea una richiesta `PENDING`.
5. Il manager riceve notifica.
6. Approvazione collega account e profilo.
7. Rifiuto elimina richiesta e account Auth tramite funzione server protetta.
8. Resta per 30 giorni solo hash email e data rifiuto, per limitare spam.
9. L’esito è notificato all’utente.

Profili già associati non sono selezionabili. Non esiste `Non sono in elenco`:
la persona contatta i manager fuori dall’app e un manager crea prima il profilo.

La dashboard mostra stato account:

- `NONE`;
- `REQUESTED`;
- `ACTIVE`.

## Notifiche

### Canali

- Centro notifiche in-app persistente.
- Web Push opt-in su web, Android e PWA iOS.
- Campanella con badge accanto al selettore tema.
- Badge icona PWA dove supportato.

Su iOS il push richiede installazione in Home Screen e consenso ottenuto dopo
un gesto esplicito dell’utente. La notifica in-app resta fallback universale.

### Tipi automatici

- richiesta/esito associazione account;
- nuova quota, scadenza e pagamento dichiarato;
- certificato caricato, respinto o in scadenza;
- richiesta conferma stagione;
- evento aggiornato;
- formazione ufficiale pubblicata, aggiornata o ritirata.

### Invii manuali

Il manager può inviare a:

- tutta la rosa con account;
- persone con account selezionate.

Titolo, testo e deep-link sono configurabili. Persone senza account risultano
non notificabili.

### Robustezza

- `notifications`: evento canonico.
- `notification_recipients`: destinatario, letta/non letta, data lettura.
- `push_subscriptions`: una riga per dispositivo.
- `notification_preferences`: preferenze per categoria.
- outbox con chiave di idempotenza, tentativi, errore e stato consegna.
- Supabase Edge Function per Web Push.
- rimozione automatica subscription non valide.
- errore push non annulla la notifica in-app.

Notifiche critiche non sono disattivabili in-app. Il push resta sempre
disattivabile dal sistema operativo.

## Dashboard Gestione

Route riservata ai manager. Accesso dal pulsante `Gestione` nell’header, non
dalla navbar principale.

### Navigazione principale

1. Calendario
2. Squadra
3. Torneo
4. Statistiche

### Header

- Titolo `Calcio Circolo Chigi`.
- Rimosso riferimento fisso al campionato.
- Selettore tema.
- Campanella.
- Pulsante Gestione per manager.
- Avatar utente; ring viola se manager.

### Layout desktop

La UI è densa e simile a un foglio operativo:

- tabella centrale con intestazioni persistenti;
- prima colonna bloccata;
- ordinamento, filtri e ridimensionamento colonne;
- selezione multipla;
- modifica rapida;
- indicatori a pallino nelle celle;
- righe compatte, circa 44 px;
- card KPI sopra e pannelli laterali solo quando aggiungono informazione.

Preset fissi:

- Rosa;
- Interessati;
- Tesseramenti;
- Certificati;
- Quote;
- Account.

Non esiste un costruttore di viste personalizzate nella prima versione.

### Toolbar azioni

Concentrata sotto il titolo:

- `+ Persona`;
- `+ Quote`;
- `Invia notifica`;
- `Azioni massive`;
- `Esporta`;
- `Verifiche`.

### KPI e pannelli

- conferme;
- tesseramenti;
- certificati;
- incassato, aperto e scaduto;
- interessati e richiami;
- completezza dati;
- composizione giocatori/staff;
- `EXT`, `AGG`, dipartimenti e `Solo allenamenti`;
- fasce Under 30, 30–35 e Over 35;
- account mancanti, richiesti e attivi.

La scheda laterale persona mostra:

- anagrafica e contatti;
- membership corrente;
- archivio stagioni;
- quote;
- certificati;
- tesseramento;
- account;
- note e audit.

### Manager attivi e concorrenza

Accanto a `Gestione squadra` compaiono avatar viola dei manager:

- verde: attivo ora tramite Supabase Presence;
- ambra: attività recente;
- grigio: offline, con tooltip ultima attività.

La dashboard mostra stato realtime. Ogni riga espone ultimo autore e ora.

Il salvataggio usa controllo ottimistico su `updated_at`. Se una riga è cambiata
da quando il form è stato aperto, il secondo salvataggio viene bloccato e chiede
di ricaricare. Non sono previsti lock preventivi.

### Mobile

- KPI, ricerca e filtri.
- Card persona.
- Azioni singole.
- Niente tabella larga o operazioni massive.

## Import Excel e sincronizzazione iniziale

Fonte: `Rosa_Squadra_2026-27.xlsx`.

Analisi:

- 33 profili DB abbinati senza ambiguità.
- 26 persone presenti solo in Excel.

Regole:

- creare anche gli Excel-only con adesione `NO`;
- le due persone Excel-only `OK` diventano `YES`;
- profili già presenti nel DB senza risposta finale diventano `PENDING`;
- Excel-only con `CHIESTO`, `DA RISENTIRE`, note libere o vuoto diventano
  `INTERESTED`;
- `IN FORSE` diventa `MAYBE`;
- `SOLO ALLENAMENTI` diventa `INTERESTED` con `training_only`;
- `DIRIGENTE` diventa staff;
- motivazioni e referenti restano nelle note;
- `EXT` e `AGG` sono flag separati;
- `DPC`, `SNA`, `DIP` e simili sono dipartimenti;
- DB prevale sui dati globali già valorizzati;
- Excel completa dati globali mancanti;
- Excel prevale per storico 2025–2026 e preparazione 2026–2027;
- data ingresso squadra resta vuota.

L’import deve avere:

- dry-run;
- report abbinamenti, creazioni e conflitti;
- transazione;
- controllo conteggi dopo import.

Non è prevista sincronizzazione Excel bidirezionale. Dopo import il DB è fonte
unica; Excel resta archivio.

## Sicurezza

- Nessun dato privato nella policy pubblica attuale di `profiles`.
- Accesso pubblico tramite vista con sole colonne consentite.
- Base table protette da RLS.
- Funzione DB `is_current_user_manager()` centralizza autorizzazione.
- Funzioni o trigger impediscono modifiche a colonne manager-only.
- Quote leggibili solo da proprietario e manager.
- Certificati e fototessere in bucket privati.
- File accessibili con URL firmati brevi.
- Richieste account approvate/rifiutate solo da funzione server.
- Service role solo in Edge Functions e script amministrativi, mai nel client.
- Endpoint push protetti da JWT, controllo destinatari e idempotenza.

## UI, accessibilità e performance

### Stile

- Conservare palette, typography, shadcn/Radix e struttura dell’app.
- Aumentare densità, allineamento e contrasto senza riscrivere il design system.
- Evitare gradienti decorativi, glassmorphism e card inutili.
- Indicatori colore sempre accompagnati da testo o icona.

### Accessibilità

- Navigazione tastiera completa.
- Focus visibile.
- Tabelle con header e label accessibili.
- Dialog con titolo, descrizione e focus trap.
- Campanella con nome accessibile e conteggio annunciato.
- Toast e aggiornamenti realtime tramite regioni `aria-live`.
- Target touch minimo 44 px su mobile.
- Contrasto WCAG AA.
- Test senza colore e con zoom 200%.
- `prefers-reduced-motion` elimina animazioni non essenziali.

### Motion

- CSS `opacity` e `transform`, 120–200 ms.
- Ingresso leggero di pannelli e card.
- Pallino realtime con pulse discreto.
- Nessuna animazione continua su liste o tabelle.
- Nessuna nuova libreria motion.

### Performance

- Nessuna virtualizzazione: la rosa prevista è piccola.
- Query limitate alla stagione o vista corrente.
- Indici su foreign key, stato, stagione, scadenza e account.
- Realtime solo su tabelle necessarie e con cleanup.
- Immagini ottimizzate e dimensionate.
- Moduli pesanti di export caricati solo quando richiesti.
- Skeleton con dimensioni stabili, senza layout shift.
- Push e notifiche non bloccano rendering o salvataggi principali.

## Error handling

- Ogni scrittura mostra pending/success/error.
- Import, bulk e pubblicazione formazione hanno riepilogo prima della conferma.
- Errori parziali bulk mostrano persone riuscite e fallite.
- Conflitto concorrenza non sovrascrive dati silenziosamente.
- Errore push conserva la notifica in-app e permette retry.
- Upload valida MIME, dimensione e ownership.
- PDF rifiutato mantiene motivo visibile al proprietario.

## Verifica

- Test DB/RLS per anonimo, account pendente, giocatore, staff e manager.
- Test migrazione e import con dry-run e conteggi.
- Test unitari per stagioni, mapping Excel, fasce età e messaggio WhatsApp.
- Test integrazione per quote, certificati, onboarding e notifiche.
- Test browser desktop/mobile per visibilità pubblica e privata.
- Test concorrenza su due sessioni manager.
- Test Web Push su Chrome desktop, Android e PWA iOS.
- Test accessibilità automatica e tastiera manuale.
- Test `prefers-reduced-motion`.
- Build production e controllo bundle.

## Non obiettivi iniziali

- Sincronizzazione continua Excel.
- Email, SMS o WhatsApp automatico.
- Timeline minuto per minuto di goal e assist.
- Formazioni personali salvate.
- Formazione ufficiale pubblica.
- Costruttore di viste dashboard.
- Nuovo framework UI o libreria di animazioni.

## Skill previste per implementazione

- `impeccable`: gerarchia, densità e polish coerente.
- `web-design-guidelines`: revisione accessibilità e interazione.
- `vercel-react-best-practices`: performance React/Next.js.
- `superpowers:test-driven-development`: cambi funzionali e regressioni.
- `superpowers:verification-before-completion`: prove finali.
