<div align="center">

<img src="./public/icon.png" width="120" alt="Logo Circolo Chigi" />

# ⚽ Calcio Circolo Chigi

**Gestionale PWA della squadra di calcio del Circolo Chigi**
_Calendario, squadra, torneo e gestione stagionale_

[![Live Demo](https://img.shields.io/badge/demo-live-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://calcio-chigi.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](#-progressive-web-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/marcocipriani/calcio-chigi)
[![Versione](https://img.shields.io/badge/versione-2.0.0-orange?style=for-the-badge)](https://github.com/marcocipriani/calcio-chigi)

**[🌐 Apri la demo →](https://calcio-chigi.vercel.app/)** · **[💻 Repository →](https://github.com/marcocipriani/calcio-chigi)**

<sub>📅 Ultimo aggiornamento: <b>30 luglio 2026</b> · versione <b>v2.0.0</b></sub>

</div>

---

## 📖 Cos'è

App **mobile-first** che digitalizza la vita di una squadra di calcio
amatoriale: calendario impegni, disponibilità e check-in, rosa stagionale,
formazioni, statistiche ufficiali e una sala operativa completa per i manager.

I dati del campionato vengono importati automaticamente da [Enjore](https://asicalciolazio.enjore.com/) (federazione ASI).

## 📑 Indice

- [Funzionalità](#-funzionalità)
- [Screenshot](#-screenshot)
- [Stack tecnico](#-stack-tecnico)
- [Dettagli tecnici](#-dettagli-tecnici)
- [Avvio rapido](#-avvio-rapido)
- [Comandi](#-comandi)
- [Variabili d'ambiente](#-variabili-dambiente)
- [Sync Enjore](#-sync-enjore)
- [Documentazione operativa](#-documentazione-operativa)
- [Struttura del progetto](#-struttura-del-progetto)
- [Sicurezza](#-sicurezza)
- [Licenza](#-licenza)

## ✨ Funzionalità

### 👤 Giocatori

- **Calendario** di partite e allenamenti con viste lista/mese, filtri e
  countdown al prossimo incontro.
- **Disponibilità e check-in** sulla stessa riga: la risposta del giocatore
  resta distinta dal check-in ufficiale del manager, usato nelle statistiche.
- **Squadra stagionale** con giocatori in rosa e staff separati; ruolo,
  numero di maglia e statistiche pubbliche.
- **Profilo privato** con anagrafica, avatar, fototessera, certificato
  agonistico, quote, tesseramento e preferenza calendario.
- **Torneo** con classifica, calendario per giornata, fasi disponibili,
  comunicati e risultati.
- **Statistiche per annualità** con goal, assist, MVP, cartellini e presenze
  agli allenamenti (solo check-in ufficiali, al netto degli allenamenti
  saltati per infortunio).
- **Formazione personale** esportabile e condivisibile.

### 🛡️ Dirigenti (Manager)

- **Gestione squadra**: viste operative Persone, Presenze, Quote,
  Tesseramenti, Certificati e Account, con ricerca, filtri, ordinamento,
  operazioni massive e colonne persistenti per account.
- **Gestione eventi**: creazione, modifica e annullamento di partite e
  allenamenti.
- **Formazione interattiva**: campo con **drag & drop** ([dnd-kit](https://dndkit.com/)), moduli 4-4-2 / 4-3-3 / 3-5-2 / 4-2-3-1, capitano/vice, colore maglia, controllo quota U35 in campo e totale.
- **Export distinta ufficiale** in **Excel** ([ExcelJS](https://github.com/exceljs/exceljs)) precompilata dal template, ed export **PNG** della formazione ([html-to-image](https://github.com/bubkoo/html-to-image)).
- **Convocazioni WhatsApp**: messaggio generato automaticamente (ritrovo, divisa, elenco convocati diviso Under/Over/Portieri).
- **Check-in ufficiale** dalla pagina evento: switch sulla singola riga o
  switch di gruppo sulle righe selezionate, accanto alla disponibilità
  dichiarata dal giocatore.
- **Archiviazione della rosa**: la persona archiviata esce da pagine
  pubbliche, formazioni e check-in ma resta in gestione, in un elenco
  separato, con tutto lo storico.
- **Verifica quote e certificati**, tesseramenti, associazione account e
  notifiche.
- **Aggiornamento risultati** inline dalla pagina Torneo.
- **Ruoli separati**: `is_staff` descrive la rosa, `is_manager` autorizza la
  dashboard; entrambi sono protetti a livello database.

## 🖼️ Screenshot

| Calendario | Formazione | Classifica |
| :---: | :---: | :---: |
| ![Calendario](./.github/screenshots/calendario.png) | ![Formazione](./.github/screenshots/formazione.png) | ![Classifica](./.github/screenshots/classifica.png) |

## 🧩 Stack tecnico

| Area | Tecnologia |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) · React 19 |
| Linguaggio | [TypeScript](https://www.typescriptlang.org/) 5 |
| Backend | [Supabase](https://supabase.com/) — PostgreSQL 17, Auth, Storage, Realtime |
| Auth | Magic Link + Google OAuth ([@supabase/ssr](https://supabase.com/docs/guides/auth/server-side)) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 4 · [shadcn/ui](https://ui.shadcn.com/) su [Radix UI](https://www.radix-ui.com/) |
| Icone / Toast | [Lucide](https://lucide.dev/) · [Sonner](https://sonner.emilkowal.ski/) · tema chiaro/scuro ([next-themes](https://github.com/pacocoursey/next-themes)) |
| Utility | [date-fns](https://date-fns.org/) · [dnd-kit](https://dndkit.com/) · [ExcelJS](https://github.com/exceljs/exceljs) · [html-to-image](https://github.com/bubkoo/html-to-image) |
| Deploy | [Vercel](https://vercel.com/) |
| Runtime | Node.js ≥ 20 |

## 🧠 Dettagli tecnici

- **Realtime** — canali Supabase Realtime su `events` e `attendance`: presenze, risultati e nuovi eventi si aggiornano in tempo reale su tutti i client, con dedup per evitare doppioni con gli update ottimistici.
- **Classifica ibrida** — punti, differenza reti e ordinamento calcolati client-side in [`lib/utils.ts`](./src/lib/utils.ts) per aggiornamento istantaneo. Spareggi da regolamento ASI: mini-classifica avulsa (scontri diretti → diff reti → gol fatti) prima dei criteri generali.
- **Client Supabase singleton** — un unico [`lib/supabaseBrowser.ts`](./src/lib/supabaseBrowser.ts) (cookie-based, `@supabase/ssr`) condiviso da tutte le pagine; sessione refreshata a ogni richiesta da [`src/proxy.ts`](./src/proxy.ts) (convenzione *Proxy* di Next 16, ex middleware).
- **Query centralizzate** — tutte le letture Supabase in [`lib/api.ts`](./src/lib/api.ts), tipizzate.
- **Immagini** — `next/image` con `remotePatterns` per i loghi (Enjore CDN); avatar su Supabase Storage.
- **PWA** — installabile su iOS/Android, service worker per caching statico, tema e icone dedicate.

## 🚀 Avvio rapido

```bash
# 1. Clona
git clone https://github.com/marcocipriani/calcio-chigi.git
cd calcio-chigi

# 2. Dipendenze
npm install

# 3. Variabili d'ambiente (vedi sotto)
cp .env.example .env.local   # poi compila le chiavi

# 4. Backend locale
npx supabase start

# 5. Sviluppo
npm run dev
```

App su [http://localhost:3000](http://localhost:3000).

## 🛠️ Comandi

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | Server di sviluppo (Turbopack) |
| `npm run build` | Build di produzione |
| `npm run start` | Serve la build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verifica TypeScript |
| `npm test` | Test Vitest |
| `npm run test:import` | Test degli import Enjore |
| `npm run db:verify` | Verifica snapshot e migration |
| `npm run test:e2e` | Test Playwright desktop/mobile |
| `npm run sync:enjore` | Anteprima sync calendario Enjore (nessuna scrittura) |
| `npm run sync:enjore:sql` | Genera l'SQL di update del calendario |

## 🔑 Variabili d'ambiente

Crea `.env.local` nella root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # solo per gli script di sync
NEXT_PUBLIC_SITE_URL=https://calcio-chigi.vercel.app   # opzionale, per i redirect auth
```

> `SUPABASE_SERVICE_ROLE_KEY` è segreto: usato solo lato server dagli script di sync, mai esposto al client.

## 🔄 Sync Enjore

Gli script in [`scripts/`](./scripts) importano i dati del torneo da Enjore verso Supabase (richiedono `SUPABASE_SERVICE_ROLE_KEY`).

| Script | Descrizione |
| --- | --- |
| `sync-enjore-calendar.mjs` | Upsert risultati e fixture in `events` (incluse partite a tavolino senza data) |
| `sync-enjore-comunicati.mjs` | Upsert comunicati ufficiali (PDF) in `comunicati` |

```bash
# Anteprima (nessuna scrittura)
node scripts/sync-enjore-calendar.mjs
node scripts/sync-enjore-comunicati.mjs

# Applica a Supabase
node scripts/sync-enjore-calendar.mjs --apply
node scripts/sync-enjore-comunicati.mjs --apply
```

Workflow GitHub Actions in [`.github/workflows/sync-enjore.yml`](./.github/workflows/sync-enjore.yml).
> ⏸️ **Lo schedule automatico è attualmente sospeso** (resta il trigger manuale `workflow_dispatch`). Per riattivarlo, togliere il commento al `cron` nel workflow. Richiede i secret `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## 📚 Documentazione operativa

- [Deploy, migrazioni e smoke production](./docs/DEPLOY.md)
- [Gestione stagionale, import, notifiche e incidenti](./docs/OPERATIONS.md)
- [Indice della documentazione](./docs/README.md)

## 📂 Struttura del progetto

```text
src/
├── app/                    # Next.js App Router
│   ├── auth/callback/       # Callback OAuth / Magic Link
│   ├── classifica/          # Classifica (realtime) — usata anche embedded in /torneo
│   ├── evento/[id]/         # Dettaglio evento + presenze realtime
│   ├── gestione/             # Dashboard operativa manager
│   ├── giocatore/[id]/       # Profilo pubblico stagionale
│   ├── login/               # Magic Link + Google
│   ├── profilo/             # Profilo, avatar, preferenze
│   ├── squadra/             # Rosa + formazione drag&drop + export
│   ├── statistiche/         # Ranking e presenze per annualità
│   ├── torneo/              # Classifica + calendario + comunicati
│   ├── layout.tsx
│   └── page.tsx             # Home: calendario (lista/mese) + anteprima presenze
├── components/
│   ├── ui/                  # shadcn/ui (Radix + Tailwind)
│   ├── management/          # Tabelle, drawer e azioni operative
│   ├── events/              # Lista unica evento: disponibilità + check-in
│   ├── EventCard.tsx · EventDialog.tsx
│   ├── SiteHeader.tsx · BottomNav.tsx · AppCredits.tsx
│   └── theme-provider.tsx
├── lib/
│   ├── api.ts               # Query Supabase centralizzate
│   ├── supabaseBrowser.ts   # Client browser singleton (SSR cookie)
│   ├── utils.ts             # cn, calcolo classifica, età/U35
│   ├── types.ts · constants.ts · whatsappTemplate.ts
│   └── ServiceWorkerRegister.tsx
└── proxy.ts                 # Refresh sessione auth (Next 16)

supabase/
├── schema.sql               # Snapshot schema completo
└── migrations/              # RLS, trigger anti role-escalation, hardening funzioni
scripts/                     # Sync Enjore (calendario + comunicati)
public/                      # Icone PWA, manifest, service worker, template distinta
```

## 🔒 Sicurezza

- **Row Level Security** attiva su tutte le tabelle: dati pubblici esposti
  tramite proiezioni sicure, dati privati limitati al proprietario e scritture
  operative riservate ai manager.
- **Trigger anti role-escalation** — `prevent_role_escalation()` impedisce a un utente non-manager di modificare `is_manager` / `is_staff` (RLS non può filtrare per colonna).
- **Hardening funzioni** — `search_path` fissato e `EXECUTE` revocato da
  `public`, con grant espliciti solo agli RPC client necessari.
- **Storage** — avatar pubblici senza listing anonimo; fototessere e
  certificati in bucket privati con URL firmati.

Le policy e le migration vivono in [`supabase/migrations/`](./supabase/migrations).

## 📄 Licenza

Distribuito con licenza **MIT** — vedi [LICENSE](./LICENSE).

---

<div align="center">

Sviluppato da **Marco Cipriani** · con il supporto di **Claude** (Anthropic)

</div>
