# Convocati e visibilità formazione Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il manager pubblica la formazione come privata (i giocatori vedono solo i convocati) o pubblica, cambia visibilità dopo, e copia un messaggio WhatsApp unico in due varianti: convocati o formazione.

**Architecture:** Una colonna `visibility` su `official_formations` e due policy RLS più strette nascondono la formazione privata ai giocatori; la RPC `get_event_callups` restituisce loro solo i nomi. Un'unica funzione pura `buildMatchMessage` genera il messaggio per builder, pannello e pagina evento. Il pannello della pagina evento legge la formazione (manager o pubblica) oppure i convocati (giocatore, privata).

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Supabase/PostgreSQL (MCP `apply_migration` su prod `fandfnvxrceqsjonvjtw`).

**Spec:** `docs/superpowers/specs/2026-09-30-convocati-visibility-design.md`

## Global Constraints

- Convocati = titolari + panchina della formazione pubblicata. Nessuna seconda fonte.
- Visibilità: `'PRIVATE' | 'PUBLIC'`, default `PRIVATE`.
- La privacy è imposta da RLS: un giocatore non deve poter leggere `is_starter`, `position_key`, `snapshot`, modulo, capitani di una formazione privata.
- Panchina `P1`–`P12`; regex unica `^P([1-9]|1[0-2])$` in client e database.
- Ritrovo = calcio d'inizio − 60 minuti. Emoji orologio fissa `🕘`.
- Tag messaggio: `(POR)` per ruolo `PORTIERE`; `(U35)` solo se tipo evento `PARTITA` e non portiere.
- Ordine nomi: cognome, poi nome, `localeCompare("it")` ignorando punteggiatura.
- Link Maps: solo `SS Romulea` → `https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9`.
- Divisa: `🔴 Maglia rossa` se `ROSSA`, `🔵 Maglia blu` altrimenti; senza colore la riga non compare.
- Apostrofo tipografico `’` in `Calcio d’inizio`, come nel codice esistente.
- Pulsanti azione manager: `bg-operative text-operative-foreground hover:bg-operative/90`.
- Nessuna nuova dipendenza.
- Commit e push solo quando Marco lo chiede; un solo commit di release.
- La migration va su prod: chiedere conferma a Marco prima di `apply_migration`.

## Review Focus

1. Cognomi con apostrofo o particella (`D'Oria`, `Di Mucci`): l'ordine deve essere quello che ci si aspetta a voce, `Di Mucci` prima di `D'Oria` → test in Task 1.
2. Giocatore con ruolo, data di nascita o nome mancanti: nessun tag, nessun crash, nessun `undefined` nel testo → test in Task 1.
3. Client vecchio ancora in cache che chiama `publish_official_formation` con 7 argomenti dopo la migration: deve funzionare e pubblicare privata → controllo SQL in Task 2.
4. Ripubblicare una formazione già pubblica: non deve tornare privata in silenzio perché il builder riparte dal default → il builder ripristina la visibilità salvata, verifica manuale in Task 3 (`FormationBuilder` non ha test).
5. Interruttore di visibilità che fallisce (rete, permessi): il badge resta al valore precedente e compare un toast → test in Task 4.

---

### Task 1: Messaggio unico per le partite

**Files:**
- Modify: `src/lib/formations.ts`
- Modify: `src/lib/whatsappTemplate.ts`
- Test: `src/lib/formations.test.ts`
- Test: `src/lib/whatsappTemplate.test.ts`

**Interfaces:**
- Consumes: `isU35At`, `isMatchEvent` da `@/lib/utils`; `EventType` da `@/lib/types`.
- Produces:
  - `type MatchMessageEvent = { data_ora: string | null; tipo?: EventType | null; luogo?: string | null; squadra_casa?: string | null; squadra_ospite?: string | null; avversario?: string | null }`
  - `type MatchMessagePlayer = { nome: string; cognome: string; role?: string | null; birthDate?: string | null; isStarter?: boolean }`
  - `buildMatchMessage(event: MatchMessageEvent, players: MatchMessagePlayer[], options: { lineup: boolean; shirtColor?: string | null }): string`
  - `FIELD_MAPS: Record<string, string>`
  - `isFormationBenchSlot(positionKey: string): boolean` vero per `P1`–`P12`
  - `buildOfficialFormationMessage` non esiste più.

- [ ] **Step 1: Scrivere i test che falliscono**

In `src/lib/formations.test.ts` sostituire l'import e i blocchi `isFormationBenchSlot` e `buildOfficialFormationMessage`:

```ts
import {
  buildMatchMessage,
  buildPersonalFormationMessage,
  isFormationBenchSlot,
  isUnderPlayer,
  u35Quota,
} from "@/lib/formations"

describe("isFormationBenchSlot", () => {
  it("keeps POR among starters and P1–P12 on the bench", () => {
    expect(isFormationBenchSlot("POR")).toBe(false)
    expect(isFormationBenchSlot("P1")).toBe(true)
    expect(isFormationBenchSlot("P9")).toBe(true)
    expect(isFormationBenchSlot("P10")).toBe(true)
    expect(isFormationBenchSlot("P12")).toBe(true)
    expect(isFormationBenchSlot("P13")).toBe(false)
    expect(isFormationBenchSlot("P0")).toBe(false)
  })
})
```

```ts
describe("buildMatchMessage", () => {
  // Senza offset: l'orario è nel fuso della macchina, il test vale ovunque.
  const event = {
    data_ora: "2026-10-01T21:00:00",
    tipo: "PARTITA" as const,
    luogo: "SS Romulea",
    squadra_casa: "CIRC. CHIGI",
    squadra_ospite: "TASSISTI",
  }
  const players = [
    { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE", birthDate: "2000-01-01", isStarter: true },
    { nome: "Marco", cognome: "Cipriani", role: "CENTROCAMPISTA", birthDate: "1994-05-05", isStarter: true },
    { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE", birthDate: "1980-01-01", isStarter: false },
  ]

  it("lists call-ups by surname with POR and U35 tags", () => {
    expect(
      buildMatchMessage(event, players, { lineup: false, shirtColor: "ROSSA" }),
    ).toBe(`⚽ INFO PARTITA per giovedì 01 ottobre vs TASSISTI

📍 SS Romulea https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9
🕘 Ritrovo 20:00, Calcio d’inizio 21:00

🔴 Maglia rossa

📋 CONVOCATI:
Leonardo Campoli
Marco Cipriani (U35)
Lorenzo Troiani (POR)`)
  })

  it("splits starters and bench in the lineup variant", () => {
    const message = buildMatchMessage(event, players, {
      lineup: true,
      shirtColor: "BLU",
    })

    expect(message).toContain("🔵 Maglia blu")
    expect(message).toContain(
      "🟢 TITOLARI:\nMarco Cipriani (U35)\nLorenzo Troiani (POR)\n\n🪑 PANCHINA:\nLeonardo Campoli",
    )
    expect(message).not.toContain("CONVOCATI")
  })

  it("drops U35 tags in friendlies, the link for unmapped fields and the shirt line without a colour", () => {
    const message = buildMatchMessage(
      { ...event, tipo: "AMICHEVOLE", luogo: "C.S. CAVALIERI" },
      players,
      { lineup: false },
    )

    expect(message).toContain("⚽ INFO AMICHEVOLE per giovedì 01 ottobre")
    expect(message).toContain("📍 C.S. CAVALIERI\n🕘")
    expect(message).not.toContain("(U35)")
    expect(message).toContain("Lorenzo Troiani (POR)")
    expect(message).not.toContain("Maglia")
  })

  it("sorts surnames with apostrophes and particles the way they are spoken", () => {
    const message = buildMatchMessage(
      event,
      [
        { nome: "Michele", cognome: "D'Oria" },
        { nome: "Andrea", cognome: "Di Mucci" },
        { nome: "Domenico", cognome: "Crisci" },
      ],
      { lineup: false },
    )

    expect(message).toContain(
      "📋 CONVOCATI:\nDomenico Crisci\nAndrea Di Mucci\nMichele D'Oria",
    )
  })

  it("survives missing role, birth date, place and players", () => {
    const message = buildMatchMessage(
      { ...event, luogo: null },
      [{ nome: "Luca", cognome: "Ursi", role: null, birthDate: null }],
      { lineup: false },
    )

    expect(message).toContain("📍 campo da definire\n🕘")
    expect(message).toContain("📋 CONVOCATI:\nLuca Ursi")
    expect(message).not.toContain("undefined")
    expect(message).not.toContain("(")
    expect(buildMatchMessage(event, [], { lineup: false })).toContain(
      "📋 CONVOCATI:\nAncora nessun convocato.",
    )
    expect(
      buildMatchMessage({ ...event, data_ora: null }, players, { lineup: false }),
    ).toBe("Partita senza data.")
  })
})
```

Sostituire tutto il contenuto di `src/lib/whatsappTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { genMsgWhatsApp } from "@/lib/whatsappTemplate"

describe("genMsgWhatsApp", () => {
  it("uses the match format with call-ups taken from PRESENTE answers", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-10-01T21:00:00",
        tipo: "AMICHEVOLE",
        squadra_casa: "CIRC. CHIGI",
        squadra_ospite: "RADIOTAXI 3570",
        luogo: "SS Romulea",
      },
      [
        {
          status: "PRESENTE",
          profiles: {
            nome: "Luca",
            cognome: "Limite",
            ruolo: "PORTIERE",
            data_nascita: "1991-06-24",
          },
        },
        {
          status: "ASSENTE",
          profiles: {
            nome: "Ugo",
            cognome: "Assente",
            ruolo: "DIFENSORE",
            data_nascita: "1980-01-01",
          },
        },
      ],
    )

    expect(message).toContain(
      "⚽ INFO AMICHEVOLE per giovedì 01 ottobre vs RADIOTAXI 3570",
    )
    expect(message).toContain("🕘 Ritrovo 20:00, Calcio d’inizio 21:00")
    expect(message).toContain("📋 CONVOCATI:\nLuca Limite (POR)")
    expect(message).not.toContain("Ugo Assente")
    expect(message).not.toContain("Maglia")
  })

  it("keeps the training message with U35 groups", () => {
    const message = genMsgWhatsApp(
      {
        data_ora: "2026-06-23T21:00:00",
        tipo: "ALLENAMENTO",
        luogo: "SS Romulea",
      },
      [
        {
          status: "PRESENTE",
          profiles: {
            nome: "Luca",
            cognome: "Limite",
            ruolo: "DIFENSORE",
            data_nascita: "1991-06-24",
          },
        },
      ],
    )

    expect(message).toContain("🏃‍♂️ INFO ALLENAMENTO per martedì 23 giugno")
    expect(message).toContain("Ritrovo ore 20:00 a SS Romulea")
    expect(message).toContain("Inizio allenamento ore 21:00")
    expect(message).toContain("Under 35:\nLuca Limite")
  })
})
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/lib/formations.test.ts src/lib/whatsappTemplate.test.ts`
Expected: FAIL — `buildMatchMessage is not a function`, `P10` atteso `true`, e il test partita di `genMsgWhatsApp` non trova `giovedì 01 ottobre`.

- [ ] **Step 3: Implementare in `src/lib/formations.ts`**

Sostituire l'intestazione del file fino a `isFormationBenchSlot` compresa (import, `FormationEvent`, `FormationMessagePlayer`):

```ts
import { format, subMinutes } from "date-fns"
import { it } from "date-fns/locale"

import { FORMATIONS } from "@/lib/constants"
import type { EventType } from "@/lib/types"
import { isU35At } from "@/lib/utils"

export type MatchMessageEvent = {
  data_ora: string | null
  tipo?: EventType | null
  luogo?: string | null
  squadra_casa?: string | null
  squadra_ospite?: string | null
  avversario?: string | null
}

export type MatchMessagePlayer = {
  nome: string
  cognome: string
  role?: string | null
  birthDate?: string | null
  isStarter?: boolean
}

export type PersonalFormationEntry = {
  nome: string
  cognome: string
  positionKey: string
}

type U35QuotaEntry = {
  birthDate?: string | null
  positionKey: string
  role?: string | null
}

// Panchina P1–P12: stessa regex in publish_official_formation.
export function isFormationBenchSlot(positionKey: string): boolean {
  return /^P([1-9]|1[0-2])$/.test(positionKey)
}
```

Cambiare la firma di `opponent` in `function opponent(event: MatchMessageEvent)`.

Eliminare `playerLine` e `buildOfficialFormationMessage` e mettere al loro posto:

```ts
// Link Maps per campo, con il nome scritto come in events.luogo.
// Campo non in mappa: nel messaggio resta solo il nome.
export const FIELD_MAPS: Record<string, string> = {
  "SS Romulea": "https://maps.app.goo.gl/3wF6VHvKWfo8ADNi9",
}

const bySurname = (left: MatchMessagePlayer, right: MatchMessagePlayer) =>
  left.cognome.localeCompare(right.cognome, "it", { ignorePunctuation: true }) ||
  left.nome.localeCompare(right.nome, "it", { ignorePunctuation: true })

export function buildMatchMessage(
  event: MatchMessageEvent,
  players: MatchMessagePlayer[],
  { lineup, shirtColor }: { lineup: boolean; shirtColor?: string | null },
) {
  if (!event.data_ora) return "Partita senza data."

  const matchDate = new Date(event.data_ora)
  const tipo = event.tipo ?? "PARTITA"
  const line = (player: MatchMessagePlayer) => {
    // La quota Under 35 vale solo in torneo e non conta i portieri.
    const tag =
      player.role?.toUpperCase() === "PORTIERE"
        ? " (POR)"
        : tipo === "PARTITA" && isU35At(player.birthDate, matchDate)
          ? " (U35)"
          : ""
    return `${player.nome} ${player.cognome}${tag}`
  }
  const block = (title: string, group: MatchMessagePlayer[], empty: string) =>
    `${title}\n${
      group.length ? [...group].sort(bySurname).map(line).join("\n") : empty
    }`
  const field = event.luogo?.trim() || "campo da definire"
  const map = FIELD_MAPS[field]
  const shirt =
    shirtColor === "ROSSA"
      ? "🔴 Maglia rossa"
      : shirtColor
        ? "🔵 Maglia blu"
        : null

  return [
    `⚽ INFO ${tipo} per ${format(matchDate, "EEEE dd MMMM", {
      locale: it,
    })} vs ${opponent(event) ?? "avversario da definire"}`,
    `📍 ${field}${map ? ` ${map}` : ""}\n🕘 Ritrovo ${format(
      subMinutes(matchDate, 60),
      "HH:mm",
    )}, Calcio d’inizio ${format(matchDate, "HH:mm")}`,
    shirt,
    lineup
      ? [
          block(
            "🟢 TITOLARI:",
            players.filter(({ isStarter }) => isStarter),
            "Da definire",
          ),
          block(
            "🪑 PANCHINA:",
            players.filter(({ isStarter }) => !isStarter),
            "Da definire",
          ),
        ].join("\n\n")
      : block("📋 CONVOCATI:", players, "Ancora nessun convocato."),
  ]
    .filter(Boolean)
    .join("\n\n")
}
```

`isUnderPlayer`, `u35Quota`, `U35_FIELD_MAX`, `U35_SQUAD_MAX` e `buildPersonalFormationMessage` restano come sono.

- [ ] **Step 4: Implementare in `src/lib/whatsappTemplate.ts`**

Sostituire tutto il file:

```ts
import { format, subMinutes, isToday, isTomorrow } from 'date-fns';
import { it } from 'date-fns/locale';
import { buildMatchMessage } from '@/lib/formations';
import { isMatchEvent, isU35At } from '@/lib/utils';
import type { EventType } from '@/lib/types';

type WhatsAppEvent = {
    data_ora: string | null;
    tipo: EventType;
    squadra_casa?: string | null;
    squadra_ospite?: string | null;
    avversario?: string | null;
    luogo?: string | null;
};

type WhatsAppAttendance = {
    status?: string | null;
    profiles?: {
        nome?: string | null;
        cognome?: string | null;
        ruolo?: string | null;
        data_nascita?: string | null;
    } | null;
};

export function genMsgWhatsApp(evento: WhatsAppEvent, presenze: WhatsAppAttendance[]) {
    if (!evento.data_ora) return 'Evento senza data: impossibile generare il messaggio.';

    const presenti = presenze.flatMap(({ status, profiles }) =>
        status === 'PRESENTE' && profiles ? [profiles] : []);

    // Partita senza formazione pubblicata: stesso formato, convocati = chi ha risposto presente.
    if (isMatchEvent(evento.tipo)) {
        return buildMatchMessage(
            evento,
            presenti.map((profilo) => ({
                nome: profilo.nome ?? '',
                cognome: profilo.cognome ?? '',
                role: profilo.ruolo,
                birthDate: profilo.data_nascita,
            })),
            { lineup: false },
        );
    }

    const dataEvento = new Date(evento.data_ora);
    const dataFormattata = format(dataEvento, 'EEEE d MMMM', { locale: it });
    const orarioInizio = format(dataEvento, 'HH:mm');
    const orarioRitrovo = format(subMinutes(dataEvento, 60), 'HH:mm');

    const portieri: string[] = [];
    const under35: string[] = [];
    const over35: string[] = [];

    presenti.forEach(profilo => {
        const nomeCompleto = `${profilo.nome || ''} ${profilo.cognome || ''}`.trim();

        if (profilo.ruolo?.toUpperCase() === 'PORTIERE') portieri.push(nomeCompleto);
        else if (isU35At(profilo.data_nascita, dataEvento)) under35.push(nomeCompleto);
        else over35.push(nomeCompleto);
    });

    let listaConvocati = `\n📋 CONVOCATI:\n\n`;

    if (over35.length > 0) {
        listaConvocati += over35.join('\n') + '\n\n';
    }
    if (under35.length > 0) {
        listaConvocati += `Under 35:\n${under35.join('\n')}\n\n`;
    }
    if (portieri.length > 0) {
        listaConvocati += `Portieri:\n${portieri.join('\n')}\n\n`;
    }

    if (presenti.length === 0) {
        listaConvocati += `Ancora nessun convocato confermato.\n\n`;
    }

    let saluto = "Ci vediamo al campo! 💪";
    if (isToday(dataEvento)) saluto = "Ci vediamo stasera! 💪";
    else if (isTomorrow(dataEvento)) saluto = "Ci vediamo domani! 💪";

    return `🏃‍♂️ INFO ALLENAMENTO per ${dataFormattata}

📍 DOVE E QUANDO:
Ritrovo ore ${orarioRitrovo} a ${evento.luogo || 'campo da definire'}
Inizio allenamento ore ${orarioInizio}
${listaConvocati}${saluto}`;
}
```

- [ ] **Step 5: Verificare che i test passino**

Run: `npx vitest run src/lib/formations.test.ts src/lib/whatsappTemplate.test.ts`
Expected: PASS.

`npm run typecheck` a questo punto fallisce in `FormationBuilder.tsx` (import di `buildOfficialFormationMessage`): lo chiude il Task 3.

---

### Task 2: Migration visibilità, RLS e RPC

**Files:**
- Create: `supabase/migrations/20260930152604_formation_visibility.sql` (da rinominare con la versione registrata, Step 4)

**Interfaces:**
- Consumes: `public.is_current_user_manager()`, `public.is_current_user_associated()`, `public.current_profile_id()`, `public.create_notification(text, text, text, text, uuid[], boolean, text, uuid)`.
- Produces:
  - colonna `official_formations.visibility text not null default 'PRIVATE'`
  - `get_event_callups(p_event_id uuid)` → righe `nome text, cognome text, avatar_url text, role text, birth_date date, shirt_color text, published_at timestamptz`
  - `publish_official_formation(p_event_id uuid, p_formation_module text, p_shirt_color text, p_captain_profile_id uuid, p_vice_captain_profile_id uuid, p_snapshot jsonb, p_players jsonb, p_visibility text default 'PRIVATE')` → `official_formations`
  - `set_official_formation_visibility(p_event_id uuid, p_visibility text)` → `official_formations`

Stato di prod verificato il 2026-09-30: `official_formations` è vuota; una sola firma di `publish_official_formation` (7 argomenti), identica a `20260925094129_formation_updated_notification.sql`; l'unico trigger sulla tabella è `trg_touch_updated_at`.

- [ ] **Step 1: Scrivere la migration**

`supabase/migrations/20260930152604_formation_visibility.sql`:

```sql
begin;

-- Visibilità della formazione pubblicata. PRIVATE: i giocatori vedono solo i
-- convocati (get_event_callups). PUBLIC: vedono titolari e panchina.
-- Le righe esistenti erano visibili a tutti: restano PUBLIC.
alter table public.official_formations
  add column visibility text not null default 'PUBLIC'
  constraint official_formations_visibility_check
    check (visibility in ('PRIVATE', 'PUBLIC'));
alter table public.official_formations
  alter column visibility set default 'PRIVATE';

drop policy official_formations_associated_select on public.official_formations;
create policy official_formations_associated_select
on public.official_formations for select to authenticated
using (
  public.is_current_user_manager()
  or (
    public.is_current_user_associated()
    and status = 'PUBLISHED'
    and visibility = 'PUBLIC'
  )
);

drop policy official_formation_players_associated_select
  on public.official_formation_players;
create policy official_formation_players_associated_select
on public.official_formation_players for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.official_formations f
    where f.id = formation_id
      and f.status = 'PUBLISHED'
      and f.visibility = 'PUBLIC'
      and public.is_current_user_associated()
  )
);

-- Elenco convocati per gli associati, qualunque sia la visibilità: nomi e
-- colore maglia, mai titolari, posizioni o modulo.
create or replace function public.get_event_callups(p_event_id uuid)
returns table (
  nome text,
  cognome text,
  avatar_url text,
  role text,
  birth_date date,
  shirt_color text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    player.player_snapshot->>'nome',
    player.player_snapshot->>'cognome',
    player.player_snapshot->>'avatar_url',
    player.player_snapshot->>'role',
    nullif(player.player_snapshot->>'birth_date', '')::date,
    formation.shirt_color,
    formation.published_at
  from public.official_formations formation
  join public.official_formation_players player
    on player.formation_id = formation.id
  where formation.event_id = p_event_id
    and formation.status = 'PUBLISHED'
    and formation.withdrawn_at is null
    and public.is_current_user_associated()
  order by 2, 1;
$$;

revoke all on function public.get_event_callups(uuid) from public, anon;
grant execute on function public.get_event_callups(uuid)
  to authenticated, service_role;

-- Nuova firma con p_visibility: la vecchia va tolta per non lasciare due
-- overload. Un client vecchio che passa 7 argomenti nominati risolve sulla
-- nuova grazie al default e pubblica privata.
drop function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb
);

-- Corpo identico a formation_updated_notification salvo: p_visibility,
-- panchina fino a P12, testi della notifica per la pubblicazione privata.
create function public.publish_official_formation(
  p_event_id uuid,
  p_formation_module text,
  p_shirt_color text,
  p_captain_profile_id uuid,
  p_vice_captain_profile_id uuid,
  p_snapshot jsonb,
  p_players jsonb,
  p_visibility text default 'PRIVATE'
)
returns public.official_formations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  formation public.official_formations;
  target_users uuid[];
  event_label text;
  event_date date;
  event_season_id uuid;
  event_tipo text;
  eligible_player_count integer;
  u35_field_count integer;
  u35_total_count integer;
  was_published boolean;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('PRIVATE', 'PUBLIC') then
    raise exception 'Unknown formation visibility';
  end if;
  if nullif(trim(p_formation_module), '') is null then
    raise exception 'Formation module is required';
  end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_players, '[]'::jsonb)) = 0 then
    raise exception 'At least one player is required';
  end if;

  select
    (event.data_ora at time zone 'Europe/Rome')::date,
    event.season_id,
    event.tipo
  into event_date, event_season_id, event_tipo
  from public.events event
  where event.id = p_event_id
    and event.tipo in ('PARTITA', 'AMICHEVOLE');

  if event_date is null or event_season_id is null then
    raise exception 'Match date is required for U35 validation';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as player(
      profile_id uuid,
      player_snapshot jsonb,
      is_starter boolean,
      position_key text,
      sort_order integer
    )
    where player.position_key is null
       or player.is_starter is distinct from
          (player.position_key !~ '^P([1-9]|1[0-2])$')
  ) then
    raise exception 'Formation position does not match starter status';
  end if;

  with payload as (
    select *
    from jsonb_to_recordset(p_players) as player(
      profile_id uuid,
      player_snapshot jsonb,
      is_starter boolean,
      position_key text,
      sort_order integer
    )
  )
  select
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(membership.role, '')) <> 'PORTIERE'
        and payload.position_key <> 'POR'
        and payload.position_key !~ '^P([1-9]|1[0-2])$'
        and profile.data_nascita is not null
        and profile.data_nascita <= event_date
        and date_part('year', age(event_date, profile.data_nascita)) < 35
    )::integer,
    count(*) filter (
      where upper(coalesce(membership.role, '')) <> 'PORTIERE'
        and payload.position_key <> 'POR'
        and profile.data_nascita is not null
        and profile.data_nascita <= event_date
        and date_part('year', age(event_date, profile.data_nascita)) < 35
    )::integer
  into eligible_player_count, u35_field_count, u35_total_count
  from payload
  join public.season_memberships membership
    on membership.profile_id = payload.profile_id
   and membership.season_id = event_season_id
   and membership.category = 'PLAYER'
   and (
     membership.status = 'YES'
     or (membership.status = 'TRAINING_ONLY' and event_tipo = 'AMICHEVOLE')
   )
  join public.profiles profile on profile.id = payload.profile_id;

  if eligible_player_count <> jsonb_array_length(p_players) then
    raise exception 'Player is not eligible for this match formation';
  end if;
  if event_tipo = 'PARTITA' and (u35_field_count > 3 or u35_total_count > 5) then
    raise exception 'U35 quota exceeded: maximum 3 on field and 5 called up';
  end if;

  -- Una formazione ritirata e ripubblicata torna "pubblicata", non "aggiornata".
  select exists (
    select 1
    from public.official_formations existing
    where existing.event_id = p_event_id
      and existing.status = 'PUBLISHED'
  )
  into was_published;

  insert into public.official_formations (
    event_id,
    formation_module,
    shirt_color,
    captain_profile_id,
    vice_captain_profile_id,
    snapshot,
    status,
    visibility,
    published_by,
    published_at,
    withdrawn_at
  )
  values (
    p_event_id,
    trim(p_formation_module),
    nullif(trim(p_shirt_color), ''),
    p_captain_profile_id,
    p_vice_captain_profile_id,
    coalesce(p_snapshot, '{}'::jsonb),
    'PUBLISHED',
    p_visibility,
    public.current_profile_id(),
    now(),
    null
  )
  on conflict (event_id) do update
  set formation_module = excluded.formation_module,
      shirt_color = excluded.shirt_color,
      captain_profile_id = excluded.captain_profile_id,
      vice_captain_profile_id = excluded.vice_captain_profile_id,
      snapshot = excluded.snapshot,
      status = 'PUBLISHED',
      visibility = excluded.visibility,
      published_by = excluded.published_by,
      published_at = now(),
      withdrawn_at = null,
      updated_at = now()
  returning * into formation;

  delete from public.official_formation_players
  where formation_id = formation.id;

  insert into public.official_formation_players (
    formation_id,
    profile_id,
    player_snapshot,
    is_starter,
    position_key,
    sort_order
  )
  select
    formation.id,
    player.profile_id,
    player.player_snapshot,
    player.is_starter,
    nullif(trim(player.position_key), ''),
    player.sort_order
  from jsonb_to_recordset(p_players) as player(
    profile_id uuid,
    player_snapshot jsonb,
    is_starter boolean,
    position_key text,
    sort_order integer
  );

  select
    coalesce(event.avversario, event.squadra_ospite, event.squadra_casa, 'prossima partita'),
    array_agg(distinct profile.user_id) filter (where profile.user_id is not null)
  into event_label, target_users
  from public.events event
  join public.season_memberships membership
    on membership.season_id = event.season_id
   and membership.status <> 'NO'
  join public.profiles profile on profile.id = membership.profile_id
  where event.id = p_event_id
  group by event.id;

  perform public.create_notification(
    'OFFICIAL_FORMATION_PUBLISHED',
    case
      when p_visibility = 'PRIVATE' and was_published then 'Convocati aggiornati'
      when p_visibility = 'PRIVATE' then 'Convocati pubblicati'
      when was_published then 'Formazione aggiornata'
      else 'Formazione ufficiale pubblicata'
    end,
    case
      when p_visibility = 'PRIVATE' and was_published
        then 'I convocati per ' || coalesce(event_label, 'la prossima partita') || ' sono cambiati.'
      when p_visibility = 'PRIVATE'
        then 'Sono usciti i convocati per ' || coalesce(event_label, 'la prossima partita') || '.'
      when was_published
        then 'La formazione per ' || coalesce(event_label, 'la prossima partita') || ' è cambiata.'
      else 'È disponibile la formazione per ' || coalesce(event_label, 'la prossima partita') || '.'
    end,
    '/evento/' || p_event_id::text,
    target_users,
    true,
    'official-formation:' || formation.id::text || ':' || formation.published_at::text,
    public.current_profile_id()
  );

  return formation;
end;
$function$;

revoke all on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb, text
) from public, anon;
grant execute on function public.publish_official_formation(
  uuid, text, text, uuid, uuid, jsonb, jsonb, text
) to authenticated, service_role;

-- Cambio di visibilità senza ripubblicare. Solo il passaggio a PUBLIC avvisa
-- i giocatori: è il momento in cui la formazione diventa leggibile.
create or replace function public.set_official_formation_visibility(
  p_event_id uuid,
  p_visibility text
)
returns public.official_formations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  formation public.official_formations;
  previous_visibility text;
  target_users uuid[];
  event_label text;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('PRIVATE', 'PUBLIC') then
    raise exception 'Unknown formation visibility';
  end if;

  select existing.visibility
  into previous_visibility
  from public.official_formations existing
  where existing.event_id = p_event_id
    and existing.status = 'PUBLISHED'
  for update;

  if not found then
    raise exception 'Published formation not found';
  end if;

  update public.official_formations
  set visibility = p_visibility
  where event_id = p_event_id
  returning * into formation;

  if previous_visibility = 'PRIVATE' and p_visibility = 'PUBLIC' then
    select
      coalesce(event.avversario, event.squadra_ospite, event.squadra_casa, 'prossima partita'),
      array_agg(distinct profile.user_id) filter (where profile.user_id is not null)
    into event_label, target_users
    from public.events event
    join public.season_memberships membership
      on membership.season_id = event.season_id
     and membership.status <> 'NO'
    join public.profiles profile on profile.id = membership.profile_id
    where event.id = p_event_id
    group by event.id;

    perform public.create_notification(
      'OFFICIAL_FORMATION_PUBLISHED',
      'Formazione ufficiale pubblicata',
      'È disponibile la formazione per ' || coalesce(event_label, 'la prossima partita') || '.',
      '/evento/' || p_event_id::text,
      target_users,
      true,
      'official-formation-public:' || formation.id::text || ':' || formation.updated_at::text,
      public.current_profile_id()
    );
  end if;

  return formation;
end;
$function$;

revoke all on function public.set_official_formation_visibility(uuid, text)
  from public, anon;
grant execute on function public.set_official_formation_visibility(uuid, text)
  to authenticated, service_role;

commit;
```

- [ ] **Step 2: Ricontrollare prod prima di applicare**

Con MCP `execute_sql` su `fandfnvxrceqsjonvjtw`:

```sql
select pg_get_function_identity_arguments(p.oid) as args, length(p.prosrc) as len
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'publish_official_formation';
```

Expected: una riga, 7 argomenti, `len = 6157`. Se la lunghezza è diversa qualcuno ha cambiato la funzione dopo il 2026-09-30: fermarsi, leggere la definizione con `pg_get_functiondef` e riportare la differenza nel corpo della migration prima di procedere.

- [ ] **Step 3: Applicare su prod**

Chiedere conferma a Marco. Poi MCP `apply_migration` su `fandfnvxrceqsjonvjtw`, `name: formation_visibility`, `query`: il contenuto del file senza le righe `begin;` e `commit;` (l'MCP apre già la transazione).

- [ ] **Step 4: Allineare il nome del file**

MCP `list_migrations`, leggere la versione registrata per `formation_visibility`, poi:

```bash
git mv -k supabase/migrations/20260930152604_formation_visibility.sql supabase/migrations/<versione>_formation_visibility.sql \
  || mv supabase/migrations/20260930152604_formation_visibility.sql supabase/migrations/<versione>_formation_visibility.sql
```

- [ ] **Step 5: Verificare firme e compatibilità**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.pronargdefaults
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('publish_official_formation', 'get_event_callups', 'set_official_formation_visibility')
order by 1;
select 'P12' ~ '^P([1-9]|1[0-2])$' as p12, 'P13' ~ '^P([1-9]|1[0-2])$' as p13, 'P1' ~ '^P([1-9]|1[0-2])$' as p1;
```

Expected: tre funzioni, una sola `publish_official_formation` con 8 argomenti e `pronargdefaults = 1` (è ciò che fa funzionare il client vecchio a 7 argomenti); `p12 = true`, `p13 = false`, `p1 = true`.

- [ ] **Step 6: Verificare RLS da utente non manager**

Un solo blocco che crea una formazione privata di prova, la legge come giocatore, la rende pubblica, la rilegge e finisce sempre con un'eccezione: così l'intero blocco viene annullato e su prod non resta nulla.

```sql
do $$
declare
  claims text;
  formations_seen integer;
  players_seen integer;
  callups_seen integer;
begin
  insert into public.official_formations (
    event_id, formation_module, shirt_color, status, visibility, published_by, captain_profile_id
  )
  select
    id, '4-4-2', 'ROSSA', 'PUBLISHED', 'PRIVATE',
    (select id from public.profiles where is_manager limit 1),
    (select id from public.profiles where is_manager limit 1)
  from public.events
  where tipo = 'PARTITA'
  order by data_ora desc nulls last
  limit 1;

  insert into public.official_formation_players (
    formation_id, profile_id, player_snapshot, is_starter, position_key, sort_order
  )
  select
    formation.id,
    membership.profile_id,
    jsonb_build_object('nome', 'Test', 'cognome', 'Convocato', 'role', 'DIFENSORE', 'birth_date', '1990-01-01'),
    true,
    'DC1',
    0
  from public.official_formations formation
  join public.events event on event.id = formation.event_id
  join public.season_memberships membership
    on membership.season_id = event.season_id
   and membership.category = 'PLAYER'
   and membership.status = 'YES'
  limit 1;

  select json_build_object('sub', user_id, 'role', 'authenticated')::text
  into claims
  from public.profiles
  where user_id is not null and is_manager is not true
  limit 1;
  if claims is null then
    raise exception 'FIXTURE: nessun account non manager';
  end if;
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', claims::json->>'sub', true);

  perform set_config('role', 'authenticated', true);
  select count(*) into formations_seen from public.official_formations;
  select count(*) into players_seen from public.official_formation_players;
  select count(*) into callups_seen
  from public.get_event_callups(
    (select event_id from public.public_published_formation_summaries limit 1)
  );
  perform set_config('role', 'none', true);
  if formations_seen <> 0 or players_seen <> 0 or callups_seen <> 1 then
    raise exception 'LEAK privata: formazioni=%, giocatori=%, convocati=%',
      formations_seen, players_seen, callups_seen;
  end if;

  update public.official_formations set visibility = 'PUBLIC';
  perform set_config('role', 'authenticated', true);
  select count(*) into formations_seen from public.official_formations;
  select count(*) into players_seen from public.official_formation_players;
  perform set_config('role', 'none', true);
  if formations_seen <> 1 or players_seen <> 1 then
    raise exception 'Pubblica non leggibile: formazioni=%, giocatori=%',
      formations_seen, players_seen;
  end if;

  raise exception 'ROLLBACK-OK: privata nascosta, convocati leggibili, pubblica leggibile';
end;
$$;
```

Expected: errore il cui messaggio inizia con `ROLLBACK-OK`. Qualsiasi altro messaggio (`LEAK`, `Pubblica non leggibile`, `FIXTURE`, un errore di trigger) è un fallimento da capire prima di andare avanti. Dopo, `select count(*) from public.official_formations;` deve restituire lo stesso numero di prima (0 al 2026-09-30).

---

### Task 3: Builder — panchina a 12, visibilità, due messaggi

**Files:**
- Modify: `src/components/formations/FormationBuilder.tsx`

**Interfaces:**
- Consumes: `buildMatchMessage`, `isFormationBenchSlot` (Task 1); RPC `publish_official_formation` con `p_visibility`, colonna `official_formations.visibility` (Task 2).
- Produces: niente che altri task usino.

- [ ] **Step 1: Import e panchina**

Riga 34, aggiungere `Eye` e `Lock` all'import di `lucide-react`. Riga 42, sostituire `buildOfficialFormationMessage` con `buildMatchMessage`. Riga 49:

```ts
const BENCH_SLOTS = Array.from({ length: 12 }, (_, i) => ({ id: `P${i + 1}` }));
```

- [ ] **Step 2: Stato della visibilità, ripristinato dalla formazione salvata**

Dopo lo stato `jerseyColor`:

```ts
    const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
```

In `restoreSavedFormation` aggiungere `visibility` alla select e ripristinarla accanto al colore maglia:

```ts
            .select('formation_module, shirt_color, visibility, captain_profile_id, vice_captain_profile_id, snapshot')
```

```ts
        // Ripubblicare una formazione già pubblica non deve riportarla a privata.
        if (saved.visibility === 'PUBLIC') setVisibility('PUBLIC')
```

- [ ] **Step 3: Copia messaggio in due varianti**

Sostituire `copyWhatsAppMessage`:

```ts
    const copyWhatsAppMessage = async (lineupVariant: boolean) => {
        if (!nextMatch) {
            toast.error("Nessuna prossima partita disponibile.")
            return
        }
        const message = buildMatchMessage(
            nextMatch,
            Object.entries(lineup).map(([positionKey, player]) => ({
                nome: player.nome,
                cognome: player.cognome,
                role: player.ruolo,
                birthDate: player.data_nascita,
                isStarter: !isFormationBenchSlot(positionKey),
            })),
            { lineup: lineupVariant, shirtColor: jerseyColor },
        )
        await copyOfficialFormationMessage(message)
    }
```

- [ ] **Step 4: Pubblicazione con visibilità**

Nella chiamata `rpc('publish_official_formation', …)` aggiungere dopo `p_players`:

```ts
            p_visibility: visibility,
```

e sostituire il toast di successo:

```ts
        toast.success(
            visibility === 'PUBLIC'
                ? "Formazione ufficiale pubblicata e notificata"
                : "Convocati pubblicati: la formazione resta visibile solo ai manager",
        )
```

- [ ] **Step 5: Controlli in interfaccia**

Dentro `{showOfficialControls && (<> … </>)}` sostituire il pulsante `Copia messaggio WhatsApp` con menu a due voci e interruttore di visibilità; il pulsante `Pubblica formazione ufficiale` resta dopo, invariato:

```tsx
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    aria-label="Copia messaggio WhatsApp"
                                                    className="h-9 w-9"
                                                    size="icon"
                                                    title="Copia messaggio WhatsApp"
                                                    variant="outline"
                                                >
                                                    <Copy aria-hidden="true" className="h-4 w-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-2 flex flex-col gap-1" role="menu">
                                                <Button onClick={() => void copyWhatsAppMessage(false)} role="menuitem" variant="ghost" className="justify-start text-xs h-8">
                                                    <Users aria-hidden="true" className="mr-2 h-3 w-3" /> Copia convocati
                                                </Button>
                                                <Button onClick={() => void copyWhatsAppMessage(true)} role="menuitem" variant="ghost" className="justify-start text-xs h-8">
                                                    <Copy aria-hidden="true" className="mr-2 h-3 w-3" /> Copia formazione
                                                </Button>
                                            </PopoverContent>
                                        </Popover>
                                        <Button
                                            aria-label={visibility === 'PUBLIC' ? "Formazione pubblica" : "Formazione privata"}
                                            aria-pressed={visibility === 'PUBLIC'}
                                            className="h-9 w-9"
                                            onClick={() => setVisibility(visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC')}
                                            size="icon"
                                            title={visibility === 'PUBLIC' ? "Pubblica: clicca per renderla privata" : "Privata: clicca per renderla pubblica"}
                                            variant="outline"
                                        >
                                            {visibility === 'PUBLIC'
                                                ? <Eye aria-hidden="true" className="h-4 w-4" />
                                                : <Lock aria-hidden="true" className="h-4 w-4" />}
                                        </Button>
```

Subito prima del paragrafo `Seleziona almeno un capitano o un vice capitano`, una riga che dice in chiaro cosa succederà:

```tsx
                    {showOfficialControls && (
                        <p className="text-xs font-medium text-muted-foreground">
                            {visibility === 'PUBLIC'
                                ? "Pubblica: tutti vedono titolari e panchina."
                                : "Privata: i giocatori vedono solo l’elenco dei convocati."}
                        </p>
                    )}
```

- [ ] **Step 6: Verificare**

Run: `npm run typecheck && npm run lint`
Expected: `FormationBuilder.tsx` senza errori. `src/app/evento/[id]/page.tsx` compila ancora: il pannello cambia nel Task 4 insieme alla pagina nel Task 5.

Verifica manuale con `npm run dev`, da manager, su `/squadra` → Formazione ufficiale:
1. La panchina ha 12 posti e scorre; un giocatore in `P12` resta in panchina cambiando modulo.
2. "Copia convocati" e "Copia formazione" copiano i due formati del Task 1.
3. Pubblicare come pubblica, riaprire il builder sulla stessa partita: l'interruttore parte da Pubblica (Review Focus 4).

---

### Task 4: Pannello formazione — convocati, interruttore, copia

**Files:**
- Modify: `src/components/formations/OfficialFormationPanel.tsx` (riscrittura)
- Create: `src/components/formations/OfficialFormationPanel.test.tsx`

**Interfaces:**
- Consumes: `buildMatchMessage`, `isUnderPlayer`, `MatchMessageEvent`, `MatchMessagePlayer` (Task 1); `copyOfficialFormationMessage(message: string): Promise<boolean>` da `@/lib/formationClipboard`; RPC `get_event_callups`, `set_official_formation_visibility` e colonna `visibility` (Task 2).
- Produces:
  - `type PublishedCallups = { players: MatchMessagePlayer[]; shirtColor: string | null }`
  - `OfficialFormationPanel({ event, eventId, onCallups }: { event: MatchMessageEvent; eventId: string; onCallups?: (callups: PublishedCallups | null) => void })`. La prop `eventDate` non esiste più.

- [ ] **Step 1: Scrivere i test che falliscono**

`src/components/formations/OfficialFormationPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OfficialFormationPanel } from "@/components/formations/OfficialFormationPanel"

const session = vi.hoisted(() => ({ isManager: false }))
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const databaseMocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  return { from: vi.fn(() => query), query, rpc: vi.fn() }
})

vi.mock("@/components/auth/AppSessionProvider", () => ({
  useAppSession: () => session,
}))
vi.mock("sonner", () => ({ toast: toastMocks }))
vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: { from: databaseMocks.from, rpc: databaseMocks.rpc },
}))

const event = {
  data_ora: "2026-10-01T21:00:00",
  tipo: "PARTITA" as const,
  luogo: "SS Romulea",
  squadra_casa: "CIRC. CHIGI",
  squadra_ospite: "TASSISTI",
}

const privateFormation = {
  id: "formation-1",
  formation_module: "4-4-2",
  shirt_color: "ROSSA",
  visibility: "PRIVATE",
  published_at: "2026-09-30T18:00:00+02:00",
  official_formation_players: [
    {
      id: "row-1",
      is_starter: true,
      position_key: "POR",
      sort_order: 0,
      player_snapshot: { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE" },
    },
    {
      id: "row-2",
      is_starter: false,
      position_key: "P1",
      sort_order: 1,
      player_snapshot: { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE" },
    },
  ],
}

describe("OfficialFormationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.isManager = false
    databaseMocks.query.select.mockReturnValue(databaseMocks.query)
    databaseMocks.query.eq.mockReturnValue(databaseMocks.query)
    databaseMocks.query.maybeSingle.mockResolvedValue({ data: null, error: null })
    databaseMocks.rpc.mockResolvedValue({ data: [], error: null })
  })

  it("shows a player only the call-ups of a private formation", async () => {
    databaseMocks.rpc.mockResolvedValue({
      data: [
        {
          nome: "Leonardo",
          cognome: "Campoli",
          avatar_url: null,
          role: "DIFENSORE",
          birth_date: "1980-01-01",
          shirt_color: "ROSSA",
          published_at: "2026-09-30T18:00:00+02:00",
        },
        {
          nome: "Lorenzo",
          cognome: "Troiani",
          avatar_url: null,
          role: "PORTIERE",
          birth_date: "2000-01-01",
          shirt_color: "ROSSA",
          published_at: "2026-09-30T18:00:00+02:00",
        },
      ],
      error: null,
    })

    render(<OfficialFormationPanel event={event} eventId="event-1" />)

    expect(
      await screen.findByRole("heading", { name: "Convocati" }),
    ).toBeInTheDocument()
    expect(databaseMocks.rpc).toHaveBeenCalledWith("get_event_callups", {
      p_event_id: "event-1",
    })
    expect(screen.getByText("Leonardo Campoli")).toBeInTheDocument()
    expect(screen.getByText("Lorenzo Troiani")).toBeInTheDocument()
    expect(screen.getByText(/maglia rossa/)).toBeInTheDocument()
    expect(screen.queryByText("Titolari")).not.toBeInTheDocument()
    expect(screen.queryByText(/Modulo/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders nothing for a player when nothing is published", async () => {
    const { container } = render(
      <OfficialFormationPanel event={event} eventId="event-1" />,
    )

    await waitFor(() => expect(databaseMocks.rpc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("lets a manager see the private lineup and make it public", async () => {
    session.isManager = true
    databaseMocks.query.maybeSingle.mockResolvedValue({
      data: privateFormation,
      error: null,
    })
    databaseMocks.rpc.mockResolvedValue({ data: {}, error: null })
    const onCallups = vi.fn()

    render(
      <OfficialFormationPanel
        event={event}
        eventId="event-1"
        onCallups={onCallups}
      />,
    )

    expect(await screen.findByText("Titolari")).toBeInTheDocument()
    expect(screen.getByText("Privata")).toBeInTheDocument()
    expect(onCallups).toHaveBeenLastCalledWith({
      shirtColor: "ROSSA",
      players: [
        { nome: "Lorenzo", cognome: "Troiani", role: "PORTIERE", birthDate: undefined, isStarter: true },
        { nome: "Leonardo", cognome: "Campoli", role: "DIFENSORE", birthDate: undefined, isStarter: false },
      ],
    })

    fireEvent.click(screen.getByRole("button", { name: "Rendi pubblica" }))

    expect(await screen.findByText("Pubblica")).toBeInTheDocument()
    expect(databaseMocks.rpc).toHaveBeenCalledWith(
      "set_official_formation_visibility",
      { p_event_id: "event-1", p_visibility: "PUBLIC" },
    )
    expect(
      screen.getByRole("button", { name: "Rendi privata" }),
    ).toBeInTheDocument()
  })

  it("keeps the badge and reports the error when the visibility change fails", async () => {
    session.isManager = true
    databaseMocks.query.maybeSingle.mockResolvedValue({
      data: privateFormation,
      error: null,
    })
    databaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Manager role required" },
    })

    render(<OfficialFormationPanel event={event} eventId="event-1" />)
    fireEvent.click(
      await screen.findByRole("button", { name: "Rendi pubblica" }),
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Visibilità non aggiornata",
        { description: "Manager role required" },
      ),
    )
    expect(screen.getByText("Privata")).toBeInTheDocument()
    expect(screen.queryByText("Pubblica")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/components/formations/OfficialFormationPanel.test.tsx`
Expected: FAIL — nessun heading "Convocati", nessun pulsante "Rendi pubblica".

- [ ] **Step 3: Riscrivere il pannello**

Sostituire tutto `src/components/formations/OfficialFormationPanel.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, Eye, Lock, Radio, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copyOfficialFormationMessage } from "@/lib/formationClipboard"
import {
  buildMatchMessage,
  isUnderPlayer,
  type MatchMessageEvent,
  type MatchMessagePlayer,
} from "@/lib/formations"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

type PlayerSnapshot = {
  nome?: string | null
  cognome?: string | null
  avatar_url?: string | null
  role?: string | null
  jersey_number?: number | null
  birth_date?: string | null
}

type PlayerRow = {
  id: string
  is_starter: boolean
  position_key: string | null
  sort_order: number
  player_snapshot: PlayerSnapshot
}

type Visibility = "PRIVATE" | "PUBLIC"

type OfficialFormation = {
  id: string
  formation_module: string
  shirt_color: string | null
  visibility: Visibility
  published_at: string
  official_formation_players: PlayerRow[]
}

// Riga di get_event_callups: i campi dello snapshot più il colore maglia.
type Callup = PlayerSnapshot & { shirt_color: string | null }

export type PublishedCallups = {
  players: MatchMessagePlayer[]
  shirtColor: string | null
}

const toMessagePlayer = (row: PlayerRow): MatchMessagePlayer => ({
  nome: row.player_snapshot.nome ?? "",
  cognome: row.player_snapshot.cognome ?? "",
  role: row.player_snapshot.role,
  birthDate: row.player_snapshot.birth_date,
  isStarter: row.is_starter,
})

function PlayerChip({
  eventDate,
  player,
  positionKey,
}: {
  eventDate: Date
  player: PlayerSnapshot
  positionKey?: string | null
}) {
  const under = isUnderPlayer(player.birth_date, eventDate)
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg border bg-background p-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          alt=""
          className="object-cover"
          src={player.avatar_url ?? undefined}
        />
        <AvatarFallback className="text-[10px] font-bold">
          {player.nome?.[0]}
          {player.cognome?.[0]}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">
          {player.nome} {player.cognome}
        </strong>
        <span className="text-[10px] text-muted-foreground">
          {player.role ?? positionKey ?? "—"}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {player.role === "PORTIERE" && (
          <Badge className="text-[10px]" variant="outline">
            POR
          </Badge>
        )}
        {under && (
          <Badge className="text-[10px]" variant="secondary">
            UNDER
          </Badge>
        )}
      </span>
    </div>
  )
}

export function OfficialFormationPanel({
  event,
  eventId,
  onCallups,
}: {
  event: MatchMessageEvent
  eventId: string
  /** Convocati della formazione pubblicata, per il messaggio della pagina evento. */
  onCallups?: (callups: PublishedCallups | null) => void
}) {
  const { isManager } = useAppSession()
  const [formation, setFormation] = useState<OfficialFormation | null>(null)
  const [callups, setCallups] = useState<Callup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabaseBrowser
        .from("official_formations")
        .select(
          "id, formation_module, shirt_color, visibility, published_at, official_formation_players(id, is_starter, position_key, sort_order, player_snapshot)",
        )
        .eq("event_id", eventId)
        .eq("status", "PUBLISHED")
        .maybeSingle()
      // Formazione privata: RLS la nasconde ai giocatori, che leggono solo i convocati.
      const rows =
        (data || isManager)
          ? null
          : (
              await supabaseBrowser.rpc("get_event_callups", {
                p_event_id: eventId,
              })
            ).data
      if (!active) return
      setFormation((data as OfficialFormation | null) ?? null)
      setCallups((rows as Callup[] | null) ?? [])
      setLoaded(true)
    }
    void load()
    return () => {
      active = false
    }
  }, [eventId, isManager])

  useEffect(() => {
    onCallups?.(
      formation
        ? {
            players: formation.official_formation_players.map(toMessagePlayer),
            shirtColor: formation.shirt_color,
          }
        : null,
    )
  }, [formation, onCallups])

  if (!loaded) return null

  const matchDate = event.data_ora ? new Date(event.data_ora) : new Date()

  if (!formation) {
    if (callups.length > 0) {
      const shirt = callups[0].shirt_color
      return (
        <section
          aria-labelledby="official-formation-title"
          className="overflow-hidden rounded-xl border border-primary/25 bg-primary/5"
        >
          <div className="flex items-center gap-2 border-b border-primary/15 p-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Users aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold" id="official-formation-title">
                Convocati
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {callups.length} convocati
                {shirt ? ` · maglia ${shirt.toLowerCase()}` : ""}
              </p>
            </div>
          </div>
          <div className="grid gap-1.5 p-3 sm:grid-cols-2">
            {callups.map((callup, index) => (
              <PlayerChip eventDate={matchDate} key={index} player={callup} />
            ))}
          </div>
        </section>
      )
    }
    return isManager ? (
      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        <p>La formazione ufficiale non è ancora pubblicata.</p>
        <Button
          asChild
          className="mt-3 bg-operative text-operative-foreground hover:bg-operative/90"
          size="sm"
        >
          <Link href={`/squadra?formazione=${eventId}`}>Crea formazione</Link>
        </Button>
      </div>
    ) : null
  }

  const players = [...formation.official_formation_players].sort(
    (left, right) => left.sort_order - right.sort_order,
  )
  const starters = players.filter(({ is_starter }) => is_starter)
  const bench = players.filter(({ is_starter }) => !is_starter)
  const isPublic = formation.visibility === "PUBLIC"

  const toggleVisibility = async () => {
    const next: Visibility = isPublic ? "PRIVATE" : "PUBLIC"
    setSaving(true)
    const { error } = await supabaseBrowser.rpc(
      "set_official_formation_visibility",
      { p_event_id: eventId, p_visibility: next },
    )
    setSaving(false)
    if (error) {
      toast.error("Visibilità non aggiornata", { description: error.message })
      return
    }
    setFormation({ ...formation, visibility: next })
    toast.success(
      next === "PUBLIC"
        ? "Formazione resa pubblica e notificata"
        : "Formazione di nuovo privata",
    )
  }

  const copyMessage = (lineup: boolean) =>
    copyOfficialFormationMessage(
      buildMatchMessage(event, players.map(toMessagePlayer), {
        lineup,
        shirtColor: formation.shirt_color,
      }),
    )

  return (
    <section
      aria-labelledby="official-formation-title"
      className="overflow-hidden rounded-xl border border-primary/25 bg-primary/5"
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Radio aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold" id="official-formation-title">
              Formazione ufficiale
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Modulo {formation.formation_module} · maglia{" "}
              {formation.shirt_color?.toLowerCase() ?? "da definire"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="gap-1">
            <ShieldCheck aria-hidden="true" />
            Pubblicata
          </Badge>
          {isManager && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/squadra?formazione=${eventId}`}>Modifica</Link>
            </Button>
          )}
        </div>
      </div>
      {isManager && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 p-3">
          <Badge className="gap-1" variant="outline">
            {isPublic ? (
              <Eye aria-hidden="true" />
            ) : (
              <Lock aria-hidden="true" />
            )}
            {isPublic ? "Pubblica" : "Privata"}
          </Badge>
          <Button
            className="bg-operative text-operative-foreground hover:bg-operative/90"
            disabled={saving}
            onClick={() => void toggleVisibility()}
            size="sm"
          >
            {isPublic ? "Rendi privata" : "Rendi pubblica"}
          </Button>
          <Button onClick={() => void copyMessage(false)} size="sm" variant="outline">
            <Users aria-hidden="true" />
            Copia convocati
          </Button>
          <Button onClick={() => void copyMessage(true)} size="sm" variant="outline">
            <Copy aria-hidden="true" />
            Copia formazione
          </Button>
        </div>
      )}
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Titolari
          </h4>
          <div className="grid gap-1.5">
            {starters.map((row) => (
              <PlayerChip
                eventDate={matchDate}
                key={row.id}
                player={row.player_snapshot}
                positionKey={row.position_key}
              />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Panchina
          </h4>
          <div className="grid gap-1.5">
            {bench.map((row) => (
              <PlayerChip
                eventDate={matchDate}
                key={row.id}
                player={row.player_snapshot}
                positionKey={row.position_key}
              />
            ))}
            {bench.length === 0 && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Nessuna riserva.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Verificare che i test passino**

Run: `npx vitest run src/components/formations/OfficialFormationPanel.test.tsx`
Expected: PASS, 4 test.

---

### Task 5: Pagina evento, versione, rilascio

**Files:**
- Modify: `src/app/evento/[id]/page.tsx`
- Modify: `package.json`, `package-lock.json`, `src/components/AppCredits.tsx`

**Interfaces:**
- Consumes: `OfficialFormationPanel`, `PublishedCallups` (Task 4); `buildMatchMessage` (Task 1); `genMsgWhatsApp` (Task 1).
- Produces: niente.

- [ ] **Step 1: Collegare il pannello alla pagina**

Import:

```ts
import { buildMatchMessage } from '@/lib/formations';
import { OfficialFormationPanel, type PublishedCallups } from '@/components/formations/OfficialFormationPanel';
```

Stato, accanto agli altri `useState`:

```ts
  const [publishedCallups, setPublishedCallups] = useState<PublishedCallups | null>(null);
```

In `handleCopyWhatsApp` sostituire `const testo = genMsgWhatsApp(event, formattedPresenze);`:

```ts
    // Formazione pubblicata: i convocati sono i suoi giocatori, non le presenze.
    const testo = isMatch && publishedCallups
        ? buildMatchMessage(event, publishedCallups.players, {
            lineup: false,
            shirtColor: publishedCallups.shirtColor,
        })
        : genMsgWhatsApp(event, formattedPresenze);
```

Nel JSX:

```tsx
                <OfficialFormationPanel
                  event={event}
                  eventId={id}
                  onCallups={setPublishedCallups}
                />
```

- [ ] **Step 2: Verifica completa**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tutto verde, nessun test saltato.

Verifica manuale con `npm run dev`, dopo la migration del Task 2:
1. Manager: pubblica privata da `/squadra?formazione=<id>` → pagina evento mostra formazione completa, badge "Privata", pulsanti copia.
2. Giocatore (altro account o finestra anonima): stessa pagina mostra solo "Convocati" in ordine alfabetico; arriva la notifica "Convocati pubblicati".
3. Manager: "Rendi pubblica" → il giocatore ricarica e vede titolari e panchina; arriva "Formazione ufficiale pubblicata".
4. Manager: pulsante WhatsApp in alto copia i convocati della formazione; su una partita senza formazione copia i presenti, senza riga divisa; su un allenamento copia il messaggio di prima.

- [ ] **Step 3: Caccia al bug prima del rilascio**

Rileggere `git diff` cercando regressioni e un bug vero nelle vicinanze (senza forzare): in particolare l'export PNG del builder con panchina a 12 che scorre, e `NextMatchCapsule` che dice "Pubblicata il …" anche per una formazione privata (fuori scope: segnalarlo a Marco, non correggerlo).

- [ ] **Step 4: Versione**

Controllare che nessun'altra sessione abbia già fatto il bump: `git diff package.json` deve essere vuoto e la versione `2.4.0`. Poi:

```bash
npm version 2.5.0 --no-git-tag-version
```

In `src/components/AppCredits.tsx` riga 17 portare il fallback da `"2.4.0"` a `"2.5.0"`.

- [ ] **Step 5: Commit (solo quando Marco lo chiede)**

```bash
git add docs/superpowers/specs/2026-09-30-convocati-visibility-design.md \
  docs/superpowers/plans/2026-09-30-convocati-visibility.md \
  supabase/migrations src package.json package-lock.json
git commit -m "feat: 2.5.0 — call-ups with private or public formation visibility

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
