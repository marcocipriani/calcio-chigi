# Documentazione operativa

Questa cartella contiene solo procedure necessarie a eseguire e mantenere
l’applicazione:

- [DEPLOY.md](DEPLOY.md): migrazioni, Edge Functions, segreti e deploy Vercel.
- [OPERATIONS.md](OPERATIONS.md): ruoli, stagioni, onboarding, notifiche,
  import rosa, verifiche e incidenti.
- [Asset del brand](../assets/brand/README.md): sorgente, icone, splash,
  rigenerazione e verifiche visive.

La sorgente canonica dello schema è `supabase/migrations/`. Il file
`supabase/schema.sql` è uno snapshot generato con:

```bash
npm run db:snapshot
npm run db:verify
```
