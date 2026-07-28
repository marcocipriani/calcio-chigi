# Squadra, formazioni e Torneo responsive

## Obiettivo

Rendere la pagina Squadra più densa e leggibile, distinguere senza ambiguità
playground personale e formazione ufficiale, trasformare il titolo Torneo in
un selettore e uniformare il viewport esterno delle pagine.

## Contenitore responsive condiviso

Le pagine applicative usano lo stesso contenitore esterno:

- larghezza massima `max-w-7xl`;
- centratura orizzontale;
- padding mobile ridotto, progressivo su tablet e desktop;
- spazio inferiore globale già riservato alla navbar fissa e alla safe area.

Le sezioni interne possono avere una larghezza minore quando il contenuto lo
richiede, ma title bar e allineamento esterno devono restare coerenti. Il
contenitore non impone un'altezza fissa: si adatta al contenuto e al viewport.

## Pagina Squadra

### Title bar

La title bar contiene:

1. eyebrow `Stagione in corso` e titolo `Squadra`;
2. match capsule della prossima partita;
3. pulsante neutro con icona campo `Crea la tua formazione`;
4. pulsante viola con icona campo/pubblicazione `Pubblica formazione`, visibile
   solo ai manager.

Su desktop tutti gli elementi stanno sulla stessa riga. Su mobile titolo e
azioni restano sulla prima riga, mentre la match capsule occupa una seconda
riga compatta.

I pulsanti mostrano testo e icona su desktop. Su mobile diventano pulsanti
iconici con `aria-label`, tooltip e area cliccabile di almeno 44 × 44 CSS pixel,
senza aumentare visivamente l'altezza della title bar.

### Match capsule

La capsula usa il rosso, codice esclusivo di tutto ciò che riguarda la prossima
partita. Mostra logo avversario, nome avversario, data e ora del match.

Ha due stati:

- `DRAFT`: fondo bianco, bordo e testo rossi; indica che la formazione non è
  ancora pubblicata. È visibile a tutti e non suggerisce uno stato live.
- `PUBLISHED`: rosso pieno; mostra anche data e ora di `published_at` e apre la
  pagina evento contenente la formazione ufficiale.

Se non esiste una prossima partita, la capsula non viene mostrata. Se la
prossima partita esiste ma non ha una formazione pubblicata, il manager usa il
pulsante viola per aprire il builder ufficiale.

### Card giocatore

La griglia usa:

- 2 colonne sotto 360 px;
- 3 colonne da 360 px;
- 4 colonne su tablet;
- 6 colonne su desktop.

Ogni card è compatta e mantiene questo ordine:

1. avatar;
2. nome, più piccolo;
3. cognome, più evidente;
4. numero di maglia dentro un'icona maglia;
5. ruolo piccolo, centrato e su tutta la riga;
6. statistiche goal, assist e MVP centrate e ravvicinate in basso.

I testi lunghi usano ellissi senza modificare la larghezza della card. Lo stato
`MAYBE` resta visibile tramite badge e non altera la geometria della griglia.

Lo staff resta in una sezione separata sotto i giocatori.

## Formazioni

### Un solo builder, due modalità

`FormationBuilder` espone una modalità esplicita:

- `PLAYGROUND`;
- `OFFICIAL`.

Le due modalità condividono campo, selezione modulo, drag-and-drop, selezione
mobile, colori maglia e rendering dei giocatori. Il componente viene rimontato
quando cambia modalità, così lineup e stato locale non passano accidentalmente
dal playground alla formazione ufficiale.

### Playground pubblico

`Crea la tua formazione` è visibile e utilizzabile anche senza autenticazione.
Il playground:

- legge solo `public_active_roster`;
- include giocatori `YES` e `MAYBE`;
- non legge dati privati o presenze;
- non salva nulla sul server;
- consente di svuotare il campo, cambiare modulo e colore maglia;
- consente due export sotto un singolo menu compatto:
  - `Scarica PNG`;
  - `Copia messaggio`.

Il testo copiato è formattato per chat con emoji, modulo, giocatori raggruppati
per reparto e colore maglia. Non contiene dati privati.

### Formazione ufficiale

`Pubblica formazione` è visibile soltanto ai manager. La modalità ufficiale:

- richiede una prossima partita;
- legge `get_event_roster` per la stagione associata all'evento;
- mantiene capitano, vicecapitano, distinta Excel, export PNG e messaggio
  WhatsApp;
- pubblica tramite `publish_official_formation`;
- aggiorna la match capsule allo stato `PUBLISHED`.

La UI non sostituisce l'autorizzazione server: RPC e RLS continuano a impedire
pubblicazioni non autorizzate.

### Stati ed errori

- Rosa pubblica non disponibile: il playground mostra uno stato vuoto con
  possibilità di riprovare.
- Nessuna prossima partita: il comando manager è disabilitato con spiegazione;
  il playground resta disponibile.
- Pubblicazione fallita: la lineup resta intatta e viene mostrato l'errore
  restituito dalla RPC.
- Export PNG fallito o clipboard non disponibile: viene mostrato un errore
  senza perdere la formazione.

## Pagina Torneo

Il testo fisso sotto il titolo diventa un `Select` accessibile con:

- label visiva `Torneo`;
- valore iniziale `Campionato ASI Over35 2025/2026`;
- struttura dati configurabile per aggiungere altre competizioni senza
  modificare il markup.

Il selettore Torneo e il selettore Fase restano controlli distinti. La scelta
del torneo reimposta fase e giornata solo quando verrà aggiunta una seconda
competizione; con l'unica opzione attuale non cambia i dati mostrati.

## Componenti e confini

- `PageContainer`: applica il viewport esterno condiviso.
- `TeamTitleBar`: compone titolo, azioni e match capsule.
- `NextMatchCapsule`: riceve evento, formazione pubblicata e stato utente; non
  effettua query.
- `PlayerRosterCard`: presenta un giocatore e le statistiche pubbliche.
- `FormationBuilder`: riceve `mode` e usa la sorgente dati coerente con la
  modalità.
- `TournamentSelector`: presenta la competizione selezionata e prepara opzioni
  future.

Le query restano in funzioni dedicate o nei componenti contenitore. I
componenti presentazionali ricevono dati e callback tramite props.

## Verifica

### Test di componente

- card con ordine nome/cognome, numero nella maglia, ruolo e statistiche;
- match capsule `DRAFT` e `PUBLISHED`, incluso timestamp;
- visibilità dei controlli per anonimo, giocatore associato e manager;
- menu export playground;
- selettore Torneo con label e valore.

### Test di dominio

- messaggio testuale del playground raggruppato per reparto;
- dati privati assenti dal messaggio;
- mapping corretto degli slot ai reparti.

### Test end-to-end

- anonimo apre il playground, compone una formazione e copia il testo;
- manager apre la modalità ufficiale e mantiene le azioni riservate;
- capsula outline senza formazione e piena dopo pubblicazione;
- griglia a 2 colonne sotto 360 px, 3 su mobile standard e 6 desktop;
- nessun overflow orizzontale;
- tutte le pagine mantengono il contenitore responsive e il contenuto non
  finisce sotto la navbar.

## Fuori ambito

- persistenza server delle formazioni personali;
- condivisione tramite URL;
- creazione di nuove competizioni dal client;
- modifica del modello dati dei tornei.
