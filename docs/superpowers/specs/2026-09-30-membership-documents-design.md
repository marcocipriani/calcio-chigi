# Allegati in Gestione squadra — design

Data: 2026-09-30

## Obiettivo

Oggi la scheda persona gestisce due soli allegati, fototessera e certificato
agonistico: si caricano e si aprono in una nuova scheda, non si possono
eliminare e dalla tabella il PDF del certificato non è raggiungibile.

Il manager deve poter vedere, aggiungere ed eliminare tutti i documenti di una
persona senza uscire da Gestione squadra, e il giocatore deve poter consegnare i
propri dal Profilo. Si aggiungono quattro tipi di allegato: documento
d'identità, modulo di iscrizione, ricevuta di pagamento, altri documenti.

## Decisioni approvate

- Un'unica tabella e un unico bucket per tutti i nuovi allegati; identità e
  modulo sono lo stesso record distinto da `kind`, non tabelle dedicate.
- Carica sia il manager sia il giocatore.
- Il giocatore vede tutti gli allegati della propria scheda, anche quelli
  caricati dal manager, ed elimina solo quelli caricati da lui.
- I nuovi documenti non hanno approvazione: lo stato è solo caricato/mancante.
  Il certificato agonistico mantiene la sua revisione.
- Nessuno storico: sostituire un documento significa eliminarlo e ricaricarlo.

## Fuori scope

- Storico delle versioni di fototessera e certificato.
- Colonna ricevute nella tabella.
- Notifica al manager quando un giocatore carica un documento.
- Eliminazione del certificato da parte del giocatore.
- Pulizia dei file di storage quando una persona viene svuotata dal cestino:
  già oggi `person_trash` non rimuove gli oggetti, resta com'è.

## Dati

### Tabella `membership_documents`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` pk | generato dal client, è anche il nome del file |
| `membership_id` | `uuid` | fk `season_memberships`, `on delete cascade` |
| `kind` | `text` | `IDENTITY`, `REGISTRATION_FORM`, `PAYMENT_RECEIPT`, `OTHER` |
| `title` | `text` | obbligatorio e non vuoto se `OTHER`, altrimenti null |
| `payment_id` | `uuid` | valorizzato se e solo se `PAYMENT_RECEIPT` |
| `document_path` | `text` | unico |
| `content_type` | `text` | decide l'anteprima: immagine o PDF |
| `uploaded_by` | `uuid` | fk `profiles` `on delete set null`, default `current_profile_id()` |
| `created_at` | `timestamptz` | default `now()` |

Vincoli, tutti nel database:

- `check` su `kind`, su `title` e su `payment_id` come da tabella;
- la ricevuta deve appartenere alla stessa iscrizione della quota: fk composta
  `(payment_id, membership_id)` verso `payments (id, membership_id)`, con
  `on delete cascade`; richiede `unique (id, membership_id)` su `payments`;
- un solo documento per slot: indice unico parziale su `(membership_id, kind)`
  per `IDENTITY` e `REGISTRATION_FORM`, indice unico parziale su `payment_id`
  per `PAYMENT_RECEIPT`. `OTHER` non ha limite.

RLS, senza policy di update:

- `select`: l'iscrizione è del profilo corrente, oppure manager — stessa
  espressione di `certificates_self_manager_select`;
- `insert`: come `select`, e `uploaded_by = current_profile_id()`;
- `delete`: manager, oppure `uploaded_by = current_profile_id()`.

### Bucket `membership-documents`

Privato, 10 MB, `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
Percorso `{profileId}/{membershipId}/{documentId}`, come i bucket esistenti.

Policy su `storage.objects`, senza update perché ogni documento ha un id nuovo:

- `select`: prima cartella uguale al profilo corrente, oppure manager;
- `insert`: manager, oppure la seconda cartella è un'iscrizione del profilo
  corrente e la prima cartella è quel profilo;
- `delete`: manager, oppure proprio percorso e nessuna riga di
  `membership_documents` con quel `document_path` caricata da qualcun altro.
  Così il giocatore non può togliere il file di un documento del manager, ma
  può ripulire un file rimasto senza riga dopo un inserimento fallito.

### Flussi

- Carica: `crypto.randomUUID()`, upload del file, insert della riga; se l'insert
  fallisce il file viene rimosso. È lo stesso schema del certificato.
- Elimina: prima il file, poi la riga. Se la rimozione del file fallisce la riga
  resta e l'operazione si può ripetere.
- Sostituisci uno slot: elimina e carica.

## Interfaccia

### Componenti condivisi

- `src/lib/membership-documents.ts`: lettura dei documenti delle iscrizioni,
  upload ed eliminazione secondo i flussi sopra, etichette dei `kind`. Usato da
  Gestione squadra e da Profilo.
- `DocumentPreviewDialog`: riceve bucket, percorso e tipo; crea un URL firmato
  e mostra l'immagine oppure il PDF in un `iframe` con il viewer del browser.
  Offre sempre "Apri in nuova scheda", necessario su iOS dove l'`iframe` mostra
  solo la prima pagina.
- `MembershipDocuments`: gli slot identità e modulo, la lista "Altri documenti"
  con titolo libero e il pulsante aggiungi. Riceve `canDelete(document)` per
  distinguere manager e giocatore.

I documenti entrano nel caricamento della rosa con una sola query in più, come
già avviene per certificati e pagamenti: `ManagementPerson.documents`.

### Scheda persona in Gestione squadra

La sezione Documenti mostra quattro righe uguali — fototessera, certificato,
documento d'identità, modulo di iscrizione — ciascuna con stato, anteprima,
carica ed elimina, poi "Altri documenti".

- Fototessera: miniatura nella riga e anteprima nel dialog. Elimina azzera
  `passport_photo_path` e poi rimuove il file.
- Certificato: anteprima PDF nel dialog. Elimina rimuove riga e poi file; resta
  riservato al manager come da policy attuale.
- Ogni eliminazione chiede conferma con l'`AlertDialog` già usato nella scheda.

Nella sezione Pagamenti ogni quota mostra la ricevuta, se presente, con
anteprima ed elimina, altrimenti il pulsante per allegarla.

### Tabella

- La cella "Certificato PDF" diventa un pulsante che apre l'anteprima senza
  aprire la scheda. La fototessera lo fa già.
- Due colonne nuove, "Documento identità" e "Modulo iscrizione", con
  caricato/mancante, filtrabili e ordinabili. Entrano nelle colonne predefinite
  della vista Tesseramenti e in `ALL_COLUMN_IDS`.

### Profilo giocatore

- Nuova sezione Documenti con `MembershipDocuments`: il giocatore carica
  identità, modulo e altri documenti, vede anche quelli del manager ed elimina
  solo i propri.
- In "Quote e pagamenti" ogni quota permette di allegare e vedere la ricevuta.

## Errori

- Tipo o dimensione non validi: controllo nel client prima dell'upload con
  messaggio esplicito; il bucket li rifiuta comunque.
- Slot già occupato: l'indice unico respinge l'insert, il file appena caricato
  viene rimosso e compare "Documento già presente, eliminalo prima di
  sostituirlo".
- URL firmato non disponibile: toast "Documento non disponibile", come oggi.

## Fasi

1. Senza database: anteprima ed elimina per fototessera e certificato nella
   scheda, apertura del certificato dalla tabella.
2. Migrazione, libreria condivisa, nuovi allegati e ricevute nella scheda,
   colonne in tabella.
3. Sezione Documenti e ricevute nel Profilo.

Ogni fase è rilasciabile da sola.

## Verifica

- Test unitari di `membership-documents.ts` con client simulato: rimozione del
  file se l'insert fallisce, ordine file-poi-riga in eliminazione.
- Test dei componenti: stato caricato/mancante, elimina visibile solo dove
  `canDelete` lo consente, anteprima immagine contro PDF.
- Test della tabella: nuove colonne allineate ad `ALL_COLUMN_IDS`, cella
  certificato che non apre la scheda.
- Dopo la migrazione, controllo SQL delle policy con un profilo giocatore e uno
  manager: il giocatore non legge né scrive documenti altrui e non elimina
  quelli caricati dal manager.
- Migrazione applicata secondo il flusso del progetto: file locale rinominato
  alla versione registrata.
