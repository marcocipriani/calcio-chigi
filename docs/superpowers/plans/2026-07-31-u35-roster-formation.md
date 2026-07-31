# U35 Roster and Formation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ripristinare badge e filtro U35, applicare il criterio alla data corretta e impedire la pubblicazione di formazioni ufficiali oltre quota `3 in campo / 4 convocati`.

**Architecture:** Un solo helper puro calcola l'età rispetto a una data esplicita. UI pubblica riceve solo `is_u35`; UI privata usa data nascita già disponibile. Client mostra la quota, mentre RPC ricalcola su dati DB e applica il vincolo definitivo.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Supabase/PostgreSQL, pgTAP, Vercel.

## Global Constraints

- U35 significa età minore di 35 anni alla data di riferimento.
- `Squadra` e `Gestione > Persone` usano oggi; evento e formazione usano data partita.
- Portieri mostrano badge ma non contano nelle quote.
- Data assente/non valida: né U35 né Over 35.
- Nessuna data nascita nella vista pubblica.
- Nessuna nuova dipendenza.
- Formazione personale ed export restano disponibili oltre quota.
- Pubblicazione ufficiale oltre `3/4` deve fallire anche chiamando RPC direttamente.

---

### Task 1: Helper anagrafico unico

**Files:**
- Modify: `src/lib/utils.ts`
- Create: `src/lib/utils.test.ts`
- Modify: `src/lib/formations.ts`
- Test: `src/lib/formations.test.ts`

**Interfaces:**
- Produces: `isU35At(birthDate: string | null | undefined, referenceDate: Date): boolean`
- Produces: `ageGroupAt(...): "U35" | "OVER_35" | null`
- Consumes: nessuna API applicativa.

- [ ] **Step 1: Scrivere test fallenti per soglia e dati invalidi**

```ts
expect(isU35At("1991-07-31", new Date("2026-07-30T12:00:00+02:00"))).toBe(true)
expect(isU35At("1991-07-31", new Date("2026-07-31T12:00:00+02:00"))).toBe(false)
expect(ageGroupAt(null, new Date("2026-07-31T12:00:00+02:00"))).toBeNull()
expect(ageGroupAt("invalid", new Date("2026-07-31T12:00:00+02:00"))).toBeNull()
```

- [ ] **Step 2: Verificare RED**

Run: `npx vitest run src/lib/utils.test.ts src/lib/formations.test.ts`
Expected: FAIL perché helper non esistono.

- [ ] **Step 3: Implementare helper minimo e riusarlo nei messaggi formazione**

Usare `isValid` e `differenceInYears` di `date-fns`; rifiutare data futura e reference date invalida. Eliminare calcolo duplicato `isUnderPlayer`, oppure mantenerlo solo come alias compatibile verso `isU35At`.

- [ ] **Step 4: Verificare GREEN**

Run: `npx vitest run src/lib/utils.test.ts src/lib/formations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts src/lib/formations.ts src/lib/formations.test.ts
git commit -m "fix: centralize U35 eligibility"
```

### Task 2: Badge pubblico senza esporre nascita

**Files:**
- Create: `supabase/migrations/20260731010000_u35_roster_formation_rules.sql`
- Modify: `src/components/team/PublicTeam.tsx`
- Modify: `src/components/team/PlayerRosterCard.tsx`
- Test: `src/components/team/PublicTeam.test.tsx`
- Test: `src/components/team/PlayerRosterCard.test.tsx`
- Test: `tests/db/team-management.test.sql`

**Interfaces:**
- Consumes: colonna pubblica `public_active_roster.is_u35 boolean`.
- Produces: prop `player.is_u35: boolean` e badge azzurro `U35`.

- [ ] **Step 1: Scrivere test fallenti per vista e badge**

```tsx
expect(within(card).getByText("U35")).toHaveClass("bg-sky-100", "text-sky-700")
```

pgTAP deve verificare `is_u35` presente e `data_nascita` assente dalla vista.

- [ ] **Step 2: Verificare RED**

Run: `npx vitest run src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.test.tsx`
Expected: FAIL per badge assente.

- [ ] **Step 3: Aggiungere booleano derivato e badge**

Ricreare `public_active_roster` con ultima colonna:

```sql
case
  when p.data_nascita is null then false
  else date_part('year', age((now() at time zone 'Europe/Rome')::date, p.data_nascita)) < 35
end as is_u35
```

Ripristinare grant `select` per `anon, authenticated`. Passare `is_u35` alla card e mostrare badge accanto a ruolo/maglia.

- [ ] **Step 4: Verificare GREEN UI**

Run: `npx vitest run src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731010000_u35_roster_formation_rules.sql src/components/team/PublicTeam.tsx src/components/team/PlayerRosterCard.tsx src/components/team/PublicTeam.test.tsx src/components/team/PlayerRosterCard.test.tsx tests/db/team-management.test.sql
git commit -m "fix: restore U35 roster badges"
```

### Task 3: Badge e filtro Persone

**Files:**
- Modify: `src/components/management/ManagementTable.tsx`
- Test: `src/components/management/ManagementTable.test.tsx`

**Interfaces:**
- Consumes: `ageGroupAt(person.birthDate, new Date())`.
- Produces: filtro Persona `Tutti | U35 | Over 35`.

- [ ] **Step 1: Scrivere test fallenti**

Aggiungere giocatore U35, Over 35, data mancante e staff. Verificare badge solo U35 e che ogni opzione mostri esattamente righe previste.

- [ ] **Step 2: Verificare RED**

Run: `npx vitest run src/components/management/ManagementTable.test.tsx`
Expected: FAIL perché filtro usa ancora categoria e manca badge.

- [ ] **Step 3: Implementare filtro minimo nella colonna Persona**

Aggiungere tipo filtro `ageGroup`, opzioni `""`, `U35`, `OVER_35`; `filterValue` restituisce gruppo solo per `PLAYER`. Renderizzare badge in `PersonIdentity` accanto a ruolo/maglia.

- [ ] **Step 4: Verificare GREEN**

Run: `npx vitest run src/components/management/ManagementTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/management/ManagementTable.tsx src/components/management/ManagementTable.test.tsx
git commit -m "feat: filter people by U35 status"
```

### Task 4: Quote formazione e blocco client

**Files:**
- Modify: `src/lib/formations.ts`
- Test: `src/lib/formations.test.ts`
- Modify: `src/components/formations/FormationBuilder.tsx`

**Interfaces:**
- Produces: `u35Quota(entries, matchDate): { field: number; total: number; fieldExceeded: boolean; totalExceeded: boolean; exceeded: boolean }`.
- Consumes: slot `POR`, bench `P1`-`P9`, ruolo `PORTIERE`, `birthDate`.

- [ ] **Step 1: Scrivere test fallenti per limiti**

Verificare: `3/4` valido, quarto titolare invalido, quinto convocato invalido, portiere escluso, categoria calcolata su data partita.

- [ ] **Step 2: Verificare RED**

Run: `npx vitest run src/lib/formations.test.ts`
Expected: FAIL perché `u35Quota` manca.

- [ ] **Step 3: Implementare helper e collegare builder**

Sostituire tutti gli usi correnti di `isU35` nel builder con `isU35At(..., matchDate)`. Mostrare `Campo x/3`, `Convocati x/4`; mantenere pannello rosso oltre quota. Prima della RPC:

```ts
if (quota.exceeded) {
  toast.error("Formazione oltre quota U35: massimo 3 in campo e 4 convocati.")
  return
}
```

Disabilitare comando pubblicazione e associargli motivazione accessibile; non disabilitare copia o export.

- [ ] **Step 4: Verificare GREEN e assenza vecchio limite**

Run: `npx vitest run src/lib/formations.test.ts`
Run: `rg -n "u35FieldCount > 2|Campo:.*\/2" src`
Expected: test PASS; ricerca vuota.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formations.ts src/lib/formations.test.ts src/components/formations/FormationBuilder.tsx
git commit -m "fix: enforce current U35 formation quota"
```

### Task 5: Vincolo RPC e chiamanti evento/WhatsApp

**Files:**
- Modify: `supabase/migrations/20260731010000_u35_roster_formation_rules.sql`
- Modify: `tests/db/team-management.test.sql`
- Modify: `src/app/evento/[id]/page.tsx`
- Modify: `src/lib/whatsappTemplate.ts`
- Create or modify: test mirati corrispondenti disponibili nel repository

**Interfaces:**
- Consumes: evento `data_ora`, membership della stagione evento, profilo `data_nascita`, payload `p_players`.
- Produces: eccezione RPC `U35 quota exceeded: maximum 3 on field and 4 called up`.

- [ ] **Step 1: Scrivere test DB fallenti**

Creare fixture manager, evento e giocatori: pubblicazione `3/4` riesce; quarto titolare e quinto convocato falliscono; portiere U35 non conta; profilo estraneo alla rosa fallisce.

- [ ] **Step 2: Verificare RED DB**

Run: `npx supabase test db tests/db/team-management.test.sql`
Expected: FAIL perché RPC accetta quota invalida.

- [ ] **Step 3: Ricalcolare quota dentro RPC prima di ogni scrittura**

Caricare data partita e stagione. Verificare che tutti i `profile_id` del payload siano membership `PLAYER` `YES/MAYBE` di quella stagione. Contare U35 non-portieri dai dati DB e da `is_starter`; sollevare eccezione se campo `> 3` o totale `> 4`.

Aggiornare pagina evento e template WhatsApp affinché usino data evento tramite `isU35At`, eliminando calcoli rispetto a `new Date()`.

- [ ] **Step 4: Rigenerare snapshot e verificare GREEN DB**

Run: `npm run db:snapshot`
Run: `npx supabase test db tests/db/team-management.test.sql`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731010000_u35_roster_formation_rules.sql supabase/schema.sql tests/db/team-management.test.sql src/app/evento/[id]/page.tsx src/lib/whatsappTemplate.ts
git commit -m "fix: reject invalid U35 official formations"
```

### Task 6: Gate, pubblicazione e pulizia

**Files:**
- Modify: `docs/superpowers/plans/2026-07-31-u35-roster-formation.md` solo per spuntare esecuzione.

**Interfaces:**
- Consumes: repository pulito e migrazione verificata.
- Produces: `main` pubblicato, migrazione remota applicata, deploy Vercel READY, smoke live, branch finiti rimossi.

- [ ] **Step 1: Gate locali completi**

```bash
npm test
npm run test:import
npx supabase test db tests/db/*.sql
npm run typecheck
npm run lint
npm run db:verify
npm run build
npm run test:e2e
git diff --check
```

- [ ] **Step 2: Audit requisiti e commit finale**

Verificare badge, filtri, quote, client guard, RPC guard, privacy vista e tutti i file staged. Committare solo modifiche U35 e piano.

- [ ] **Step 3: Sincronizzare e pubblicare**

Eseguire `git fetch`, integrare eventuale `origin/main` senza perdere lavoro, rieseguire gate toccati dal merge, `git push origin main`, applicare migrazione al progetto Supabase collegato dopo verifica del project ref.

- [ ] **Step 4: Verificare produzione**

Attendere deploy Vercel `READY`; verificare commit del deploy, `/squadra`, vista pubblica (`is_u35` presente, `data_nascita` assente) e RPC remota con probe non distruttivo/autorizzato.

- [ ] **Step 5: Pulire solo materiale integrato**

Elencare branch/worktree locali e remoti, provare ancestry verso `main`, rimuovere solo branch e worktree già integrati. Non eliminare branch con commit esclusivi.
