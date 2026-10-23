# Roadmap

Aggiornata il 23 ottobre 2026 (v2.7.0).

## 1. Modalità partita (prima priorità)

Oggi i dati della partita si inseriscono a mano dopo il fischio finale: risultato
dalla pagina Torneo, goal, assist e cartellini dalla pagina evento
(`match_player_stats`). La modalità partita li registra **mentre si gioca**, dal
telefono del manager a bordo campo. A fine gara il risultato e le statistiche
sono già pronti e il Chigio d'Oro si apre da solo.

### Come si usa

1. **Avvio.** Dalla pagina di una partita o di un'amichevole, il manager tocca
   "Modalità partita". Si apre una schermata a tutto schermo con lo schermo
   sempre acceso (Wake Lock API). Titolari e panchina arrivano dalla formazione
   ufficiale pubblicata (`official_formation_players`).
2. **Timer.** "Calcio d'inizio" avvia il primo tempo. La durata dei tempi viene
   dal regolamento ASI: 2 tempi da 35 minuti e intervallo di 15 minuti; per le
   amichevoli è modificabile. Il timer non conta i secondi sul telefono: li
   ricava dall'orario di inizio salvato sul server, quindi regge allo schermo
   bloccato, a un'app chiusa per sbaglio e a più dispositivi aperti insieme.
   - **Recupero.** Allo scadere dei 35 minuti il timer continua e mostra
     "35+2'". Il manager può indicare il recupero annunciato (+1 … +5).
   - **Fine tempo e intervallo.** "Fine primo tempo" avvia il conto alla
     rovescia dell'intervallo; "Inizio secondo tempo" riparte da 35'.
   - **Time-out.** Un tasto per tempo, da 60 secondi, come da regolamento.
     Resta disattivato dopo l'uso.
3. **Eventi con un tocco.** Grandi pulsanti in basso: **Goal**, **Goal
   avversario**, **Giallo**, **Rosso**, **Cambio**.
   - *Goal*: si sceglie il marcatore dai giocatori in campo, poi l'assist
     (facoltativo, "Nessun assist" in evidenza). Sono previsti anche "Autogol
     avversario" e "Non attribuito", che finiscono in `match_unattributed_stats`.
   - *Giallo*: si sceglie il giocatore. Al secondo giallo l'app propone il rosso
     automatico.
   - *Rosso*: il giocatore esce dal campo e non può più rientrare.
   - Ogni evento registra il minuto (es. 23', 35+1', 52'). L'ultimo evento ha
     sempre "Annulla": l'errore si corregge senza uscire dalla modalità.
4. **Cambi.** Si tocca chi esce e poi chi entra; il minuto è automatico.
   - Valgono i limiti del regolamento: massimo 3 cambi nel primo tempo,
     illimitati nell'intervallo, 7 nel secondo tempo. I cambi sono "multipli e
     ripetitivi", quindi chi è uscito può rientrare. Superato il limite l'app
     avvisa ma non blocca (decide l'arbitro).
   - Ogni cambio controlla la quota U35 in campo con la stessa regola già usata
     dal builder formazione.
   - Un espulso non può entrare.
5. **Fine partita.** "Fischio finale" mostra un riepilogo modificabile:
   risultato, marcatori, assist, cartellini e minuti giocati per giocatore.
   "Conferma" esegue in un'unica RPC:
   - aggiorna `events` (`gol_nostri`, `gol_avversario`, `giocata`);
   - scrive i totali in `match_player_stats` (goal, assist, gialli, rossi);
   - propone il check-in ufficiale a chi è sceso in campo (`event_checkins`);
   - apre il Chigio d'Oro all'orario reale di fine gara.

### Per chi non è in panchina

- **Live in sola lettura** nella pagina evento e nella capsula della home:
  risultato, minuto e cronaca (goal, cartellini, cambi), aggiornati in realtime.
- **Push sui goal** (opzionale, nuovo tipo in `notification_preferences`):
  "Goal Chigi! Rossi 23' (assist Bianchi) · 1-0".
- **Cronaca da condividere**: un testo pronto per WhatsApp, come per le
  convocazioni.

### Modello dati proposto

- `match_sessions` (una riga per evento): stato (`NOT_STARTED`, `LIVE`,
  `HALFTIME`, `FINISHED`), tempo corrente, `period_started_at`, durata del tempo,
  recupero annunciato, time-out usati.
- `match_timeline` (un evento per riga): tipo (`GOAL`, `GOAL_AGAINST`,
  `OWN_GOAL_FOR`, `UNATTRIBUTED_GOAL`, `YELLOW`, `RED`, `SUB`, `PERIOD_START`,
  `PERIOD_END`, `TIMEOUT`), tempo, minuto, `occurred_at`, giocatore, assist,
  giocatore entrato e uscito, autore, `voided_at` per l'annullamento.
- I minuti giocati si ricavano dai cambi: è una nuova statistica stagionale
  ("minuti in campo").
- Scrittura riservata ai manager tramite RPC `security definer`, come per
  `set_event_checkin`; lettura per gli associati. I test pgTAP riprendono quelli
  di `rls-roles`.

### Rete scarsa al campo

Ogni tocco viene salvato prima in locale (IndexedDB) con il suo orario e inviato
appena c'è rete; il server accetta un `occurred_at` del client entro limiti
ragionevoli. Un indicatore mostra "3 eventi da inviare". È la stessa base
dell'offline (sezione 4).

### Fasi di rilascio

| Fase | Contenuto | Stima |
|------|-----------|-------|
| MP1 | Timer con recupero, intervallo e time-out; goal, assist, gialli e rossi; annulla; fischio finale che scrive risultato e `match_player_stats`. | 3–4 giorni |
| MP2 | Cambi con limiti del regolamento, controllo U35, minuti giocati, check-in proposto. | 2–3 giorni |
| MP3 | Live per tutti, push sui goal, cronaca WhatsApp, coda offline. | 3–4 giorni |

### Collegati

- **Squalifiche e diffide**: il regolamento squalifica dopo un rosso (gara
  successiva) e alla terza ammonizione. Con i cartellini registrati in modalità
  partita, il builder formazione segnala "squalificato" e "diffidato".

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
- `scripts/sql/reopen-chigio-madama-2026-10-22.sql`: va rimosso dopo averlo
  eseguito.

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
