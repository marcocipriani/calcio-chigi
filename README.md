# Calcio Circolo Chigi

PWA Next.js per calendario, rosa, statistiche e gestione stagionale della
squadra. L’area pubblica funziona senza login; profilo, presenze e formazioni
richiedono un account associato; la dashboard operativa è riservata ai manager.

Produzione: [calcio-chigi.vercel.app](https://calcio-chigi.vercel.app)

## Funzioni

- Calendario pubblico di partite e allenamenti, con vista desktop mensile e
  agenda affiancata.
- Rosa pubblica con giocatori confermati `YES`/`MAYBE`, staff separato e
  statistiche pubbliche di gol, assist e premi partita.
- Onboarding aperto: l’utente sceglie il proprio profilo e un manager approva
  l’associazione.
- Profilo privato con telefono, avatar, fototessera, certificato agonistico,
  quote e dichiarazioni di pagamento.
- Dashboard manager densa: filtri, viste, modifiche massive, tesseramenti,
  pagamenti, certificati, account, scadenze e notifiche.
- Formazione personale esportabile; formazione ufficiale pubblicabile dal
  manager con PNG, distinta Excel, testo WhatsApp e notifica.
- Notifiche in-app e Web Push per browser installabili su desktop, iOS e
  Android.
- Storicizzazione per stagione; `2026-2027` diventa attiva automaticamente il
  1 agosto 2026.

## Avvio locale

Requisiti: Node.js 20+, Docker e Supabase CLI.

```bash
npm install
cp .env.example .env.local
npx supabase start
npm run dev
```

L’app è disponibile su `http://localhost:3000`. Lo stack Supabase locale usa le
porte `55321`–`55324`, definite in `supabase/config.toml`.

## Verifica

```bash
npm test
npm run test:import
npm run db:verify
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

I test database pgTAP richiedono lo stack locale:

```bash
npx supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  -c 'create extension if not exists pgtap;'
for test_file in tests/db/*.test.sql; do
  psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
    -v ON_ERROR_STOP=1 -f "$test_file"
done
```

## Documentazione operativa

- [Deploy e migrazioni](docs/DEPLOY.md)
- [Gestione, notifiche, import e incidenti](docs/OPERATIONS.md)
- [Indice operativo](docs/README.md)

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase
(PostgreSQL/Auth/Storage/Edge Functions), Playwright, Vitest e Vercel.

I segreti server non devono mai usare il prefisso `NEXT_PUBLIC_`.
