# Convocati e visibilità della formazione — design

Data: 2026-09-30

## Obiettivo

Il manager pubblica la formazione di una partita scegliendo se tenerla privata
o renderla pubblica. Privata: i giocatori vedono solo l'elenco dei convocati,
titolari e panchina restano ai manager. Pubblica: tutti vedono la formazione,
come oggi. In entrambi i casi il manager copia un messaggio WhatsApp in due
varianti, solo convocati oppure formazione, con un formato unico.

## Decisioni approvate

- Convocati = titolari + panchina della formazione pubblicata. Una sola fonte.
- Visibilità scelta alla pubblicazione, preselezionata privata, modificabile
  dopo con un interruttore senza ripubblicare.
- La privacy è imposta dal database, non solo nascosta in interfaccia.
- Panchina da 9 a 12 posti: massimo 23 convocati.
- Notifiche: pubblicazione privata → "Convocati pubblicati"; pubblicazione
  pubblica o passaggio a pubblica → "Formazione pubblicata". Il passaggio a
  privata è silenzioso.
- Un solo formato di messaggio per le partite, usato da pagina evento e builder
  formazione. Gli allenamenti tengono il messaggio attuale.
- Il portiere sta nell'elenco convocati con il tag `(POR)`. Nelle partite di
  torneo gli Under 35 hanno il tag `(U35)`.
- Ritrovo un'ora prima del calcio d'inizio.
- Divisa: "Maglia rossa" o "Maglia blu" dal colore della formazione.

## Fuori scope

- Link Google Maps dei campi diversi da SS Romulea: si aggiungono in seguito
  alla mappa nel codice.
- Elenco convocati scelto a mano, separato dalla formazione.

## Aggiunte in corso d'opera

- Distinta Excel: ha 20 righe giocatore, quindi i posti panchina `P10`–`P12`
  restano fuori distinta e l'export avvisa chi è escluso.
- Builder: la panchina sta sotto il campo (griglia 6 colonne, 12 da `lg`); a
  fianco, con 12 posti, deformava il campo.
- `NextMatchCapsule`: formazione privata → "Convocati il …"; la vista
  `public_published_formation_summaries` espone `visibility`.
- Senza formazione pubblicata, lo staff che ha risposto `PRESENTE` non entra
  nei convocati della partita.
- Sicurezza: tutte le viste di `public` sono di sola lettura per `anon` e
  `authenticated` (migration `views_read_only`). Prima un anonimo poteva
  scrivere su `official_formations` e `profiles` passando dalle viste.

## Dati

Una migration.

### `official_formations.visibility`

`text not null default 'PRIVATE'`, check `visibility in ('PRIVATE', 'PUBLIC')`.
Le righe esistenti passano a `PUBLIC`: erano già visibili a tutti.

### RLS

Le policy di select per gli associati su `official_formations` e
`official_formation_players` richiedono `status = 'PUBLISHED'` e
`visibility = 'PUBLIC'`. I manager leggono sempre. Così una formazione privata
non espone ai giocatori né `is_starter` e `position_key`, né `snapshot`, modulo
e capitani.

`public_published_formation_summaries` non cambia: espone solo `event_id` e
`published_at`.

### `get_event_callups(p_event_id uuid)`

`security definer`, riservata agli utenti associati. Per la formazione
`PUBLISHED` dell'evento restituisce una riga per convocato: `nome`, `cognome`,
`avatar_url`, `role`, `birth_date` dallo snapshot del giocatore, più
`shirt_color` e `published_at` della formazione. Non restituisce `is_starter`,
`position_key`, `sort_order`, modulo. Ordinata per cognome, nome.

La data di nascita è già visibile agli associati tramite `get_event_roster`.

### `publish_official_formation`

Nuovo parametro `p_visibility text default 'PRIVATE'`, validato contro i due
valori e salvato in insert e in update. Testi della notifica:

| Caso | Titolo |
|---|---|
| Privata, prima pubblicazione | Convocati pubblicati |
| Privata, ripubblicazione | Convocati aggiornati |
| Pubblica, prima pubblicazione | Formazione ufficiale pubblicata |
| Pubblica, ripubblicazione | Formazione aggiornata |

La vecchia firma a sette parametri viene eliminata nella stessa migration per
non lasciare due overload.

Il controllo sulla posizione in panchina passa da `^P[1-9]$` a
`^P([1-9]|1[0-2])$`, nei due punti in cui compare. La quota Under 35 non
cambia.

### `set_official_formation_visibility(p_event_id uuid, p_visibility text)`

`security definer`, solo manager. Aggiorna la visibilità della formazione
pubblicata dell'evento. Se il valore passa da `PRIVATE` a `PUBLIC` manda la
notifica "Formazione ufficiale pubblicata" agli stessi destinatari della
pubblicazione. Negli altri casi nessuna notifica.

## Messaggio

`buildMatchMessage(event, players, { lineup, shirtColor })` in `src/lib/formations.ts`
sostituisce `buildOfficialFormationMessage`. Il ramo partita di
`genMsgWhatsApp` la richiama; il ramo allenamento resta com'è.

Variante convocati (`lineup: false`):

```
⚽ INFO PARTITA per giovedì 01 ottobre vs TASSISTI

📍 SS Romulea https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9
🕘 Ritrovo 20:00, Calcio d’inizio 21:00

🔴 Maglia rossa

📋 CONVOCATI:
Leonardo Campoli
Marco Cipriani (U35)
Lorenzo Troiani (POR)
```

Variante formazione (`lineup: true`): al posto di `📋 CONVOCATI:` due blocchi,
`🟢 TITOLARI:` e `🪑 PANCHINA:`, con gli stessi tag.

Regole:

- Intestazione: `INFO` + tipo evento (`PARTITA` o `AMICHEVOLE`), data
  `EEEE dd MMMM` in italiano, avversario.
- Campo: nome da `events.luogo`, seguito dal link se il nome è in `FIELD_MAPS`,
  una mappa costante nome campo → url in `src/lib/formations.ts`. Oggi contiene
  solo `SS Romulea`. Campo non in mappa: solo il nome. Senza luogo:
  `campo da definire`.
- Orologio: emoji fissa 🕘, qualunque sia l'orario.
- Divisa: 🔴 Maglia rossa se `shirt_color` è `ROSSA`, altrimenti 🔵 Maglia blu.
  Senza colore la riga non compare.
- Ordine: cognome, poi nome, `localeCompare` italiano. Nella variante
  formazione l'ordine vale dentro ciascun blocco.
- Tag `(POR)`: ruolo `PORTIERE`. Tag `(U35)`: Under 35 alla data della partita,
  solo se il tipo è `PARTITA` e il giocatore non è portiere. La quota Under 35
  non conta i portieri, quindi un portiere mostra solo `(POR)`.
- Nessun convocato: `Ancora nessun convocato.` sotto l'intestazione del blocco.

## Interfaccia

### `FormationBuilder`

- Panchina a 12 posti.
- Accanto a "Pubblica" una scelta Privata / Pubblica. Parte da privata; se la
  formazione è già pubblicata parte dal valore salvato.
- Due pulsanti al posto di quello attuale: "Copia convocati" e "Copia
  formazione".

### `OfficialFormationPanel`

- Manager: vista completa come oggi, badge con la visibilità e interruttore che
  chiama `set_official_formation_visibility`.
- Giocatore, formazione pubblica: come oggi.
- Giocatore, formazione privata: la select sulla tabella torna vuota, il
  pannello chiama `get_event_callups` e mostra un solo blocco "Convocati" in
  ordine alfabetico, con i badge POR e UNDER e il colore della maglia. Niente
  modulo, niente titolari e panchina.
- Nessuna formazione pubblicata: come oggi.

### Pagina evento

Per partite e amichevoli, lato manager:

- con formazione pubblicata il pannello formazione offre "Copia convocati" e
  "Copia formazione", e il pulsante WhatsApp in alto copia i convocati della
  formazione;
- senza formazione il pulsante WhatsApp copia la variante convocati usando chi
  ha risposto `PRESENTE`, senza riga divisa.

## Errori

- `publish_official_formation` e `set_official_formation_visibility` rifiutano
  valori di visibilità sconosciuti e utenti non manager.
- Interruttore fallito: toast con l'errore, il badge resta al valore
  precedente.
- Copia negli appunti fallita: toast esistente di `copyOfficialFormationMessage`.

## Test

- `formations.test.ts`: `buildMatchMessage` nelle due varianti, ordine per
  cognome, tag `(POR)` e `(U35)`, niente `(U35)` in amichevole, portiere Under
  senza `(U35)`, link presente per SS Romulea e assente per un altro campo, riga divisa
  assente senza colore, `isFormationBenchSlot("P12")` vero e `"P13"` falso.
- `whatsappTemplate.test.ts`: ramo partita nel nuovo formato, ramo allenamento
  invariato.
- `OfficialFormationPanel`: un giocatore con formazione privata vede i
  convocati e non vede "Titolari".
- Database, dopo la migration: da utente non manager la select su
  `official_formation_players` di una formazione privata torna vuota e
  `get_event_callups` restituisce i nomi.
