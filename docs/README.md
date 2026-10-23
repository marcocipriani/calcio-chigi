# Documentazione operativa

Questa cartella contiene solo procedure necessarie a eseguire e mantenere
l’applicazione:

- [DEPLOY.md](DEPLOY.md): migrazioni, Edge Functions, segreti e deploy Vercel.
- [OPERATIONS.md](OPERATIONS.md): ruoli, stagioni, onboarding, notifiche,
  import rosa, verifiche e incidenti.
- [Asset del brand](../assets/brand/README.md): sorgente, icone, splash,
  rigenerazione e verifiche visive.

La sorgente dello schema è `supabase/migrations/`. Per uno schema leggibile:

```bash
npx supabase db dump --local -f /tmp/calcio-chigi-schema.sql
```
