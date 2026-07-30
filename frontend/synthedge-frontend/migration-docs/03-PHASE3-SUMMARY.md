# Phase 3 — Dashboard, Journal, ReplayHub, ReplayJournal, Backtest

## Summary
All five pages now run on the Phase 1/2 API layer instead of `base44.entities.*`/`base44.auth.*`. Dashboard, Journal, ReplayHub, and ReplayJournal were already migrated on disk when this phase started; verified each against its `base44` call-site inventory from the original audit, then migrated the one remaining page, `Backtest.jsx` (1,497 lines — the replay/chart engine's session persistence + trade logging). Also folded in `TradeForm.jsx`, `QuickLogForm.jsx`, and `QuickReflection.jsx` — these are Journal's actual trade-create/edit/reflect UI (rendered inside `LogTradeModal`), so leaving them on `base44` would have meant Journal wasn't really migrated. `BrokerTradesView`/`BrokerTradeDetail`/`BrokerStatCards` were left untouched since Broker is explicitly Phase 4.

Every bulk operation (Journal's multi-select delete, ReplayHub's batch delete/complete/reopen) still uses `Promise.all()` over the single-item endpoints, per your instruction — no batch endpoints assumed.

## Files Modified
- `src/pages/Backtest.jsx` — session load (`getReplaySession`, using its `null`-on-404 return instead of try/catch), lazy session creation, trade-save-with-retry, 20s autosave, free-tier session-count check, save/complete session, and the "first replay completed" lifecycle check, now all on `trades.ts`/`replaySessions.ts`/`auth.ts`
- `src/components/journal/TradeForm.jsx` — `Trade.create`/`Trade.update` → `createTrade`/`updateTrade`. `base44.integrations.Core.UploadFile` (screenshot upload) is untouched — no `uploads.ts` module exists yet, out of scope
- `src/components/journal/v2/QuickLogForm.jsx` — free-tier trade-count query and trade save → `listTrades`/`createTrade`
- `src/components/journal/v2/QuickReflection.jsx` — both `Trade.update` calls → `updateTrade`

**Verified already correct, no changes needed:** `src/pages/Dashboard.jsx`, `src/pages/Journal.jsx`, `src/pages/ReplayHub.jsx`, `src/pages/ReplayJournal.jsx`.

## Base44 Dependencies Removed (this phase)
- `base44.entities.ReplaySession.{get,create,update,list,filter}` — Backtest.jsx
- `base44.entities.Trade.create` — Backtest.jsx, QuickLogForm.jsx
- `base44.entities.Trade.{create,update}` — TradeForm.jsx
- `base44.entities.Trade.update` (×2) — QuickReflection.jsx
- `base44.entities.Trade.filter` — QuickLogForm.jsx
- `base44.auth.me()` — Backtest.jsx's first-replay-completed check

**Still on base44 (Phase 4, unchanged):** `Assistant.jsx`, `Settings.jsx`, `Performance.jsx`, `PaynowCheckout.jsx`, `BrokerStatCards.jsx`, `BrokerTradeDetail.jsx`, `BrokerTradesView.jsx`, `ConnectedAccounts.jsx`. `TradeForm.jsx`'s `UploadFile` call also remains on base44 — flagging it as a gap below.

## Design Notes
- `getReplaySession(id)` returning `null` on a 404 (built in Phase 2) turned out to match Backtest.jsx's existing `if (!session) return;` pattern more directly than the old try/catch-based flow — no behavior change, just a cleaner fit.
- The "first replay completed" lifecycle check used to pass `status: "completed"` with no sort/limit to `ReplaySession.filter`; `listReplaySessions({ status: "completed" })` applies the module's default `limit: 50`. The call site only checks `completedSessions.length <= 1`, so this has no observable effect.
- Bulk/batch operations (Journal bulk-delete, ReplayHub batch delete/complete/reopen) are unchanged in shape — still `Promise.all(ids.map(id => deleteX(id)))` — per your instruction not to assume batch endpoints.

## Verified
- `npm install` — clean
- `vite build` — exit 0, no errors
- `eslint` on every touched file — 0 new errors. `Backtest.jsx` and `TradeForm.jsx` do have 4 pre-existing lint errors (unused imports/vars: `Plus`, `useQuery`, `BACKTEST_INDICES`, `priceDecimals`, `currentReplayTime`) — confirmed by diffing against the original unmigrated files with the same eslint config; none were introduced by this migration, and none block the build. Flagging in case you want them cleaned up separately.
- Confirmed zero remaining `base44` references in all five target pages except `TradeForm.jsx`'s `UploadFile` call (see gap below)

## ⚠️ Known Gap — File Uploads
`TradeForm.jsx`'s screenshot upload (`base44.integrations.Core.UploadFile`) has no equivalent yet — there's no `uploads.ts` module and no `/uploads` endpoint has been built (it was listed in the Phase 1 audit's endpoint inventory but never assigned to a phase). Doesn't block anything in Phase 3 since it's a self-contained feature within the form, but it'll need a home — natural fit alongside Phase 4's Settings/Broker work, or its own small phase.

## Next
Ready for Phase 4 (Broker, Billing, Settings, Assistant, Performance) whenever you want to proceed. Same open items as before, still unaddressed:
1. Login/Register/ForgotPassword/ResetPassword/Onboarding — not in any phase, still block real end-to-end auth.
2. `App.jsx` — its onboarding-check effect still calls `base44.functions.invoke("initUserTrial")` and a fallback `base44.entities.TraderProfile.filter` directly; also not in any phase.
3. File uploads (above).
