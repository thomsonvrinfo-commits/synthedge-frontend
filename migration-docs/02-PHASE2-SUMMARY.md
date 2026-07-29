# Phase 2 — Trades / Trading Rules / Replay Sessions API Layer

## Summary
Added three typed API modules covering every `Trade`, `TradingRule`, and `ReplaySession` operation the frontend currently performs. Also swapped `AuthContext`'s workspace prefetch (flagged as deferred in the Phase 1 summary) over to them, since that block lives in an already-migrated file and uses the exact same cache keys. No page component was touched — Dashboard, Journal, Assistant, Settings, ReplayHub, ReplayJournal, Backtest, QuickLogForm, QuickReflection, and TradeForm all still call `base44.entities.*` directly and are unchanged, per Phase 3/4.

## Files Created
- `src/api/trades.ts` — `listTrades`, `createTrade`, `updateTrade`, `deleteTrade`
- `src/api/tradingRules.ts` — `listTradingRules`, `createTradingRule`, `updateTradingRule`, `deleteTradingRule`
- `src/api/replaySessions.ts` — `listReplaySessions`, `getReplaySession`, `createReplaySession`, `updateReplaySession`, `deleteReplaySession`

Each file's header comment includes a `base44 call → this module` mapping table built from every real call site in the current codebase, so the Phase 3 page migrations are close to 1:1 swaps rather than a redesign.

## Files Modified
- `src/context/AuthContext.jsx` — the workspace-prefetch block (`["trades", uid]`, `["tradingRules", uid]`, `["replaySessions", uid]`) now calls `listTrades`/`listTradingRules`/`listReplaySessions` instead of `base44.entities.*`. Cache keys and default limits (500 / 50 / 50) are unchanged, so this is invisible to any page reading from those keys.

## Base44 Dependencies Removed (this phase)
- `base44.entities.Trade.filter`, `base44.entities.TradingRule.filter`, `base44.entities.ReplaySession.filter` — but only inside `AuthContext`'s prefetch. The `base44` import has been dropped from that file entirely.

**Still on base44 (Phase 3/4, unchanged):** every direct entity call inside `Dashboard.jsx`, `Journal.jsx`, `Assistant.jsx`, `Settings.jsx`, `ReplayHub.jsx`, `ReplayJournal.jsx`, `Backtest.jsx`, `QuickLogForm.jsx`, `QuickReflection.jsx`, `TradeForm.jsx`.

## New Architecture / Design Notes
- **Owner scoping dropped.** `created_by_id: user.id` filters disappear — ownership is implicit from the JWT on every new endpoint, same convention as `api/profile.ts` from Phase 1.
- **`dataset` filter kept explicit.** `listTrades({ dataset: "BACKTEST" | "LIVE", limit, sort })` — the only non-owner filter field actually used on `Trade` today (by `ReplayHub.jsx` and `QuickLogForm.jsx`).
- **`status` filter kept explicit on replay sessions.** `listReplaySessions({ status: "completed" })` — used once, in `Backtest.jsx`'s "first replay completed" lifecycle check.
- **No batch endpoints invented.** `Journal.jsx`'s bulk trade delete and `ReplayHub.jsx`'s batch delete/complete/reopen currently loop `Promise.all(ids.map(id => base44.entities.X.delete(id)))` client-side. `deleteTrade`/`updateReplaySession`/`deleteReplaySession` are single-item, matching what's actually there — Phase 3 keeps the same loop, just calling the new functions.
- **`getReplaySession(id)` returns `null` on 404** instead of throwing, mirroring the `getMyProfile()` pattern from Phase 1, since `Backtest.jsx`'s session-load effect already treats "no session" as a valid, silent case (`if (!session) return;`).

## Backend Endpoints Required (Phase 2)
```
GET    /trades?dataset=&limit=&sort=
POST   /trades
PATCH  /trades/:id
DELETE /trades/:id

GET    /trading-rules?limit=&sort=
POST   /trading-rules
PATCH  /trading-rules/:id
DELETE /trading-rules/:id

GET    /replay-sessions?status=&limit=&sort=
GET    /replay-sessions/:id
POST   /replay-sessions
PATCH  /replay-sessions/:id
DELETE /replay-sessions/:id
```
All derived from existing call sites — nothing invented beyond the `dataset`/`status` filters, which the frontend already sends today.

## Verified
- `npm install` — clean
- `vite build` — exit 0, no errors
- `eslint` on all new/touched files — 0 errors (same pre-existing config-glob warning as Phase 1, unrelated)
- Confirmed zero remaining `base44` references in `AuthContext.jsx`

## Next
Ready for Phase 3 (migrate Dashboard, Journal, ReplayHub, ReplayJournal, Backtest onto `trades.ts` / `tradingRules.ts` / `replaySessions.ts`) whenever you want to proceed. Two things worth a decision before or during that phase:
1. Where Login/Register/ForgotPassword/ResetPassword land (still flagged from Phase 1 — they block real end-to-end auth against the new backend).
2. Journal's bulk-delete and ReplayHub's three batch operations are prime candidates for real batch endpoints (`POST /trades/bulk-delete`, etc.) instead of N sequential requests — flagging for the backend team now in case they want to add them before Phase 3 wires the pages up, but not assuming it without confirmation.
