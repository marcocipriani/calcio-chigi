# Roadmap

Aggiornata il 24 ottobre 2026 (v2.8.0).

## 1. Modalità partita — rilasciata in v2.8.0

La specifica completa, con le scelte fatte, è in
[`docs/superpowers/specs/2026-10-24-modalita-partita-design.md`](docs/superpowers/specs/2026-10-24-modalita-partita-design.md);
il piano è in
[`docs/superpowers/plans/2026-10-24-modalita-partita.md`](docs/superpowers/plans/2026-10-24-modalita-partita.md).

Cosa fa:

- **Segnapunti.** Un solo manager alla volta registra la partita; chi entra
  dopo prende il controllo e il telefono precedente passa alla sola lettura.
- **Timer.** Calcolato dall'orario d'inizio salvato sul server: 2×35', recupero
  annunciato `+1…+5`, intervallo da 15', un time-out per tempo, correzione di
  ±1'.
- **Eventi in campo.** Goal (poi l'assist), giallo (il secondo propone il
  rosso), rosso e cambio, con un tocco sull'avatar. Ci sono anche goal
  avversario, autogol avversario, goal non attribuito e annulla.
- **Cambi.** Limiti 3/illimitati/7 e quota U35 in campo segnalati senza
  bloccare. Badge per diffidati e squalificati.
- **Rete scarsa.** Ogni tocco resta in coda sul telefono finché il server non
  lo conferma.
- **Fischio finale.** Un riepilogo modificabile salva risultato, statistiche
  con i minuti giocati, presenze e cronaca da copiare per WhatsApp. Il Chigio
  d'Oro aspetta il fischio finale.
- **Diretta per tutti.** Minuto, risultato e cronaca nella pagina evento, un
  banner in home e la push sui goal, disattivabile dalla campanella.

Ancora da decidere:

- tempi supplementari e rigori per le gare a eliminazione diretta (Coppa);
- se mostrare i cambi anche nella cronaca pubblica.

## 2. Fix applicati (23 ottobre 2026)

La code review del 23 ottobre ha portato a questi fix, già nel codice:

- **Sicurezza**: "Sono io" non collega più profili manager senza approvazione
  (migrazione e test pgTAP); il rifiuto della richiesta non elimina un account
  già collegato a un profilo; header `nosniff`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; `uuid` forzato a ≥ 11.1.1 (0
  vulnerabilità).
- **CI**: `.github/workflows/ci.yml` esegue typecheck, lint, test unitari, test
  degli import e del sync, e i test pgTAP su Supabase locale.
- **Affidabilità**:
  - rimosso lo snapshot `schema.sql`, che non era aggiornato;
  - le query falliscono con un errore visibile invece di apparire vuote (il
    profilo offline non manda più al login);
  - ricaricamento al ritorno in primo piano per calendario, evento e notifiche;
  - promemoria quote calcolato sul giorno di Roma;
  - il parser Enjore ha test con fixture; il sync aggiorna solo i campi cambiati.
- **Performance**:
  - ExcelJS e html-to-image si caricano solo all'export;
  - il proxy usa `getClaims()` e salta asset, PDF e `sw.js`;
  - una sola RPC di contesto all'avvio, che Home e Torneo condividono;
  - push in parallelo, fino a 100 per giro, e niente chiamata all'Edge Function
    con l'outbox vuota;
  - policy RLS con `(select auth.uid())`.
- **Pulizia**: codice morto in `api.ts`; `StandingsContent` spostato in
  `components/tournament/` (la route `/classifica` resta un redirect); cache
  immagini del service worker con un limite; README aggiornato.

**Da fare a mano per il deploy** (non parte con il push):

```bash
npx supabase db push --dry-run   # 4 migrazioni 20261023200000…200300
npx supabase db push
npx supabase functions deploy account-association --use-api
npx supabase functions deploy notification-dispatch --use-api --no-verify-jwt
```

**Rimandati di proposito**:

- Stagioni definite in tre posti: è il punto R1 qui sotto.
- Componenti oltre le 1000 righe (`ManagementDashboard`, `ManagementTable`,
  `PersonDrawer`, `profilo`): si spezzano quando si toccano.

## 3. Ora (novembre 2026)

- **Promemoria disponibilità**: push a chi non ha risposto, 48 e 24 ore prima
  di partite e allenamenti, con un cron `pg_cron` sull'outbox esistente.
- **Promemoria scadenze**: certificato medico in scadenza (a 30 e a 7 giorni) e
  quote aperte (settimanale), via push con collegamento a `/profilo`.
- **"Evento aggiornato" con il dettaglio**: "Orario spostato alle 21:00",
  "Campo: SS Romulea". Il trigger ha già `old` e `new`.

## 4. Prossimo (inverno 2026–27)

- **Calendario ICS**: feed `webcal://` personale da una route
  `app/calendario.ics/route.ts`, che si sincronizza con Google e Apple
  Calendar.
- **Offline in campo**: pagina offline e cache di calendario, prossimo evento e
  formazione pubblicata; usa la stessa coda della modalità partita.
- **Tesoreria**: riepilogo dei contanti per destinatario, saldo per stagione,
  export Excel di quote e versamenti.
- **Monitoraggio errori**: Sentry o log su tabella per gli errori client e i
  fallimenti del sync Enjore.

## 5. Prima della stagione 2027–28 (entro luglio 2027)

- **R1 — Cambio stagione senza codice**: il client legge le stagioni da
  `seasons` al posto della costante `SEASONS` in `src/lib/season.ts`; `seasons`
  ottiene `enjore_tournament_id`, letto dal sync al posto di
  `SEASON_START_YEAR` e `t=114793`.
- **R8 — Squadra propria esplicita**: `teams.is_own` ed `events.is_own_match`
  al posto di `ilike '%chigi%'` in trigger, API e home.
- **Procedura di inizio stagione** per i manager: conferma della rosa
  precedente, quote di default, apertura delle preferenze maglia.

## 6. Idee da validare con la squadra

- Storico multi-stagione nella scheda giocatore.
- Pagella post-partita legata al Chigio d'Oro.
- Car pooling per le trasferte dalla pagina evento.
