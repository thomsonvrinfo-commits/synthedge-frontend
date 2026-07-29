# Phase 4 — Broker, Billing, Settings, Assistant, Performance

## Summary
Built the two remaining API modules (`broker.ts`, `billing.ts`) and migrated every page and component in this phase's scope off `base44.entities.*`/`base44.functions.invoke(...)`. This closes out the four-phase plan — Dashboard/Journal/ReplayHub/ReplayJournal/Backtest/Settings/Assistant/Performance/Broker/Billing are all now on the typed API layer. What's left is a small, previously-flagged set of files outside any phase (listed below), not new scope creep.

## Files Created
- `src/api/broker.ts` — `listConnections`, `connectDeriv`, `connectMt5`, `disconnectBroker`, `listBrokerTrades`, `updateBrokerTrade`
- `src/api/billing.ts` — `pollPaynow`

## Files Modified
- `src/pages/Settings.jsx` — profile fetch/create/update, trading rules CRUD (incl. the "load default rules" bulk-create loop)
- `src/pages/Assistant.jsx` — trades + profile fetch
- `src/pages/Performance.jsx` — broker connections + broker trades fetch
- `src/pages/PaynowCheckout.jsx` — `pollPaynow` invoke only (see note below)
- `src/components/settings/ConnectedAccounts.jsx` — connections fetch, connect Deriv/MT5, disconnect
- `src/components/dashboard/v2/BrokerStatCards.jsx` — connections + broker trades fetch
- `src/components/journal/BrokerTradeDetail.jsx` — broker trade note/emotion-tag update
- `src/components/journal/BrokerTradesView.jsx` — connections + live broker trades fetch

## Base44 Dependencies Removed (this phase)
- `base44.entities.TraderProfile.*`, `base44.entities.TradingRule.*`, `base44.functions.invoke("updateTraderProfile")` — Settings.jsx
- `base44.entities.Trade.filter`, `base44.entities.TraderProfile.filter` — Assistant.jsx
- `base44.entities.BrokerConnection.filter`, `base44.entities.BrokerTrade.filter` — Performance.jsx, BrokerStatCards.jsx, BrokerTradesView.jsx
- `base44.entities.BrokerTrade.update` — BrokerTradeDetail.jsx
- `base44.functions.invoke("connectDeriv"/"connectMt5"/"disconnectBroker")` — ConnectedAccounts.jsx
- `base44.functions.invoke("pollPaynow")` — PaynowCheckout.jsx

## Important: PaynowCheckout.jsx Nuance
`handlePaynow()` (the "Pay with Paynow" button) was **already** calling a separate, already-deployed Cloudflare Worker directly (`https://synthedge-paynow.thomsonvr-info.workers.dev/`) — it never went through Base44 at all. Only the return-flow status poll used `base44.functions.invoke("pollPaynow", ...)`, and that's the only part this phase touched. The initiate call is left completely untouched, per "treat the backend as an external service" — it isn't a Base44 dependency and isn't part of the new unified backend either, so there's nothing to migrate there.

## New Architecture / Design Notes
- `broker.ts` documents that the sensitive parts of connect/disconnect (Deriv token AES-GCM encryption, MetaAPI provisioning, credential revocation) are server-side responsibilities today and stay that way — the module just calls the endpoints, it doesn't reimplement any of that logic client-side.
- `ConnectedAccounts.jsx` had local handler functions also named `connectDeriv`/`connectMt5` — aliased the API imports (`connectDeriv as apiConnectDeriv`, etc.) rather than renaming the component's existing handlers, to keep the diff minimal.
- Cache keys are all unchanged: `["brokerConnections", uid]`, `["brokerTrades", uid]`, `["traderProfile", uid]`, `["tradingRules", uid]` — including the two pre-existing inconsistencies (Settings.jsx and Assistant.jsx use `["traderProfile", uid]` rather than the `["currentProfile", uid]` key everywhere else uses) — preserved as-is rather than "fixed," since normalizing it wasn't asked for and touches cache behavior outside this phase's scope.

## Verified
- `npm install` — clean
- `vite build` — exit 0, no errors
- `eslint` on every touched file — 0 new errors. 5 warnings/errors found (`ConnectedAccounts.jsx`'s unused `res`, `Assistant.jsx`'s unused `profiles`, `Settings.jsx`'s unused `useMutation`/`Textarea`/`Target` imports) — confirmed pre-existing by diffing against the original unmigrated files with the same eslint config; none introduced by this migration.
- Confirmed zero remaining `base44` references in every file this phase touched

## Remaining Base44 References (project-wide, none new this phase)
```
src/api/base44Client.js          — the SDK client itself; removable once every consumer is gone
src/lib/app-params.js            — reads Base44 app id/token from URL/localStorage
src/pages/Login.jsx               ┐
src/pages/Register.jsx            │  flagged since Phase 1 — not in any phase,
src/pages/ForgotPassword.jsx      │  still block real end-to-end auth against
src/pages/ResetPassword.jsx       │  the new backend
src/pages/Onboarding.jsx          ┘
src/App.jsx                      — flagged since Phase 3 — initUserTrial + a fallback TraderProfile fetch
src/components/layout/Sidebar.jsx — flagged since Phase 1 — logout button bypasses AuthContext.logout()
src/lib/lifecycleEvents.js        — email-resolution fallback calls base44.auth.me()
src/lib/PageNotFound.jsx          — same auth.me() fallback pattern
src/components/journal/TradeForm.jsx — flagged since Phase 3 — screenshot UploadFile, no uploads.ts built yet
src/hooks/useCurrentUser.js       — comment only, no actual dependency
```

## Migration Status
All four planned phases are complete. Every page and component that reads/writes application data (trades, replay sessions, trading rules, profile, broker connections/trades, subscription poll) now goes through the typed `src/api/` layer instead of the Base44 SDK. What's left is the auth-page cluster and a few small orphaned touchpoints — all previously flagged, not discovered fresh this phase.

## Suggested Next Step
There's no Phase 5 on the books, but the remaining list above is small and mostly one shape of problem: **Login/Register/ForgotPassword/ResetPassword/Onboarding/App.jsx/Sidebar.jsx/lifecycleEvents.js/PageNotFound.jsx all touch `base44.auth`**, and migrating them together would let `base44Client.js`, `app-params.js`, and the `@base44/sdk`/`@base44/vite-plugin` dependencies come out of `package.json` entirely. `TradeForm.jsx`'s upload is a separate, smaller piece of work (needs an `uploads.ts` + `/uploads` endpoint). Let me know if you'd like either as a follow-up.
