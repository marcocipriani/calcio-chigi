# Quote a rate e pagamenti parziali — design

Data: 2026-10-23

## Obiettivo

Oggi una quota è un solo importo: il giocatore dichiara "contanti" o
"bonifico" con un tap, senza dire quanto, quando né a chi, e il manager la
segna pagata tutta. Nella realtà le quote si pagano a pezzi e i contanti
passano di mano: A dà i soldi a B, B li porta al manager C.

Il manager deve poter chiedere una quota divisa in rate con scadenze diverse
(300 € → 150 entro fine novembre, 150 entro gennaio). Il giocatore deve poter
dichiarare ogni versamento con importo, data e metodo: per i contanti a chi li
ha dati, per il bonifico copiando l'IBAN della squadra. Il manager conferma
ogni versamento.

## Decisioni approvate

- Le rate sono quote normali (`payments`), una riga per rata con importo e
  scadenza propri. Nessun concetto di "piano rate" separato.
- Su una rata si possono dichiarare più versamenti, finché il residuo è zero.
- Importo del versamento: precompilato col residuo, modificabile solo in giù.
  Massimo = residuo della rata, nessuna eccedenza che scala sulla rata
  successiva. Chi vuole saldare tutto dichiara su ogni rata.
- Data del versamento obbligatoria, non nel futuro, sia per contanti sia per
  bonifico.
- Contanti: si sceglie a chi sono stati dati, tra le persone della squadra.
  Ordine della lista: prima staff, poi manager, poi calciatori; dentro ogni
  gruppo ordine alfabetico.
- Bonifico: il giocatore vede l'IBAN con tasto copia.
- Ogni versamento resta "da verificare" finché un manager lo approva o lo
  rifiuta, anche quando i contanti sono stati dati a un membro dello staff o
  a un altro giocatore. Chi riceve i contanti non conferma nulla.
- Una rata è pagata quando la somma dei versamenti approvati copre l'importo.
- Un unico IBAN per la squadra, modificabile dal manager in Gestione, con
  intestatario. IBAN di prova iniziale `IT60X0542811101000000123456`.
- Causale suggerita accanto all'IBAN, copiabile.
- La ricevuta resta allegata alla rata come oggi.

## Fuori scope

- Pagamento online / integrazione bancaria.
- Conferma da parte di chi ha ricevuto i contanti.
- Un versamento unico distribuito su più rate.
- IBAN diversi per stagione.
- Notifica a chi è stato indicato come destinatario dei contanti.

## Dati

### Tabella `payment_entries` (versamenti)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `payment_id` | `uuid` | fk `payments`, `on delete cascade` |
| `amount` | `numeric(10,2)` | `> 0` |
| `paid_on` | `date` | `<= current_date` al momento della dichiarazione |
| `method` | `payment_method` | `CASH` o `BANK_TRANSFER` |
| `cash_recipient_id` | `uuid` | fk `profiles` `on delete set null`; null se bonifico |
| `status` | `payment_entry_status` | nuovo enum `PENDING`, `VERIFIED`, `REJECTED` |
| `rejection_reason` | `text` | facoltativo |
| `declared_by` | `uuid` | fk `profiles`, default `current_profile_id()` |
| `verified_at`, `verified_by` | | valorizzati su approva/rifiuta |
| `created_at`, `updated_at` | `timestamptz` | |

Vincoli:

- `check (method = 'CASH' or cash_recipient_id is null)`;
- destinatario obbligatorio per i nuovi versamenti in contanti: controllato
  nella RPC, non nel `check`, perché i versamenti migrati non lo hanno;
- `check (status <> 'VERIFIED' or (verified_at is not null and verified_by is not null))`;
- somma degli importi `PENDING` + `VERIFIED` di una rata `<= amount_due`:
  controllata nelle RPC con `select ... for update` sulla rata.

RLS: lettura per il proprietario della quota e per i manager; nessuna
scrittura diretta, solo RPC `security definer`.

### Stato della rata

`payments.status` resta e diventa derivato, aggiornato da un trigger su
`payment_entries`:

- `PAID` se somma `VERIFIED` >= `amount_due`;
- `PENDING_REVIEW` se c'è almeno un versamento `PENDING`;
- `DUE` altrimenti (anche se parzialmente pagata).

Il trigger valorizza anche `method` (dell'ultimo versamento), `declared_at`,
`verified_at`/`verified_by` così che i `check` esistenti su `payments`
restino veri. Lo stato si ricalcola anche quando il manager cambia
`amount_due` della rata; non si può scendere sotto la somma `PENDING` +
`VERIFIED`. `guard_payment_owner_update` e l'update diretto da parte del
proprietario non servono più: il proprietario passa solo dalle RPC.

### Impostazioni pagamento

Tabella a riga singola `payment_settings` (`id boolean primary key default
true check (id)`), colonne `iban text`, `holder text`, `updated_at`,
`updated_by`. Lettura per utenti associati, scrittura solo manager. Seed con
l'IBAN di prova e intestatario `Circolo Chigi (prova)`.

### Migrazione dati esistenti

- Rate `PENDING_REVIEW` → un versamento `PENDING` di importo pieno,
  `paid_on = declared_at::date`, stesso metodo, destinatario null.
- Rate `PAID` → un versamento `VERIFIED` di importo pieno con
  `verified_at`/`verified_by` della rata, `paid_on = coalesce(declared_at,
  verified_at)::date`.
- `declare_payment(uuid, payment_method)` viene rimossa.

## RPC

- `declare_payment_entry(p_payment_id, p_amount, p_paid_on, p_method,
  p_cash_recipient_id)` — solo proprietario della rata; rata non `PAID`;
  importo `> 0` e `<=` residuo (importo meno `PENDING` + `VERIFIED`);
  data non futura; destinatario obbligatorio se contanti, vietato se bonifico,
  diverso da sé.
- `cancel_payment_entry(p_entry_id)` — il proprietario annulla un proprio
  versamento ancora `PENDING` (cancellazione della riga).
- `manager_review_payment_entry(p_entry_id, p_status, p_rejection_reason)` —
  solo manager; `VERIFIED` o `REJECTED`; solo da `PENDING`.
- `manager_record_payment_entry(p_payment_id, p_amount, p_paid_on, p_method,
  p_cash_recipient_id)` — il manager registra un versamento già approvato
  (soldi ricevuti senza dichiarazione). Sostituisce `manager_verify_payment`,
  che viene rimossa.

## Notifiche

- Nuovo versamento dichiarato → manager, `PAYMENT_DECLARED`, deep link
  `/gestione?view=quote`. La notifica parte dall'insert in
  `payment_entries`, non più dal cambio di stato della rata, così ogni
  versamento notifica anche se la rata era già da verificare.
- Versamento rifiutato → proprietario, con motivo se presente.
- `PAYMENT_DUE` alla creazione della rata resta com'è.

## Interfaccia

### Profilo → Quote e pagamenti

Ogni rata mostra descrizione, scadenza, importo, "Pagati X su Y" con barra,
stato, e sotto l'elenco dei versamenti (data, importo, metodo, destinatario se
contanti, stato; rifiutati con motivo). I versamenti `PENDING` hanno
"Annulla".

Se il residuo è > 0 e la rata non è `PAID`, pulsante "Registra pagamento"
che apre un dialog:

1. Importo — precompilato col residuo, `max` = residuo.
2. Metodo — Contanti / Bonifico.
3. Contanti → select "A chi li hai dati", gruppi Staff, Manager, Calciatori
   con intestazione, alfabetico per cognome e nome; esclusa la persona stessa.
4. Bonifico → riquadro con intestatario, IBAN e causale, ognuno con tasto
   copia.
5. Data — `<input type="date">`, default oggi, `max` oggi.

Lista destinatari: profili con iscrizione alla stagione corrente non in
cestino, più i manager. Gruppo Staff = iscrizione `STAFF`; Manager =
`is_manager` e non staff; Calciatori = il resto. Chi è sia staff sia manager
sta in Staff.

### Gestione squadra

- Dialog "Nuova quota": oltre al caso attuale (una riga), "Dividi in rate":
  righe importo + scadenza, aggiungi/rimuovi riga, totale visibile.
  Descrizione di ogni rata = `<descrizione> – rata N/M`.
- Scheda persona, sezione Pagamenti: come il profilo, più su ogni versamento
  `PENDING` i tasti Approva / Rifiuta (motivo facoltativo) e su ogni rata
  aperta "Registra versamento" (stesso dialog, senza IBAN).
- Tabella: la colonna quote mostra il residuo totale delle rate aperte; il
  tasto rapido di verifica approva tutti i versamenti `PENDING` della
  prossima rata.
- Coordinate bancarie (IBAN + intestatario) modificabili dalla vista Quote.

## Errori

Messaggi RPC tradotti in toast leggibili: importo oltre il residuo, data
futura, destinatario mancante, versamento già verificato.

## Test

- Migrazione: test SQL o script di verifica schema esistente aggiornato.
- RPC: residuo, doppia dichiarazione oltre il residuo, stato derivato dopo
  approva/rifiuta/annulla.
- UI: dialog versamento (contanti con destinatario, bonifico con IBAN),
  ordine lista destinatari, dialog rate.

## Scelte d'implementazione

- `payments.amount_paid` (somma dei versamenti verificati) è mantenuto dal
  trigger: tabella Gestione e badge "quote aperte" mostrano il residuo senza
  caricare i versamenti.
- La lista destinatari arriva dalla RPC `payment_cash_recipients()`: le RLS
  su `profiles` non permettono al giocatore di leggere gli altri profili.
- Dialog condivisi in `src/components/payments/`.
- Causale suggerita: `<descrizione rata> – <Nome Cognome>`.
