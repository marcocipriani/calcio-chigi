# Deploy

## Prerequisiti

- Supabase CLI autenticata e progetto collegato.
- Vercel CLI autenticata oppure progetto collegato alla repository.
- Backup recente del database remoto prima di applicare migrazioni distruttive.
- Node.js 20+.

Non salvare service role, chiavi VAPID o segreti di dispatch nella repository.

## 1. Verifica locale

```bash
npm install
npx supabase start
npx supabase db reset
npm test
npm run test:import
npm run db:verify
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Per i test pgTAP:

```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  -c 'create extension if not exists pgtap;'
for test_file in tests/db/*.test.sql; do
  psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
    -v ON_ERROR_STOP=1 -f "$test_file"
done
```

## 2. Migrazioni Supabase

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Controllare che la migration
`20260725029000_notification_dispatch_schedule.sql` abiliti `pg_cron` e crei
il job `dispatch-team-notifications`.

## 3. Edge Functions e segreti

Generare una coppia VAPID:

```bash
npx web-push generate-vapid-keys
```

Generare anche un segreto casuale separato per il dispatcher. Impostare i
segreti Edge:

```bash
npx supabase secrets set \
  NOTIFICATION_DISPATCH_SECRET='<dispatch-secret>' \
  VAPID_PUBLIC_KEY='<vapid-public>' \
  VAPID_PRIVATE_KEY='<vapid-private>' \
  VAPID_SUBJECT='mailto:<email-operativa>'

npx supabase functions deploy account-association
npx supabase functions deploy notification-dispatch --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono forniti
automaticamente dal runtime Supabase.

Registrare in Vault URL e segreto usati dal job:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/notification-dispatch',
  'notification_dispatch_url'
);

select vault.create_secret(
  '<dispatch-secret>',
  'notification_dispatch_secret'
);
```

Se i secret esistono già, aggiornarli dal pannello Vault invece di crearne
duplicati. Verificare:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'dispatch-team-notifications';

select private.dispatch_pending_notifications();
```

## 4. Variabili Vercel

Impostare per Production e Preview:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

Non configurare `SUPABASE_SERVICE_ROLE_KEY` nel client Web. È richiesta solo
dagli script amministrativi eseguiti in un ambiente controllato.

## 5. Deploy Web

Con integrazione Git, pubblicare il branch previsto. Da CLI:

```bash
vercel --prod
```

## 6. Smoke post-deploy

- Senza login: calendario, rosa, torneo e statistiche pubbliche.
- Account non associato: selezione profilo e richiesta pendente.
- Manager: dashboard, approvazione account, modifica persona e azione massiva.
- Giocatore: profilo, quota aperta, upload fototessera e PDF certificato.
- Evento: RSVP autenticato, check-in manager e formazione ufficiale.
- Push: iscrizione browser, notifica in-app e consegna Web Push.
- Storage: URL firmati validi solo per proprietario e manager.

In caso di errore, non rilanciare l’import rosa prima di avere verificato lo
stato remoto: l’import è idempotente sui profili, ma i dati operativi vanno
comunque controllati.
