# ⚽ Calcio Circolo Chigi - Gestionale della squadra di calcio

Web App progressiva (PWA) sviluppata per la gestione completa della squadra **Circolo Chigi** nel campionato *ASI Over35 Arti & Mestieri 2025/2026*.

L'applicazione permette ai giocatori di consultare calendario e classifiche, gestire il proprio profilo e visualizzare la rosa, offrendo agli amministratori strumenti rapidi per l'aggiornamento dei risultati.

## 🚀 Scelte Tecniche (Tech Stack)

Il progetto è costruito con un approccio moderno, *serverless* e *mobile-first*.

* **Framework:** [Next.js 15](https://nextjs.org/) (App Router) - Per routing, rendering ibrido e performance.
* **Linguaggio:** [TypeScript](https://www.typescriptlang.org/) - Per la sicurezza dei tipi e manutenibilità.
* **Database & Auth:** [Supabase](https://supabase.com/) - PostgreSQL gestito, Autenticazione utenti e Row Level Security (RLS).
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework.
* **UI Components:** [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) - Componenti accessibili e personalizzabili.
* **Icons:** [Lucide React](https://lucide.dev/).
* **PWA:** Implementazione nativa (Manifest + Service Worker) per installazione su dispositivi mobili e supporto offline.

## ✨ Funzionalità Principali

### 👤 Lato Utente (Giocatori)
* **Profilo Personale:** Gestione dati anagrafici, numero maglia, taglia divisa e stato medico (Infortunato/Disponibile).
* **Rosa Squadra:** Visualizzazione card di tutti i compagni con dettagli tecnici.
* **Torneo & Classifica:**
    * Classifica calcolata automaticamente in tempo reale.
    * Statistiche avanzate (Forma ultime 5 partite, Differenza reti, Media punti).
* **Calendario:** Lista partite passate e future divise per giornata.

### 🛡️ Lato Admin (Regia)
* **Gestione Risultati (Batch):** Interfaccia "Regia" per aggiornare tutti i risultati di una giornata in un colpo solo.
* **Permessi Avanzati:** Gestione ruoli (Manager/Capitano) direttamente dal pannello profilo.

## 🧠 Automazione Database (Supabase)

Una delle caratteristiche chiave è l'automazione del calcolo dei punteggi. Non esiste logica di calcolo nel frontend per la classifica.

* **SQL Triggers:** Una funzione PostgreSQL (`calculate_standings`) viene eseguita automaticamente ogni volta che un risultato viene inserito o modificato nella tabella `events`.
* **Real-time Consistency:** La tabella `standings` è sempre sincronizzata all'istante senza bisogno di cron job o calcoli lato client.
* **Sicurezza (RLS):** Policies rigorose assicurano che solo i Manager possano modificare i risultati delle partite, mentre tutti possono leggerli.

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

## 📂 Struttura del Progetto

```text
src/
├── app/                 # Next.js App Router (Pagine e Layout)
│   ├── admin/           # Pannello di controllo risultati
│   ├── classifica/      # Vista classifica (Tabella complessa)
│   ├── login/           # Autenticazione
│   ├── profilo/         # Gestione utente e settings
│   ├── squadra/         # Lista rosa giocatori
│   └── torneo/          # Tab Calendario/Classifica
├── components/          # Componenti React riutilizzabili
│   ├── ui/              # Componenti base (shadcn/ui)
│   ├── SiteHeader.tsx   # Header con logica Avatar/Auth
│   └── BottomNav.tsx    # Navigazione mobile persistente
├── lib/                 # Configurazioni (Supabase client, Utils)
└── public/              # Assets statici (Icone PWA, Manifest, SW)


## 🤝 AI Credits
⚡ Progetto sviluppato con il supporto di Gemini Pro (in una sola giornata).