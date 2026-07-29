# Task 6 report — protected profiles and inline formations

## RED

- `PlayerRosterCard.test.tsx` failed because approved users had no player
  profile link.
- `TeamTitleBar.test.tsx` failed because mobile actions were not circular.
- `squadra/page.test.tsx` failed because association was not passed to the
  roster and the builder mounted after the roster without focus, collapse, or
  reduced-motion handling.
- `giocatore/[id]/page.test.tsx` failed because the route queried public player
  data before authorization, did not redirect denied viewers, and had no
  teammate/owner/manager visibility tiers.

## GREEN

- Focused privacy, team, and session tests: 5 files / 24 tests passed.
- Full Vitest suite: 20 files / 83 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

## Files

- `src/components/team/PlayerRosterCard.tsx`
- `src/components/team/PlayerRosterCard.test.tsx`
- `src/components/team/PublicTeam.tsx`
- `src/components/team/TeamTitleBar.tsx`
- `src/components/team/TeamTitleBar.test.tsx`
- `src/app/squadra/page.tsx`
- `src/app/squadra/page.test.tsx`
- `src/app/giocatore/[id]/page.tsx`
- `src/app/giocatore/[id]/page.test.tsx`

## Commit

`feat: protect player profiles and focus formations`

## Self-review

- Anonymous and unassociated sessions redirect before any season, player, or
  private query; approved teammates use only `get_player_profile`.
- Owner/manager private reads start only after the safe profile resolves.
  Membership, payment, certificate, and contact selects list the minimum
  rendered fields; none includes `note_mediche` or `*`.
- Owner attendance is self-only. Teammates issue no membership, payment,
  certificate, contact, event, or check-in query.
- The existing `FormationBuilder` is reused once for playground and official
  modes, directly between titlebar and roster. Publish refresh remains wired.
- `TeamTitleBar` now delegates presentation to `PageTitleBar`; its match
  capsule, disabled explanations, mobile tooltips, and desktop labels remain.

## Review fix round 1

- Tightened viewer-tier assertions to exact table sets: teammate queries only
  `seasons` plus the safe RPC; owner excludes contacts; manager excludes events
  and check-ins.
- Replaced the permissive season response with a filter-aware fake that records
  `eq`/`lte`/`gte`/`in`. Tests now prove both the date-based 2025/26 fallback
  and explicit `?season=2026-2027` slug resolution.
- Added safe RPC null and error states plus a deferred stale-response regression
  across player-id changes. The error assertion verifies database detail is not
  rendered.
- No production file changed in this round.
- Focused verification: 5 files / 28 tests passed.
- Full verification: 20 files / 87 tests passed.
- Lint, typecheck, and `git diff --check`: passed.

## Review fix round 2

- The stale safe-profile test now resolves and awaits the deferred request
  inside React `act`, so assertions run only after the late state-update path
  has flushed.
- No production file changed.
- Focused verification: 5 files / 28 tests passed.
- Full verification: 20 files / 87 tests passed.
- Lint, typecheck, and `git diff --check`: passed.
