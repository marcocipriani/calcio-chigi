# Navigation, player profiles, and seasonal statistics design

Date: 2026-07-29  
Status: approved design

## Goal

Make the main pages visually consistent, restore authenticated player profiles
with explicit privacy tiers, make tournament/statistics data season-aware, and
import the available 2025/26 Circolo Chigi statistics from Enjore without
inventing match-level history.

## Scope

This design covers:

- shared titlebars for Calendar, Team, Tournament, Statistics, Profile, and
  Management;
- responsive titlebar actions and the Calendar add-event FAB;
- conditional Tournament/Phase selectors;
- the Tournament communications action;
- the Team player-info action and formation-builder reveal;
- player-profile authorization and field visibility;
- manager activity indicators;
- seasonal and phase-filtered statistics;
- yellow/red-card capture for new matches;
- one-time Enjore import for 2025/26;
- regression and acceptance verification.

Event and player detail pages keep their compact back-navigation headers. This
work does not introduce a generic tournament-management framework.

## Shared titlebar

Add one `PageTitleBar` presentation component based on the current Calendar
hierarchy:

- 3xl page title;
- short subtitle or eyebrow;
- optional contextual content;
- right-aligned action slot;
- optional filter row immediately below the title row.

The component owns layout and responsive action styling, not page-specific
business logic.

Desktop actions show icon and text. Mobile actions remain in the titlebar but
become circular, icon-only, 44px targets with accessible names and tooltips.
The only floating action is Calendar's add-event action on mobile.

Page-specific behavior:

- **Calendar:** `+ Evento` is in the desktop titlebar. The mobile add-event
  control remains a circular FAB.
- **Team:** next-match context and formation actions remain in the titlebar.
- **Tournament:** communications and manager score-edit actions are in the
  titlebar; selectors occupy the filter row.
- **Statistics:** the season selector occupies the titlebar/filter area.
- **Profile:** logout remains a titlebar action.
- **Management:** season and quick actions use the common hierarchy without
  changing management behavior.

The global manager link is violet, is labelled `Gestione` on desktop, and is a
circular settings icon with tooltip on mobile.

## Tournament page

Treat the existing `seasons` records as tournament editions:

- `ASI Over 35 2026/27` is the explicit default;
- `ASI Over 35 2025/26` is the historical option.

This default is local to Tournament and Statistics. It must not change the
application-wide active-season rules used by roster, payments, certificates,
or onboarding.

`TournamentSelector` must stop being cosmetic. A tournament change filters
events by `events.season_id`, resets the selected phase/day, and derives the
available phases from that season's events and imported historical data.

Tournament and Phase selectors sit next to each other in one filter row. Phase
starts with `Tutte le fasi` and otherwise contains only phases available for
the selected edition. `Coppa Lazio` remains a phase. An edition with no events
or imported rows shows a proper empty state and never falls back to another
season's data.

With `Tutte le fasi`, Calendar may show matches grouped by phase. Standings
must not combine unrelated rounds or cups: the Classifica tab instead asks the
user to select one specific phase.

The `Comunicati` action uses icon plus text on desktop and a circular icon on
mobile. Its dialog behavior and external links remain unchanged.

## Team page and formation

The public roster remains readable without authentication.

Player cards expose an `i` action only when the current user has an approved,
associated profile. Anonymous users and signed-in but unassociated users see
neither the icon nor another hidden interactive link.

The `Crea la tua formazione` action uses the approved inline layout:

1. mount the existing `FormationBuilder` directly below `TeamTitleBar`;
2. move focus to its heading/container;
3. perform a short smooth scroll that respects reduced-motion preference;
4. leave the roster immediately below the builder;
5. provide a clear close/collapse action.

The manager official-formation path uses the same location. No drawer, side
panel, or second builder implementation is introduced.

## Player-profile authorization

Hiding the card icon is not an authorization boundary. `/giocatore/:id` and
its data source require an approved associated account.

Visibility matrix:

| Viewer | Access |
| --- | --- |
| Anonymous | Public roster card only; no icon/link; direct detail denied |
| Signed in, unassociated | Same as anonymous; direct detail denied |
| Associated teammate | Name, avatar, role, shirt number, goals, assists, MVP, cards |
| Profile owner | Teammate fields plus own attendance, membership, payments, certificate |
| Manager | Teammate fields plus membership, payments, certificate, and operational contact data |

Medical notes remain exclusive to Management and are never rendered by the
player-detail page.

Add an authenticated-only `get_player_profile` RPC for the teammate-safe
projection. It first requires an approved associated profile, then returns only
the approved teammate fields. The function is `SECURITY DEFINER` with a fixed
`search_path`, an explicit association check, and a fixed return shape. Revoke
execution from `public` and `anon`; grant it only to `authenticated` and
`service_role`. Do not reuse a broader roster projection containing birth date,
department, or operational flags. Self and manager details continue to rely on
the existing table RLS for `season_memberships`, `profile_private_details`,
`payments`, and `medical_certificates`.

All entry points, including Statistics links and direct URLs, apply the same
gate. Client-side visibility is supplemental; database grants/RLS are the
source of truth. The detail page waits for session loading to finish and for
`isAssociated` to be true before issuing any player-detail query.

## Manager activity

The indicator represents last activity in this web app, not authentication
provider login time. Reuse `manager_activity.last_seen_at` and the existing
two-minute heartbeat.

States:

- green: heartbeat less than 3 minutes old;
- yellow: last activity from 3 minutes through 24 hours old;
- grey: more than 24 hours old or no activity row.

Use the existing tooltip component rather than a native `title`. Tooltip and
accessible label show the manager name and one of:

- `Online`;
- a relative value such as `Attivo 2 ore fa`;
- `Mai attivo`.

The grey visual may cover both stale and never active; the tooltip must
distinguish them.

## Statistics model

### Current detailed data

Extend `match_player_stats` with:

- `yellow_cards integer not null default 0 check (yellow_cards >= 0)`;
- `red_cards integer not null default 0 check (red_cards >= 0)`.

Managers record both values in the existing official match-stat workflow next
to goals and assists. Existing requirements remain:

- manager-only writes;
- the event is an official match;
- the player is officially present;
- no negative values.

Current-season totals are derived from detailed event data joined through
`events.season_id` and normalized `events.fase`; legacy `null` phases normalize
to `FASE_1`. MVP continues to derive from `match_awards`.

### Historical aggregate data

Do not create synthetic events or insert aggregate Enjore values into
`match_player_stats`. Those tables require event attribution and official
presence that Enjore's aggregate page cannot provide.

Add one narrow `historical_player_stats` table:

- `season_id uuid not null`;
- `phase_key text not null`;
- `profile_id uuid not null`;
- `goals integer not null default 0`;
- `mvp integer not null default 0`;
- `yellow_cards integer not null default 0`;
- `red_cards integer not null default 0`;
- `source_url text not null`;
- `imported_at timestamptz not null default now()`.

Statistic values have non-negative checks. Foreign keys reference `seasons`
and `profiles`. The unique key is `(season_id, phase_key, profile_id)`. RLS is
enabled; clients receive no direct table grant and only `service_role` writes
the table. Store only phase rows, never both phase rows and a season-total row.
Season totals are sums of the phase rows. `phase_key` accepts only `FASE_1`,
`FASE_2_CALCIATORI`, `FASE_2_PROFESSIONISTI`, and
`COPPA_LAZIO_PROFESSIONISTI`.

Add a public-safe `public_player_statistics_by_phase` view. It combines
detailed live aggregates and historical rows without directly joining
independent one-to-many stat/award sources. It exposes `season_id`,
`phase_key`, `profile_id`, goals, nullable assists, MVP, yellow cards, and red
cards. Season totals are calculated by summing its phase rows in the
application. When a historical row exists for a season/phase/profile, that row
is authoritative and the matching detailed aggregate is suppressed. The view
contains no private player fields and receives only the existing intentional
public read grant.

Add a public-safe `public_season_player_directory` projection keyed by
`season_id`. Statistics must use this projection rather than
`public_active_roster`, because the latter follows the date-based active
season. The projection exposes only player identity, avatar, role, and shirt
number. It includes selected-season `PLAYER` memberships with `YES`/`MAYBE`
status plus profiles that have official/imported statistics for that season,
so a historical scorer is not lost after leaving the roster.

### Statistics page

The page defaults explicitly to `2026/27`.

- `2026/27`: goals, assists, MVP, yellow cards, red cards, and training
  attendance begin at zero and update from official event data.
- `2025/26`: goals, MVP, yellow cards, and red cards come from the historical
  import. Assists render `—`; training attendance renders
  `Dati non disponibili`.

Remove the `Pubbliche` and `Login` pills. Tournament statistics and training
attendance are side by side on wide viewports and stacked otherwise.
Attendance remains restricted to approved associated accounts.

The filter row includes season and a dependent phase selector. Season affects
both Tournament and training attendance; phase affects only Tournament
statistics because training events have no tournament phase. Add
sortable/ranked views for MVP, yellow cards, and red cards. The Enjore
`Miglior giocatore` point value is named `MVP` in this application, as
explicitly approved.

The typed season option metadata explicitly marks whether historical training
attendance exists. `2025/26` sets it to false; `2026/27` sets it to true.
Historical statistic rows return `assists: null`. UI code must preserve these
null/availability values rather than coalescing them to zero.

## Enjore 2025/26 import

The source is:

`https://asicalciolazio.enjore.com/it/t-player-stats/113994/campionato-asi-over-35_artimestieri/`

Implement a one-time repository script. It calls Enjore's public statistics
endpoint for the four 2025/26 phase IDs and the three required classifications:

- goals (`score`);
- MVP (`top-player`);
- discipline (`discipline`).

Phase mapping is fixed:

- `263752` → `FASE_1`;
- `265281` → `FASE_2_CALCIATORI`;
- `265282` → `FASE_2_PROFESSIONISTI`;
- `265296` → `COPPA_LAZIO_PROFESSIONISTI`.

The script:

1. downloads and parses every required response;
2. retains only rows whose team normalizes to `CIRC. CHIGI`;
3. maps abbreviated Enjore names by normalized surname plus first-name initial;
4. supports a small explicit override map only where the automatic mapping is
   ambiguous;
5. refuses to continue on unmatched or ambiguous rows;
6. limits candidates to `PLAYER` memberships in season `2025/26` and never
   creates player profiles;
7. prints a dry-run preview of every mapping and value;
8. sends the validated rows to one service-role-only
   `import_historical_player_stats(jsonb)` RPC, whose database transaction
   validates the exact incoming set, replaces all existing 2025/26 imported
   rows, and inserts the new set atomically;
9. records the source URL and import time;
10. verifies that phase sums match the all-phases Enjore totals.

Network, HTTP, response-shape, parsing, mapping, or verification failures happen
before mutation. A database failure rolls back the entire import. Re-running a
successful import produces the same rows and totals.

The importer does not reconstruct match-by-match scorers or cards because the
source page does not expose that attribution. It does not import goalkeeper
rankings because they are outside the approved statistics set.

## Error and empty states

- Direct player detail without an approved association is denied without
  leaking private-field availability.
- Missing player-safe data shows a not-found/error state, not a partially
  public profile.
- A selected season with no phases or events shows an edition-specific empty
  state.
- Historical unavailable metrics render `—` or `Dati non disponibili`, never
  zero.
- Current-season available-but-empty metrics render zero.
- Import failures report the exact phase, classification, and mapping involved.

## Verification

### Database

- anonymous and unassociated users cannot execute/read player-detail data;
- associated users receive only the approved teammate projection;
- self/manager access matches the visibility matrix;
- medical notes never enter the player-detail projection;
- card constraints and manager-only writes hold;
- official-presence validation still applies;
- season and phase filters do not leak or duplicate data;
- historical phase sums produce one season total;
- an empty 2026/27 returns valid zero totals.

### Importer

Use checked-in response fixtures for all three classifications and four phases.
Tests cover:

- Chigi-only filtering;
- normalization and name matching;
- ambiguous/unmatched refusal;
- correct goal/MVP/yellow/red extraction;
- phase-to-total reconciliation;
- idempotent second execution;
- no partial writes after an error.

### UI and integration

- info icon absent for anonymous/unassociated users and present for associated
  users;
- direct URL and Statistics entry points enforce the same player gate;
- self, teammate, and manager render only their allowed sections;
- tournament change resets invalid phase/day state;
- phase options are conditional;
- 2026/27 starts empty;
- 2025/26 unavailable attendance is not shown as zero;
- formation appears below the titlebar and receives focus;
- shared titlebars render desktop labels and 44px circular mobile actions;
- Calendar never shows both desktop add action and mobile FAB;
- presence state boundaries cover 3 minutes, 24 hours, and never active.

Final gates:

- pgTAP database tests;
- Vitest component/unit tests;
- TypeScript typecheck;
- ESLint;
- production build;
- Playwright flows for anonymous, associated player, self, and manager on
  desktop/mobile.

## Explicit non-goals

- generic tournament administration;
- runtime or scheduled Enjore synchronization;
- synthetic historical match events;
- guessed assists or training attendance;
- goalkeeper ranking import;
- medical-note exposure outside Management;
- all actions becoming floating buttons.
