# ⚽ Calcio Circolo Chigi - Gestionale della squadra di calcio

Web App progressiva (PWA) sviluppata per la gestione completa della squadra **Circolo Chigi** nel campionato *ASI Over35 Arti & Mestieri 2025/2026*.

L'applicazione permette ai giocatori di consultare calendario e classifiche, gestire il proprio profilo e dare la disponibilità (RSVP), offrendo agli amministratori strumenti rapidi per l'aggiornamento dei risultati e delle convocazioni.

## 🚀 Scelte Tecniche (Tech Stack)

Il progetto è costruito con un approccio moderno, *serverless* e *mobile-first*.

* **Framework:** [Next.js 15](https://nextjs.org/) (App Router) - Per routing, rendering ibrido e performance.
* **Linguaggio:** [TypeScript](https://www.typescriptlang.org/) - Per la sicurezza dei tipi e manutenibilità.
* **Database & Auth:** [Supabase](https://supabase.com/) - PostgreSQL gestito, Autenticazione utenti e Row Level Security (RLS).
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework.
* **UI Components:** [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/).
* **Feedback & Loading:** [Sonner](https://sonner.emilkowal.ski/) per le notifiche Toast e Skeleton screens per il caricamento.
* **Icons:** [Lucide React](https://lucide.dev/).
* **PWA:** Implementazione nativa (Manifest + Service Worker) per installazione su dispositivi mobili e supporto offline.

## ✨ Funzionalità Principali

### 👤 Lato Utente (Giocatori)
* **Profilo Personale:** Gestione dati anagrafici, numero maglia, taglia divisa e stato medico.
* **Gestione Presenze (RSVP):** Possibilità di segnare la presenza/assenza o infortunio per ogni evento.
* **Rosa Squadra:** Visualizzazione card di tutti i compagni con dettagli tecnici.
* **Torneo & Classifica:**
    * Classifica calcolata dinamicamente con logica avanzata (scontri diretti, differenza reti).
    * Statistiche forma (Ultime 5 partite).
* **Calendario:** Lista partite passate e future, con distinzione grafica tra partite e allenamenti (Campo a 8 / a 11).

### 🛡️ Lato Admin (Manager)
* **Gestione Eventi:** Creazione, modifica e cancellazione di partite e allenamenti.
* **Aggiornamento Risultati:** Inserimento rapido dei punteggi e gestione manuale delle presenze (override).
* **Permessi Avanzati:** Gestione ruoli (Manager/Capitano) direttamente dal pannello profilo.

## 🧠 Logica e Performance

Per garantire la massima reattività e coerenza dei dati:

* **Calcolo Classifica Ibrido:** La logica di calcolo dei punti e dell'ordinamento è centralizzata in TypeScript (`utils.ts`) per permettere aggiornamenti istantanei dell'interfaccia senza attendere trigger lato database.
* **Real-time:** L'applicazione utilizza i canali Realtime di Supabase per aggiornare le presenze e i risultati in tempo reale su tutti i client connessi.
* **Sicurezza (RLS):** Policies rigorose su PostgreSQL assicurano che solo i Manager possano modificare i dati sensibili, mentre la lettura è pubblica per la squadra.

## 📱 Progressive Web App (PWA)

L'app è configurata per essere installabile come applicazione nativa su iOS e Android.
* **Manifest:** Configurazione completa (`standalone`, icone, colori tema).
* **Service Worker:** Caching statico degli asset per caricamenti istantanei e supporto offline base.
* **iOS Support:** Meta tag specifici per Apple Web App capability.

## 🛠️ Installazione e Sviluppo

1.  **Clona il repository:**
    ```bash
    git clone [https://github.com/marcocipriani/calcio-chigi.git](https://github.com/marcocipriani/calcio-chigi.git)
    cd calcio-chigi
    ```

2.  **Installa le dipendenze:**
    ```bash
    npm install
    ```

3.  **Configura le variabili d'ambiente:**
    Crea un file `.env.local` nella root del progetto e inserisci le chiavi di Supabase:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=url-supabase
    NEXT_PUBLIC_SUPABASE_KEY=key-supabase
    ```

4.  **Avvia il server di sviluppo:**
    ```bash
    npm run dev
    ```
    Apri [http://localhost:3000](http://localhost:3000) nel browser.

## 🤝 AI Credits

Progetto sviluppato con il supporto di Gemini 3 Pro.

## 📂 Struttura del Progetto

```text
src/
├── app/                 # Next.js App Router (Pagine e Layout)
│   ├── auth/            # Callback e logiche di autenticazione
│   ├── classifica/      # Vista classifica (Realtime)
│   ├── evento/[id]/     # Dettaglio evento e gestione presenze
│   ├── login/           # Pagina di accesso
│   ├── profilo/         # Gestione utente e settings
│   ├── squadra/         # Lista rosa giocatori
│   └── torneo/          # Tab Calendario/Classifica
├── components/          # Componenti React riutilizzabili
│   ├── ui/              # Componenti base (shadcn/ui, Toast, Skeleton)
│   ├── EventCard.tsx    # Card evento complessa
│   ├── EventDialog.tsx  # Modale creazione/modifica
│   └── ...
├── lib/                 # Configurazioni (Supabase, Utils, Types)
└── public/              # Assets statici (Icone PWA, Manifest)

