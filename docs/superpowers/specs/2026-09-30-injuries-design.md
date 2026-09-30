# Infermeria: KO e storia infortuni — design

Data: 2026-09-30

## Obiettivo

"La tua disponibilità" sugli allenamenti diventa Ci sono / KO / Assente: KO non
distingue più se il giocatore è fisicamente presente. Il KO smette di essere un
voto isolato e diventa un infortunio con una durata, così il manager vede in
Gestione squadra chi è fermo, da quando, e la storia di ciascuno, e in Presenze
gli allenamenti saltati per infortunio sono riconoscibili.

## Decisioni approvate

- Un infortunio è un periodo aperto: inizia con il KO e dura finché giocatore o
  manager segna il rientro.
- Tiene date e una nota libera facoltativa.
- Sulle partite il bottone centrale resta "Spettatore" e non apre infortuni.
- Il check-in del manager resta presente/assente.
- Percentuale presenze = presenze ÷ allenamenti senza KO, con tre numeri in
  chiaro: presenze / allenamenti senza KO / tutti gli allenamenti, contati
  dall'ingresso in squadra nella stagione.
- In Presenze il KO è un quadratino bianco con croce rossa.
- La storia infortuni compare anche nella pagina del giocatore, visibile solo a
  lui e ai manager.

## Fuori scope

- Tipo di infortunio da lista chiusa, nota scritta dal giocatore.
- Notifiche al manager.
- KO automatico sulle partite durante un infortunio.
- Rinomina del valore `INFORTUNATO_PRESENTE` nei voti: cambia solo l'etichetta.

## Dati

### Tabella `injuries`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` pk | |
| `profile_id` | `uuid` | fk `profiles`, `on delete cascade` |
| `started_on` | `date` | primo giorno di KO |
| `ended_on` | `date` null | ultimo giorno di KO; null = ancora fermo |
| `note` | `text` null | solo manager e giocatore |
| `created_by` | `uuid` | fk `profiles` `on delete set null` |
| `created_at` | `timestamptz` | |

- `check (ended_on >= started_on)`.
- Un solo infortunio aperto per giocatore: indice unico parziale su
  `profile_id` dove `ended_on is null`.
- RLS: lettura al giocatore stesso e ai manager; insert, update e delete solo
  ai manager. Il giocatore scrive solo attraverso il proprio voto (trigger).

### Vista `authenticated_injury_periods`

`profile_id`, `started_on`, `ended_on` per gli account associati, senza nota.
Stesso schema di `authenticated_season_join_dates`: `/statistiche` e la pagina
evento devono calcolare il KO con la stessa regola della dashboard, e le date
non dicono più di quanto il voto KO sull'evento già mostri a tutti.

### Migrazione dei dati

I voti KO esistenti sugli allenamenti (6, tutti passati) diventano infortuni di
un giorno. Da lì in poi la sola fonte del KO in Presenze sono i periodi.

## Regole

Il giorno di un evento è la sua data a Roma.

1. Il giocatore vota KO su un allenamento: se ha un infortunio aperto, l'inizio
   viene anticipato a quel giorno se serve; se quel giorno è già coperto da un
   infortunio chiuso non succede nulla; altrimenti si apre un infortunio da
   quel giorno.
2. Con un infortunio aperto, ogni allenamento dal giorno d'inizio in poi senza
   voto risulta KO, nella pagina evento e in Presenze.
3. Il giocatore vota "Ci sono" su un evento qualsiasi, partite comprese:
   l'infortunio aperto si chiude al giorno prima.
4. Il giocatore toglie o cambia il voto sull'evento del giorno d'inizio:
   l'infortunio aperto da lui e senza nota riparte dal successivo allenamento
   già votato KO, o viene annullato se non ce ne sono. Copre il tap sbagliato.
5. Votare "Assente" durante un infortunio non lo chiude.
6. Check-in presente del manager: la presenza reale batte il KO e chiude
   l'infortunio aperto al giorno prima. Se l'infortunio inizia quello stesso
   giorno resta com'è: è chi si fa male durante l'allenamento.
7. Il manager apre, chiude, corregge ed elimina infortuni dalla scheda
   persona, con date libere anche passate.

Le regole 1, 3 e 4 stanno in un trigger su `attendance` che reagisce solo al
voto del giocatore stesso (`modified_by = profile_id`); la 6 in un trigger su
`event_checkins`. Sono atomiche con il voto e lasciano quasi invariato il
client.

## Presenze

Per ogni allenamento della stagione, in ordine:

1. prima dell'ingresso in squadra → fuori conteggio;
2. check-in presente → presente;
3. giorno dentro un infortunio → KO;
4. altrimenti assente.

Conteggio: `presenti`, `senza KO` (presenti + assenti), `tutti`
(senza KO + KO). Percentuale = presenti ÷ senza KO. In tabella e scheda:
`75% (3/4/5)`.

Lo slot KO è un quadratino bianco con croce rossa e tooltip "KO".

## Interfaccia

### Pagina evento

- Allenamenti: bottone e riga del roster dicono "KO". Partite invariate.
- Negli allenamenti un giocatore senza voto e con infortunio che copre il
  giorno compare come KO, quindi trova il KO già selezionato.

### Gestione squadra

- Nuova vista **Infermeria**: i giocatori con almeno un infortunio; il
  contatore della vista dice quanti sono KO oggi. Colonne predefinite: persona,
  infortunio ("KO dal 12 set" / "rientrato il 20 set"), numero di infortuni,
  ultimi allenamenti.
- Scheda persona, sezione **Infermeria**: la storia, una riga per infortunio
  con inizio, rientro e nota modificabili, elimina, e una riga per aggiungerne
  uno. Lasciare vuoto il rientro significa "ancora KO".

### Pagina giocatore

Sezione "Infortuni" in sola lettura. La RLS restituisce righe solo al
giocatore stesso e ai manager: per tutti gli altri la sezione non compare.

## Errori

- Secondo infortunio aperto per lo stesso giocatore: l'indice unico lo
  respinge, messaggio "Ha già un infortunio aperto: segna prima il rientro".
- Rientro precedente all'inizio: respinto dal `check`, messaggio esplicito.

## Verifica

- Test dell'aggregatore presenze: precedenza presenza/KO/assenza, tre numeri,
  periodo aperto, giorno d'inizio e di fine inclusi.
- Test dei pallini: slot KO con croce.
- Test della sezione Infermeria: sola lettura senza controlli, aggiunta e
  chiusura.
- Dopo la migrazione, blocco SQL con rollback che esercita i trigger: voto KO,
  KO anticipato, "Ci sono" che chiude, annullo sul giorno d'inizio, check-in
  che chiude e che non tocca l'infortunio dello stesso giorno, RLS per
  giocatore, altro giocatore e manager.
