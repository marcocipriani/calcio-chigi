# Gestione squadra, roster e header — design

Data: 2026-07-30

## Obiettivo

Rendere `/gestione` una dashboard operativa senza navigazione duplicata,
aggiungere una vista presenze leggibile, semplificare `/squadra` e raccordare
la presenza dei manager al comando di gestione nell'header.

## Approccio

Evolvere i componenti e le query esistenti. Nessuna nuova libreria per tabelle:
la configurazione delle colonne, i filtri e l'ordinamento restano codice locale
e tipizzato.

## Gestione squadra

La dashboard usa una sola barra di tab, in questo ordine:

1. Persone
2. Presenze
3. Quote
4. Tesseramenti
5. Certificati
6. Account

`Persone` è la vista iniziale. Ogni tab mostra il proprio contatore. Vengono
rimossi sia la card `Conferme` sia la seconda barra che oggi replica le viste.

La toolbar contiene ricerca globale, filtri contestuali alla vista e comando
`Colonne`. Le colonne dichiarano identificatore, intestazione, render,
ordinamento e filtro. Il comando `Colonne` permette di cambiarne visibilità e
ordine e di ripristinare i default. Ordinamento e filtri correnti sono
temporanei; visibilità e ordine persistono sull'account.

### Persone

Colonne predefinite:

- Persona
- Conferma
- Telefono
- Account

La cella Persona mostra avatar, nome, ruolo e, accanto al ruolo dei giocatori,
icona maglia con numero. `Dipartimento` e `Tag` non sono colonne della vista
Persone. La conferma resta una colonna filtrabile, non una tab.

### Presenze

La vista comprende solo giocatori della stagione selezionata. Colonne
predefinite:

- Persona
- Ultimi allenamenti
- Allenamenti
- Partite

`Ultimi allenamenti` seleziona gli otto allenamenti più recenti e li mostra dal
meno recente al più recente. Ogni pallino espone una sigla come `Lu 20`, tooltip
con data completa e un separatore al cambio di settimana. Verde indica
`PRESENT`, rosso indica `ABSENT`, grigio indica check-in mancante.

Allenamenti e partite mostrano separatamente `presenti/totale` e percentuale.
Per ogni persona sono esclusi gli eventi precedenti a `joined_on`. I check-in
mancanti non entrano nel denominatore, così dati operativi incompleti non
producono assenze false.

Eventi e check-in vengono caricati solo quando si apre Presenze e aggregati
lato client, riusando le tabelle esistenti.

### Tesseramenti

La colonna Fototessera mostra una miniatura quando il file esiste e lo stato
Mancante altrimenti. Il click apre un'anteprima più grande. Gli URL firmati
vengono richiesti in batch solo quando la tab Tesseramenti è attiva; il bucket
resta privato.

## Preferenze account

Una nuova tabella `profile_ui_preferences` contiene:

- `profile_id`, chiave primaria e riferimento a `profiles`;
- `management_columns`, oggetto JSON con visibilità e ordine per vista;
- `updated_at`.

Il JSON deve essere un oggetto. RLS permette select, insert e update solo
quando `profile_id = current_profile_id()`. Non vengono esposte preferenze
attraverso viste pubbliche. Il client applica default validi se il record manca
o contiene identificatori di colonne non più esistenti.

## Pagina Squadra

La pagina continua a usare `public_active_roster`, quindi non amplia
l'esposizione dei profili.

- giocatori `YES`: sezione principale `Squadra`, card normali;
- giocatori `MAYBE`: sezione `In forse`, prima dello Staff, card desaturate e
  con opacità ridotta, senza azioni;
- `PENDING`, `INTERESTED` e `NO`: non mostrati;
- Staff: sezione separata esistente.

Nella card giocatore, l'azione Info passa in alto a destra. Ruolo, icona maglia
e numero occupano la stessa riga.

## Header manager

Lo stack degli avatar manager e il comando di gestione diventano un unico
gruppo visivo. Ogni avatar usa come ring il colore già calcolato dallo stato:

- verde: online;
- ambra: attività recente;
- grigio: inattivo o mai attivo.

Il pallino in basso a destra viene rimosso. Il bottone usa etichetta `Gestione
squadra` e icona `UsersRound` al posto di `Settings2`. Il link al profilo
personale resta separato.

## Stati ed errori

- Preferenze assenti o non valide: applicare default senza bloccare la tabella.
- Salvataggio preferenze fallito: mantenere configurazione in memoria e
  mostrare toast.
- Presenze non caricabili: errore confinato alla tab Presenze.
- Fototessera non firmabile: mostrare stato non disponibile, senza esporre path.
- Mobile: card compatte; configurazione tabellare avanzata resta desktop-first.

## Verifica

Test mirati:

- visibilità, ordine, filtro e sort delle colonne;
- persistenza e fallback delle preferenze;
- aggregazione separata allenamenti/partite dopo `joined_on`;
- streak di otto allenamenti, colori, date e separatori settimanali;
- miniatura fototessera privata;
- separazione `YES` e `MAYBE` in Squadra;
- posizione Info e riga ruolo/maglia;
- ring manager per stato, assenza pallino e nuovo comando Gestione squadra;
- RLS di `profile_ui_preferences`.

Gate finali:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run db:verify`
- test DB Supabase pertinenti
- `npm run build`
