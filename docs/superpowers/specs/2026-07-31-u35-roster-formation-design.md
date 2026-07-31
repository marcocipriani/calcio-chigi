# Etichette e quote U35 — design

Data: 2026-07-31

## Obiettivo

Ripristinare l'etichetta U35 nella rosa pubblica e nella gestione persone,
aggiungere il filtro anagrafico alla vista `Persone` e aggiornare la quota della
stagione a tre U35 in campo e quattro convocati. Una formazione ufficiale oltre
quota non può essere pubblicata.

## Regola U35

Un giocatore è U35 quando, alla data di riferimento, non ha ancora compiuto 35
anni. Una data di nascita assente o non valida non viene classificata come U35
né come Over 35.

La data di riferimento è:

- oggi per `Squadra` e `Gestione > Persone`;
- la data della partita per evento, distinta, messaggio WhatsApp e formazione.

I portieri mostrano l'eventuale etichetta U35 ma non entrano nel conteggio delle
quote.

## Dati e privacy

Il calcolo usa un helper condiviso `isU35At(dataNascita, dataRiferimento)`. Non
viene salvato un nuovo flag, evitando dati derivati obsoleti.

`public_active_roster` espone il solo booleano derivato `is_u35`, calcolato alla
data corrente. La data di nascita resta esclusa dalla vista pubblica. La
dashboard di gestione calcola lo stesso valore dai dati privati già caricati.

Evento e formazione calcolano la categoria rispetto a `data_ora` della partita.
Distinta e messaggio WhatsApp riusano lo stesso criterio.

## Squadra e Persone

Le card dei giocatori in `Squadra` mostrano un badge azzurro `U35` accanto a
ruolo e numero maglia. La cella Persona della dashboard mostra lo stesso badge
nella stessa posizione logica.

La vista `Gestione > Persone` aggiunge un filtro dedicato:

- `Tutti`: mostra giocatori e staff;
- `U35`: mostra solo giocatori U35;
- `Over 35`: mostra solo giocatori con data valida che hanno almeno 35 anni.

Giocatori senza data di nascita e staff compaiono solo in `Tutti`.

## Formazione

La quota massima è:

- tre giocatori U35 di movimento tra i titolari;
- quattro giocatori U35 di movimento nell'intera convocazione.

Il riepilogo mostra `Campo x/3` e `Convocati x/4`. Quando almeno un limite è
superato, il pannello diventa rosso e indica quale quota non è valida.

Una formazione personale oltre quota resta modificabile, copiabile ed
esportabile. Nella modalità ufficiale restano disponibili copia WhatsApp ed
export Excel, ma il comando di pubblicazione è disabilitato con motivazione
accessibile.

## Vincolo di pubblicazione

Il controllo nel client serve feedback immediato. La funzione RPC di
pubblicazione ricalcola comunque entrambe le quote usando data della partita,
date di nascita correnti e ruoli presenti nel database. Se il payload supera
`3/4`, la RPC rifiuta l'operazione. Il vincolo non dipende dai dati inviati dal
browser e non può essere aggirato chiamando direttamente l'API.

## Errori e casi limite

- Data di nascita assente o non valida: nessun badge e nessun conteggio U35.
- Partita assente: la pubblicazione resta già indisponibile.
- Data partita non valida: pubblicazione rifiutata, senza usare data odierna
  come fallback.
- Profilo non più convocabile o ruolo cambiato: la RPC usa lo stato corrente e
  rifiuta un payload incoerente.

## Verifica

Test mirati:

- soglia esatta del trentacinquesimo compleanno;
- data mancante o non valida;
- badge azzurro in `Squadra` e nella cella Persona;
- filtri `Tutti`, `U35` e `Over 35`;
- tre U35 in campo validi e quattro non validi;
- quattro U35 convocati validi e cinque non validi;
- esclusione dei portieri dalle quote;
- data partita usata da evento, formazione, distinta e WhatsApp;
- RPC che rifiuta una formazione invalida anche senza controllo client;
- vista pubblica che espone `is_u35` ma non la data di nascita.

Gate finali:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run db:verify`
- test DB Supabase pertinenti
- `npm run build`

## Fuori ambito

- flag U35 persistito o modificabile manualmente;
- esposizione pubblica della data di nascita;
- blocco di copia WhatsApp, Excel o formazione personale;
- modifiche alle regole di convocazione diverse dalla quota U35.
