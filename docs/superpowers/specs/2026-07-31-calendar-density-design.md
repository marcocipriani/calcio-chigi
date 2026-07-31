# Calendario compatto e leggibile — design

Data: 2026-07-31

## Obiettivo

Ridurre l'altezza della vista mensile in `/`, rendere leggibili gli eventi
dentro le celle e rendere coerente la semantica cromatica: blu per le partite,
arancione per gli allenamenti. Le partite mostrano il logo dell'avversario.

Il calendario deve gestire bene il caso normale di zero o un evento al giorno e
il caso raro di due eventi, senza aumentare inutilmente tutte le righe.

## Direzione approvata

È approvata la direzione `Card cromatiche`: eventi con riempimento leggero,
bordo più netto del colore semantico e contenuto diverso tra desktop e mobile.

- desktop: contenuto dettagliato ma compresso;
- mobile: logo o icona con orario;
- righe del calendario ad altezza fissa compatta;
- colore pieno nelle pill solo per il filtro attivo.

La direzione alternativa con card neutre e solo binario laterale colorato non
viene implementata.

## Vista desktop

La struttura attuale resta invariata: calendario mensile a sinistra e agenda a
destra. Ogni cella mensile ha altezza fissa di `112px`, rispetto agli attuali
`128px` minimi.

La data rimane in alto. Sotto possono apparire fino a due card evento compatte:

- partita: sfondo azzurro chiaro, bordo blu, logo avversario da `getLogo`, nome
  avversario in evidenza, seconda riga con ora e luogo;
- allenamento: sfondo arancione chiaro, bordo arancione, icona manubrio,
  etichetta `Allenamento`, seconda riga con ora e luogo.

Nome e luogo usano ellissi quando lo spazio non basta. Il logo misura `24px`,
resta interamente visibile con `object-contain` e non allarga la cella.

Il renderer mostra al massimo due eventi. Se dati inattesi producono un terzo
evento, compare il fallback `+N` già presente invece di rompere l'altezza.

## Vista mobile

La griglia mensile a sette colonne resta disponibile senza scorrimento
orizzontale. Ogni cella ha altezza fissa di `72px`, rispetto agli attuali
`80px` minimi.

Ogni evento usa una micro-card:

- partita: logo avversario, bordo/sfondo blu e orario;
- allenamento: icona manubrio, sfondo arancione e orario.

Con un evento la micro-card è centrata. Con due eventi le due micro-card vengono
affiancate. Ogni micro-card occupa `20px`, usa logo o icona da `16px`, gap da
`2px` e orario da `7px`, senza nascondere nessuno dei due. Nome, luogo e tipo
completo restano disponibili nel nome accessibile del link e nella pagina
evento. Anche mobile limita il rendering a due eventi e usa `+N` per dati
inattesi oltre il limite.

## Filtri e colori

La barra pill mantiene `Tutti`, `Partite`, `Allenamenti`.

- `Tutti` attivo: neutro scuro;
- `Partite` attivo: blu pieno con testo bianco;
- `Allenamenti` attivo: arancione pieno con testo bianco;
- pill inattive: neutre, senza tinta persistente.

Le icone restano visibili quando la larghezza lo permette. La stessa coppia
blu/arancione viene applicata alle card desktop, alle micro-card mobile e agli
indicatori dell'agenda laterale. Il toggle lista/calendario resta neutro.

Gli eventi annullati restano neutri, attenuati e barrati: lo stato annullato ha
precedenza sul colore del tipo.

## Dati e comportamento

Non vengono aggiunte query, dipendenze o strutture dati. Si riusano:

- `filteredEvents` per gli eventi del giorno;
- `getLogo(avversario)` e la mappa squadre esistente;
- i link correnti a `/evento/[id]`;
- navigazione del mese, comando `Oggi`, agenda e cambio lista/calendario.

Se il logo non esiste, la partita mostra il trofeo blu già usato come fallback.
La modifica resta locale ai renderer mobile e desktop in `src/app/page.tsx`,
senza introdurre un nuovo componente o una nuova astrazione.

## Accessibilità e stati

Ogni link evento espone un nome accessibile completo con tipo, avversario quando
presente, data e ora. Il logo dentro un link già nominato è decorativo per
evitare letture duplicate.

Devono restare distinguibili:

- giorno corrente;
- giorni fuori dal mese;
- evento annullato;
- card focalizzata da tastiera;
- contenuti in light e dark mode.

Il colore non è l'unico segnale: logo/trofeo identifica la partita, manubrio
identifica l'allenamento e il testo accessibile esplicita il tipo.

## Fuori scope

- modifiche alla vista lista;
- nuove interazioni di selezione del giorno;
- drawer o agenda aggiuntiva su mobile;
- modifiche a database, API o pagina dettaglio evento;
- refactoring generale di `src/app/page.tsx`.

## Verifica

Test mirati prima della modifica:

- pill `Tutti`, `Partite` e `Allenamenti` con stato e colore corretti;
- celle con zero, uno e due eventi;
- combinazione partita più allenamento nello stesso giorno;
- logo presente e fallback senza logo;
- testo lungo troncato senza overflow;
- precedenza dello stato annullato;
- altezza `112px` desktop e `72px` mobile;
- etichette accessibili complete.

Verifica finale:

- `npm test`;
- `npm run lint`;
- `npm run typecheck`;
- `npm run build`;
- E2E mirato a `390px` e `1440px`, light e dark mode;
- assenza di overflow orizzontale e regressioni su agenda e vista lista.
